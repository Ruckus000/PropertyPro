# Demo Lifecycle Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the demo lifecycle — public landing page, demo-to-customer conversion via Stripe, and automated demo expiry enforcement (audit codes C-01/C-02/C-03, D-01/D-02, D-04).

**Architecture:** Three features share the `demo_instances` + `communities` tables. A public landing page replaces HMAC token URLs. A conversion endpoint creates Stripe checkout tied to the existing demo community, with a webhook handler that upgrades in-place. A cron job soft-deletes expired demos daily.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Supabase Auth (admin API), Stripe Checkout, Vercel Cron

**Spec:** `docs/superpowers/specs/2026-03-22-demo-lifecycle-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/db/migrations/0113_demo_lifecycle.sql` | Migration: add `deleted_at` to demo_instances, backfill `demo_expires_at` |
| `apps/web/src/lib/services/demo-session.ts` | Shared helper: magic link generation → OTP verify → session cookies |
| `apps/web/src/app/demo/[slug]/page.tsx` | Public demo landing page (server component) |
| `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts` | Demo entry: look up demo, create session, redirect |
| `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` | Conversion: create Stripe checkout for demo upgrade |
| `apps/web/src/app/demo/[slug]/converted/page.tsx` | Post-conversion success page |
| `apps/web/src/app/api/v1/internal/expire-demos/route.ts` | Cron: soft-delete expired demos |
| `apps/web/src/lib/services/demo-conversion.ts` | Webhook handler logic for demo conversion + founding user |

### Modified Files
| File | Change |
|------|--------|
| `packages/db/src/schema/demo-instances.ts` | Add `deletedAt`, type `theme` JSONB |
| `packages/db/migrations/meta/_journal.json` | Add idx 113 entry |
| `apps/web/src/app/api/v1/auth/demo-login/route.ts` | Extract session logic to shared helper; add expiry check |
| `apps/web/src/middleware.ts` | Add `startsWith` case for `/api/v1/demo/` + `/enter`; add cron to TOKEN_AUTH_ROUTES |
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Refactor signupRequestId guard; add conversion branch |
| `scripts/verify-scoped-db-access.ts` | Add 5 new paths to WEB_UNSAFE_IMPORT_ALLOWLIST |
| `apps/web/vercel.json` | Add expire-demos cron entry |
| `.env.example` | Add `DEMO_EXPIRY_CRON_SECRET` |
| `apps/admin/src/app/api/admin/demos/route.ts` | Set `demo_expires_at` on creation |
| `apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx` | Copy landing page URL |
| `apps/admin/src/app/demo/[id]/preview/page.tsx` | Pass landing page URL prop |

---

## Task 1: Migration + Schema

**Files:**
- Create: `packages/db/migrations/0113_demo_lifecycle.sql`
- Modify: `packages/db/src/schema/demo-instances.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration file**

```sql
-- 0113_demo_lifecycle.sql
-- Add soft-delete to demo_instances (schema convention: all tenant-scoped tables)
ALTER TABLE demo_instances
  ADD COLUMN deleted_at timestamptz;

-- Backfill demo_expires_at for existing demos (30-day default)
UPDATE communities c
SET demo_expires_at = di.created_at + interval '30 days'
FROM demo_instances di
WHERE di.seeded_community_id = c.id
  AND c.is_demo = true
  AND c.demo_expires_at IS NULL;
```

- [ ] **Step 2: Update Drizzle schema**

In `packages/db/src/schema/demo-instances.ts`, add `deletedAt` column and type the `theme` JSONB:

```typescript
// Add this type above the table definition
export type DemoTheme = {
  logoPath?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
};

// In the table definition, change:
//   theme: jsonb('theme').notNull(),
// To:
//   theme: jsonb('theme').notNull().$type<DemoTheme>(),

// Add after customizedAt:
//   deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

- [ ] **Step 3: Update migration journal**

Add to `packages/db/migrations/meta/_journal.json` entries array:
```json
{
  "idx": 113,
  "version": "7",
  "when": 1774260000000,
  "tag": "0113_demo_lifecycle",
  "breakpoints": true
}
```

- [ ] **Step 4: Run migration**

```bash
pnpm --filter @propertypro/db db:migrate
```
Expected: Migration applies cleanly. `demo_instances` has new `deleted_at` column.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS. The `DemoTheme` type may surface type errors in admin app code that accesses `theme` — fix any that appear.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0113_demo_lifecycle.sql packages/db/migrations/meta/_journal.json packages/db/src/schema/demo-instances.ts
git commit -m "feat(db): add deleted_at to demo_instances, backfill demo_expires_at

Migration 0113: adds soft-delete column to demo_instances (schema
convention) and backfills demo_expires_at for existing demo communities
with 30-day default from creation date."
```

---

## Task 2: Extract Shared Demo Session Helper

**Files:**
- Create: `apps/web/src/lib/services/demo-session.ts`
- Modify: `apps/web/src/app/api/v1/auth/demo-login/route.ts`

- [ ] **Step 1: Create the shared helper**

Extract the session creation logic from `demo-login/route.ts` (lines 226-285). The helper takes a user email and returns session cookies + redirect response.

```typescript
// apps/web/src/lib/services/demo-session.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getCookieOptions } from '@propertypro/db/supabase/cookie-config';

export type DemoSessionResult =
  | { ok: true; cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> }
  | { ok: false; error: string };

/**
 * Creates an authenticated Supabase session for a demo user via server-side
 * magic link generation and OTP verification. Returns session cookies to
 * attach to the response.
 *
 * Extracted from demo-login/route.ts to share between demo-login (HMAC token
 * flow) and demo/[slug]/enter (direct session flow).
 */
export async function createDemoSession(email: string): Promise<DemoSessionResult> {
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[demo-session] Failed to generate magic link:', linkError?.message);
    return { ok: false, error: 'session_error' };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[demo-session] Missing Supabase env vars');
    return { ok: false, error: 'session_error' };
  }

  const cookieStore = await cookies();
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push(cookie);
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // May fail in some contexts; replayed onto response below
          }
        }
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('[demo-session] OTP verification failed:', verifyError.message);
    return { ok: false, error: 'session_error' };
  }

  return { ok: true, cookies: pendingCookies };
}
```

- [ ] **Step 2: Refactor demo-login to use the shared helper**

In `apps/web/src/app/api/v1/auth/demo-login/route.ts`, replace lines 226-276 with a call to `createDemoSession(email)`. Keep the response construction (redirect vs preview HTML) in the route handler — only the session creation moves to the helper.

```typescript
// Replace the magic link + OTP block with:
import { createDemoSession } from '@/lib/services/demo-session';

const sessionResult = await createDemoSession(email);
if (!sessionResult.ok) {
  return loginError(trustedBaseUrl, sessionResult.error);
}

// Keep existing redirect logic:
const isPreview = url.searchParams.get('preview') === 'true';
const response = isPreview
  ? createPreviewRedirectResponse(redirectTo)
  : createRedirectResponse(redirectTo);
for (const cookie of sessionResult.cookies) {
  response.cookies.set(cookie.name, cookie.value, cookie.options);
}
return response;
```

- [ ] **Step 3: Add expiry check to demo-login route**

The existing query in demo-login selects from `demoInstances` only (no join to communities). Add a follow-up query after looking up the demo instance to check expiry:

```typescript
// After the demo instance lookup (around line 155), add:
if (instance?.seededCommunityId) {
  const [community] = await db
    .select({ demoExpiresAt: communities.demoExpiresAt })
    .from(communities)
    .where(eq(communities.id, instance.seededCommunityId))
    .limit(1);

  if (community?.demoExpiresAt && new Date(community.demoExpiresAt) < new Date()) {
    return loginError(trustedBaseUrl, 'demo_expired');
  }
}
```

This adds the `communities` import and a separate query rather than modifying the existing demo_instances query (which is tightly coupled to the anti-enumeration pattern and should not be restructured).

- [ ] **Step 4: Run existing tests**

```bash
pnpm test
```
Expected: All existing tests pass. The demo-login route behavior is unchanged — same inputs produce same outputs.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/demo-session.ts apps/web/src/app/api/v1/auth/demo-login/route.ts
git commit -m "refactor: extract demo session helper from demo-login route

Moves magic link generation + OTP verification into shared
createDemoSession() helper. Also adds demo_expires_at check
to demo-login route — expired demos now return error redirect."
```

---

## Task 3: Middleware + DB Access Guard + Env

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `scripts/verify-scoped-db-access.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update middleware**

In `apps/web/src/middleware.ts`, modify `isTokenAuthenticatedApiRoute()` (around line 120):

```typescript
function isTokenAuthenticatedApiRoute(request: NextRequest): boolean {
  // E-sign signing routes use dynamic segments
  if (request.nextUrl.pathname.startsWith('/api/v1/esign/sign/')) {
    return true;
  }

  // Demo entry route uses dynamic [slug] segment
  if (
    request.nextUrl.pathname.startsWith('/api/v1/demo/') &&
    request.nextUrl.pathname.endsWith('/enter') &&
    request.method.toUpperCase() === 'POST'
  ) {
    return true;
  }

  return TOKEN_AUTH_ROUTES.some(
    (route) =>
      request.nextUrl.pathname === route.path &&
      request.method.toUpperCase() === route.method,
  );
}
```

Add to `TOKEN_AUTH_ROUTES` array:
```typescript
{ path: '/api/v1/internal/expire-demos', method: 'POST' },
```

- [ ] **Step 2: Update DB access guard**

In `scripts/verify-scoped-db-access.ts`, add to `WEB_UNSAFE_IMPORT_ALLOWLIST`:

```typescript
// Demo lifecycle: landing page, entry, conversion, expiry cron, session helper
resolve(repoRoot, 'apps/web/src/app/demo/[slug]/page.tsx'),
resolve(repoRoot, 'apps/web/src/app/api/v1/demo/[slug]/enter/route.ts'),
resolve(repoRoot, 'apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts'),
resolve(repoRoot, 'apps/web/src/app/api/v1/internal/expire-demos/route.ts'),
resolve(repoRoot, 'apps/web/src/lib/services/demo-session.ts'),
resolve(repoRoot, 'apps/web/src/lib/services/demo-conversion.ts'),
```

- [ ] **Step 3: Update .env.example**

Add after `PAYMENT_REMINDERS_CRON_SECRET`:
```
DEMO_EXPIRY_CRON_SECRET=change-me
```

- [ ] **Step 4: Run guards**

```bash
pnpm guard:db-access
pnpm lint
```
Expected: Both pass. The guard won't flag the new files (they don't exist yet, guard only checks existing files).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/middleware.ts scripts/verify-scoped-db-access.ts .env.example
git commit -m "feat: middleware + DB guard + env for demo lifecycle routes

Adds startsWith match for /api/v1/demo/.../enter (public, no session).
Adds expire-demos cron to TOKEN_AUTH_ROUTES. Updates DB access guard
allowlist for 6 new files. Adds DEMO_EXPIRY_CRON_SECRET to .env.example."
```

---

## Task 4: Public Demo Landing Page

**Files:**
- Create: `apps/web/src/app/demo/[slug]/page.tsx`
- Test: manual (server component with DB query — integration test territory)

- [ ] **Step 1: Create the landing page**

```typescript
// apps/web/src/app/demo/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances } from '@propertypro/db';
import { communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { DemoTheme } from '@propertypro/db/schema/demo-instances';

export const dynamic = 'force-dynamic';

export default async function DemoLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = createUnscopedClient();

  const [demo] = await db
    .select({
      id: demoInstances.id,
      slug: demoInstances.slug,
      prospectName: demoInstances.prospectName,
      theme: demoInstances.theme,
      communityId: communities.id,
      communityName: communities.name,
      communityType: communities.communityType,
      demoExpiresAt: communities.demoExpiresAt,
      isDemo: communities.isDemo,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);

  if (!demo) return notFound();

  // Check expiry
  const isExpired = demo.demoExpiresAt && new Date(demo.demoExpiresAt) < new Date();

  if (isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Demo Expired</h1>
          <p className="mt-2 text-gray-600">
            This demo is no longer available. Contact us to schedule a new one.
          </p>
          <a
            href="https://propertyprofl.com"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Visit PropertyPro
          </a>
        </div>
      </div>
    );
  }

  const theme = demo.theme as DemoTheme;
  const primaryColor = theme?.primaryColor ?? '#2563eb';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        {theme?.logoPath && (
          <img
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${theme.logoPath}`}
            alt={demo.communityName}
            className="mx-auto mb-6 h-16 w-auto"
          />
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{demo.communityName}</h1>
        <p className="mt-1 text-sm text-gray-500">Interactive Demo</p>

        <div className="mt-8 flex flex-col gap-3">
          <form action={`/api/v1/demo/${slug}/enter`} method="POST">
            <input type="hidden" name="role" value="board" />
            <button
              type="submit"
              className="w-full rounded-md px-4 py-3 text-sm font-medium text-white"
              style={{ backgroundColor: primaryColor }}
            >
              View as Board Member
            </button>
          </form>

          <form action={`/api/v1/demo/${slug}/enter`} method="POST">
            <input type="hidden" name="role" value="resident" />
            <button
              type="submit"
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View as Resident
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS. Fix any import issues.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/demo/[slug]/page.tsx
git commit -m "feat: public demo landing page at /demo/[slug]

Server component that fetches demo by slug, renders branded landing
page with role selection. Checks for expiry and soft-deletion.
No auth required — this is the stable shareable URL."
```

---

## Task 5: Demo Entry Endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts`

- [ ] **Step 1: Create the entry route**

```typescript
// apps/web/src/app/api/v1/demo/[slug]/enter/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances } from '@propertypro/db';
import { communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { createDemoSession } from '@/lib/services/demo-session';
import { z } from 'zod';

const enterSchema = z.object({
  role: z.enum(['board', 'resident']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Parse form data (submitted via HTML form) or JSON
  let role: 'board' | 'resident';
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.formData();
    const parsed = enterSchema.safeParse({ role: formData.get('role') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    role = parsed.data.role;
  } else {
    const body = await req.json().catch(() => ({}));
    const parsed = enterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    role = parsed.data.role;
  }

  // Look up demo
  const db = createUnscopedClient();
  const [demo] = await db
    .select({
      id: demoInstances.id,
      communityId: communities.id,
      isDemo: communities.isDemo,
      demoExpiresAt: communities.demoExpiresAt,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
      demoResidentEmail: demoInstances.demoResidentEmail,
      demoBoardEmail: demoInstances.demoBoardEmail,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);

  if (!demo || !demo.isDemo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check expiry
  if (demo.demoExpiresAt && new Date(demo.demoExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'Demo expired' }, { status: 404 });
  }

  // Determine target email
  const email = role === 'board' ? demo.demoBoardEmail : demo.demoResidentEmail;

  // Create session
  const sessionResult = await createDemoSession(email);
  if (!sessionResult.ok) {
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }

  // Build redirect
  const redirectPath = role === 'board'
    ? `/dashboard?communityId=${demo.communityId}`
    : `/mobile?communityId=${demo.communityId}`;
  const baseUrl = req.nextUrl.origin;
  const response = NextResponse.redirect(new URL(redirectPath, baseUrl), 307);

  for (const cookie of sessionResult.cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/demo/[slug]/enter/route.ts
git commit -m "feat: demo entry endpoint POST /api/v1/demo/[slug]/enter

Creates Supabase session for demo user via shared helper and
redirects to dashboard (board) or mobile (resident). Validates
role via Zod, checks expiry and soft-deletion."
```

---

## Task 6: Demo Conversion Endpoint + Webhook Extension

**Files:**
- Create: `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts`
- Create: `apps/web/src/lib/services/demo-conversion.ts`
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts`

- [ ] **Step 1: Create conversion service**

`apps/web/src/lib/services/demo-conversion.ts` — handles the webhook-side logic for converting a demo community and creating the founding user.

```typescript
// apps/web/src/lib/services/demo-conversion.ts
import type Stripe from 'stripe';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles, users } from '@propertypro/db';
import { eq, and } from '@propertypro/db/filters';
import { createAdminClient } from '@propertypro/db/supabase/admin';
export async function handleDemoConversion(session: Stripe.Checkout.Session): Promise<void> {
  const { demoId, communityId, planId, customerEmail } = session.metadata ?? {};
  if (!communityId || !planId || !customerEmail) {
    console.warn('[demo-conversion] Missing required metadata');
    return;
  }

  const communityIdNum = Number(communityId);
  const db = createUnscopedClient();

  // Step 1: Convert community (idempotent via WHERE is_demo = true)
  const [converted] = await db
    .update(communities)
    .set({
      isDemo: false,
      subscriptionPlan: planId,
      subscriptionStatus: 'active',
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      demoExpiresAt: null,
    })
    .where(and(eq(communities.id, communityIdNum), eq(communities.isDemo, true)))
    .returning({ id: communities.id });

  if (converted) {
    // Only ban demo users on first conversion (not retries)
    await banDemoUsers(demoId!);
    // Note: audit logging omitted here — logAuditEvent requires userId/resourceType/resourceId
    // which aren't available in webhook context. The community UPDATE itself serves as the
    // conversion audit trail (is_demo flipped, stripe fields populated).
  }

  // Step 2: Create founding user (independently idempotent)
  await ensureFoundingUser(communityIdNum, customerEmail, session.metadata?.customerName);
}

async function banDemoUsers(demoId: string): Promise<void> {
  const db = createUnscopedClient();
  const { demoInstances } = await import('@propertypro/db/schema');

  const [demo] = await db
    .select({
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(demoInstances)
    .where(eq(demoInstances.id, Number(demoId)))
    .limit(1);

  if (!demo) return;

  const admin = createAdminClient();
  const userIds = [demo.demoResidentUserId, demo.demoBoardUserId].filter(Boolean);
  for (const uid of userIds) {
    try {
      await admin.auth.admin.updateUserById(uid!, { ban_duration: '876600h' });
    } catch (err) {
      console.error(`[demo-conversion] Failed to ban user ${uid}:`, err);
      // Non-fatal: user can be banned manually
    }
  }
}

async function ensureFoundingUser(
  communityId: number,
  email: string,
  name?: string,
): Promise<void> {
  const db = createUnscopedClient();

  // Idempotency: check if board_president already exists for this community
  const [existing] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.communityId, communityId), eq(userRoles.role, 'board_president')))
    .limit(1);

  if (existing) return; // Already created

  const admin = createAdminClient();

  // Create Supabase auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name ?? email },
  });

  if (authError) {
    // User may already exist in auth (email collision)
    console.error('[demo-conversion] Failed to create auth user:', authError.message);
    throw authError;
  }

  // Create users row
  const [user] = await db
    .insert(users)
    .values({
      id: authUser.user.id,
      email,
      fullName: name ?? email,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  const userId = user?.id ?? authUser.user.id;

  // Assign roles: board_president + property_manager_admin
  await db.insert(userRoles).values([
    { userId, communityId, role: 'board_president' },
    { userId, communityId, role: 'property_manager_admin' },
  ]).onConflictDoNothing();

  // Send welcome email with password-set link
  await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  // The magic link email is sent automatically by Supabase
}
```

- [ ] **Step 2: Create conversion endpoint**

```typescript
// apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { getServerSession } from '@/lib/auth/session';
import Stripe from 'stripe';
import { z } from 'zod';
import { PLAN_IDS } from '@propertypro/shared/features/plan-features';

const convertSchema = z.object({
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }) => {
  // Require authenticated session (middleware already enforced session exists)
  // Note: The admin app calls this cross-origin with its session.
  // Verify the caller has an active session — the admin app's session
  // is trusted because this route is under /api/v1/ (session-protected).
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const body = await req.json();
  const { planId, customerEmail, customerName } = convertSchema.parse(body);

  const db = createUnscopedClient();
  const [demo] = await db
    .select({
      id: demoInstances.id,
      communityId: communities.id,
      isDemo: communities.isDemo,
      demoExpiresAt: communities.demoExpiresAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(and(eq(demoInstances.slug, slug), isNull(demoInstances.deletedAt)))
    .limit(1);

  if (!demo) {
    return NextResponse.json({ error: 'Demo not found' }, { status: 404 });
  }
  if (!demo.isDemo) {
    return NextResponse.json({ error: 'Community is not a demo' }, { status: 400 });
  }
  if (demo.demoExpiresAt && new Date(demo.demoExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'Cannot convert expired demo' }, { status: 400 });
  }

  // Inline price lookup — getPriceId is module-private in stripe-service.ts
  const envKey = `STRIPE_PRICE_${planId.toUpperCase()}`;
  const priceId = process.env[envKey];
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for plan: ${planId}` }, { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: customerEmail,
    success_url: `${req.nextUrl.origin}/demo/${slug}/converted?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.nextUrl.origin}/demo/${slug}`,
    metadata: {
      demoId: String(demo.id),
      communityId: String(demo.communityId),
      planId,
      slug,
      customerEmail,
      customerName,
    },
  });

  return NextResponse.json({ checkoutUrl: session.url });
});
```

- [ ] **Step 3: Extend Stripe webhook handler**

In `apps/web/src/app/api/v1/webhooks/stripe/route.ts`, refactor `handleCheckoutSessionCompleted` (around line 60):

Replace the existing guard:
```typescript
// OLD:
const signupRequestId = session.metadata?.signupRequestId;
if (!signupRequestId) {
  console.warn('...');
  return;
}
```

With:
```typescript
// NEW: Route to correct handler based on metadata
const demoId = session.metadata?.demoId;
const signupRequestId = session.metadata?.signupRequestId;

if (demoId) {
  // Demo-to-customer conversion flow
  const { handleDemoConversion } = await import('@/lib/services/demo-conversion');
  await handleDemoConversion(session);
  return;
}

if (!signupRequestId) {
  console.warn('[stripe-webhook] checkout.session.completed: no demoId or signupRequestId in metadata');
  return;
}
// ... existing signup flow continues unchanged
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts apps/web/src/lib/services/demo-conversion.ts apps/web/src/app/api/v1/webhooks/stripe/route.ts
git commit -m "feat: demo-to-customer conversion via Stripe

POST /api/v1/admin/demo/[slug]/convert creates Stripe checkout session.
Webhook handler routes to handleDemoConversion when metadata.demoId is
present. In-place upgrade: flips is_demo, sets subscription fields.
Creates founding user with board_president + pm_admin roles.
Both conversion and user creation are independently idempotent."
```

---

## Task 7: Conversion Success Page

**Files:**
- Create: `apps/web/src/app/demo/[slug]/converted/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// apps/web/src/app/demo/[slug]/converted/page.tsx
export default function ConvertedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 text-4xl">&#10003;</div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Your community is now live
        </h1>
        <p className="mt-2 text-gray-600">
          Check your email for a link to set your password and get started.
        </p>
        <ul className="mt-6 space-y-2 text-left text-sm text-gray-600">
          <li>Set your password via the welcome email</li>
          <li>Invite your first residents</li>
          <li>Configure community settings</li>
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/demo/[slug]/converted/page.tsx
git commit -m "feat: post-conversion success page at /demo/[slug]/converted"
```

---

## Task 8: Demo Expiry Cron

**Files:**
- Create: `apps/web/src/app/api/v1/internal/expire-demos/route.ts`
- Modify: `apps/web/vercel.json`

- [ ] **Step 1: Create the cron endpoint**

```typescript
// apps/web/src/app/api/v1/internal/expire-demos/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull, lt } from '@propertypro/db/filters';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.DEMO_EXPIRY_CRON_SECRET);

  const db = createUnscopedClient();

  // Find expired demos
  const expiredDemos = await db
    .select({
      demoId: demoInstances.id,
      communityId: demoInstances.seededCommunityId,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.demoExpiresAt, new Date()),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );

  const admin = createAdminClient();
  let expired = 0;

  for (const demo of expiredDemos) {
    // Soft-delete community
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(and(eq(communities.id, demo.communityId!), isNull(communities.deletedAt)));

    // Soft-delete demo instance
    await db
      .update(demoInstances)
      .set({ deletedAt: new Date() })
      .where(and(eq(demoInstances.id, demo.demoId), isNull(demoInstances.deletedAt)));

    // Ban demo auth users
    const userIds = [demo.demoResidentUserId, demo.demoBoardUserId].filter(Boolean);
    for (const uid of userIds) {
      try {
        await admin.auth.admin.updateUserById(uid!, { ban_duration: '876600h' });
      } catch (err) {
        console.error(`[expire-demos] Failed to ban user ${uid}:`, err);
      }
    }

    expired++;
  }

  return NextResponse.json({ data: { expired } });
});
```

- [ ] **Step 2: Add cron to vercel.json**

In `apps/web/vercel.json`, add to the `crons` array:

```json
{
  "path": "/api/v1/internal/expire-demos",
  "schedule": "0 3 * * *"
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/internal/expire-demos/route.ts apps/web/vercel.json
git commit -m "feat: daily cron to expire stale demos

POST /api/v1/internal/expire-demos soft-deletes communities and
demo_instances where demo_expires_at < now(). Bans demo auth users.
Runs daily at 03:00 UTC via Vercel cron."
```

---

## Task 9: Admin App Updates

**Files:**
- Modify: `apps/admin/src/app/api/admin/demos/route.ts`
- Modify: `apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx`
- Modify: `apps/admin/src/app/demo/[id]/preview/page.tsx`

- [ ] **Step 1: Set demo_expires_at on creation**

In `apps/admin/src/app/api/admin/demos/route.ts`, in the `seedCommunity` call (around line 109), the `isDemo: true` field is set but `demoExpiresAt` is not. After the `seedCommunity` call returns the community, update it:

```typescript
// After seedResult is available (around line 126):
if (seedResult.communityId) {
  await db
    .update(communities)
    .set({ demoExpiresAt: sql`now() + interval '30 days'` })
    .where(eq(communities.id, seedResult.communityId));
}
```

Note: `seedCommunity` creates the community in one transaction. The expires_at update can be a follow-up query. Check what `seedResult` returns and adjust field name accordingly.

- [ ] **Step 2: Update copy link to use landing page URL**

In `apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx`, the `handleCopyShareableLink` function (line 67) copies `activeTabDef.url`. Change it to always copy the landing page URL:

```typescript
const handleCopyShareableLink = async () => {
  // Always copy the public landing page URL, not the tab-specific token URL
  const landingUrl = `${window.location.origin.replace('admin.', '')}demo/${slug}`;
  try {
    await navigator.clipboard.writeText(landingUrl);
    setCopyState('copied');
  } catch {
    setCopyState('error');
  }
  // ... rest unchanged
};
```

The `slug` needs to be passed as a prop. Update the page.tsx to pass it.

- [ ] **Step 3: Pass slug prop from page.tsx**

In `apps/admin/src/app/demo/[id]/preview/page.tsx`, the server component already has the demo instance. Pass `slug` to the client component:

```typescript
// In the TabbedPreviewClient render, add slug prop:
<TabbedPreviewClient
  // ... existing props
  slug={demo.slug}
/>
```

Update TabbedPreviewClient props type to include `slug: string`.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/admin/demos/route.ts apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx apps/admin/src/app/demo/[id]/preview/page.tsx
git commit -m "feat: admin app — set demo expiry on creation, copy landing page URL

Sets demo_expires_at to 30 days from creation. Changes copy link
button to always copy the public /demo/[slug] landing page URL
instead of the tab-specific token URL."
```

---

## Task 10: Admin Convert Button + Converted Badge

**Files:**
- Modify: `apps/admin/src/app/demo/[id]/page.tsx` (or the detail component — check which file renders the demo detail view)

- [ ] **Step 1: Add convert button to demo detail page**

Find the demo detail/preview page in the admin app. Add a "Convert to Customer" section:

```typescript
// Add to the demo detail page header area (near the Edit/Delete buttons)
// This requires: plan selection dropdown, customer email/name inputs, submit handler

// State:
const [showConvert, setShowConvert] = useState(false);
const [planId, setPlanId] = useState<string>('essentials');
const [customerEmail, setCustomerEmail] = useState('');
const [customerName, setCustomerName] = useState('');

// Handler:
const handleConvert = async () => {
  const res = await fetch(`/api/v1/admin/demo/${demo.slug}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, customerEmail, customerName }),
  });
  const data = await res.json();
  if (data.checkoutUrl) {
    window.open(data.checkoutUrl, '_blank');
  }
};
```

Key requirements:
- Button says "Convert to Customer" with a dropdown for plan selection (essentials/professional/operations_plus)
- Button disabled if demo is expired (`demoExpiresAt < now()`)
- Delete button disabled if community `is_demo = false` (already converted)
- After conversion: demo list shows green "Converted" badge instead of age badge (check `communities.is_demo === false` on the joined community)

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/demo/
git commit -m "feat: admin convert-to-customer button + converted badge

Adds plan selection dropdown and customer info form for demo conversion.
Disables delete for converted communities. Shows Converted badge in list."
```

---

## Task 11: Lint, Typecheck, Test, Build

- [ ] **Step 1: Full lint**

```bash
pnpm lint
```
Expected: PASS

- [ ] **Step 2: Full typecheck**

```bash
pnpm typecheck
```
Expected: PASS

- [ ] **Step 3: DB access guard**

```bash
pnpm guard:db-access
```
Expected: PASS (all new files in allowlist)

- [ ] **Step 4: Unit tests**

```bash
pnpm test
```
Expected: All existing tests pass. No regressions.

- [ ] **Step 5: Build**

```bash
pnpm build
```
Expected: Production build succeeds.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/typecheck/build issues from demo lifecycle feature"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Migration + schema | 1 |
| 2 | Shared session helper + demo-login refactor | 1 |
| 3 | Middleware + DB guard + env | 1 |
| 4 | Public landing page | 1 |
| 5 | Demo entry endpoint | 1 |
| 6 | Conversion endpoint + webhook + service | 1 |
| 7 | Conversion success page | 1 |
| 8 | Expiry cron | 1 |
| 9 | Admin app updates (expiry, copy link) | 1 |
| 10 | Admin convert button + badge | 1 |
| 11 | Lint/typecheck/test/build | 0-1 |

**Total: ~10-11 commits, 6 new files, 12 modified files.**

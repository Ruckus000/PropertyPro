# Task 1 — Scaffold `apps/admin` (Full Phase 1)

> **Context files to read first:** `SHARED-CONTEXT.md`, `CLAUDE.md`, then read:
> - `apps/web/src/middleware.ts` (for middleware patterns to replicate)
> - `apps/web/sentry.client.config.ts` (for Sentry setup pattern)
> - `apps/web/sentry.server.config.ts`
> - `apps/web/sentry.edge.config.ts`
> - `apps/web/instrumentation.ts`
> - `apps/web/next.config.ts` (for Sentry + transpilePackages config)
> - `packages/db/src/schema/platform-admin-users.ts` (created in Wave 1)
> **Branch:** `feat/admin-app`
> **Estimated time:** 5-8 hours
> **Wave 3** — requires all Wave 1 + Wave 2 merged.

## Objective

Create a fully functional `apps/admin` Next.js app with platform admin auth, client portfolio view, and Sentry error tracking.

## Why this is one task

The admin app's bootstrap, middleware, auth UI, and portfolio view are tightly coupled — splitting them creates more merge conflicts than time saved. Build it as one cohesive PR.

## Deliverables

### 1. App bootstrap

**Directory structure:**
```
apps/admin/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── instrumentation.ts
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                    # Redirect to /clients
    │   ├── globals.css
    │   ├── auth/login/page.tsx
    │   ├── access-denied/page.tsx
    │   ├── clients/
    │   │   ├── page.tsx                # Portfolio
    │   │   └── [id]/page.tsx           # Workspace shell
    │   ├── demo/
    │   │   └── page.tsx                # Placeholder: "Demo generator coming in Phase 2"
    │   └── api/health/route.ts
    ├── components/
    │   ├── AdminLayout.tsx             # Sidebar + content area
    │   └── Sidebar.tsx                 # Navigation sidebar
    └── middleware.ts
```

**`package.json`:** Name: `@propertypro/admin`. Same Next.js/React versions as `apps/web`. Dependencies: `@propertypro/db`, `@propertypro/shared`, `@propertypro/ui`, `@propertypro/theme`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js`, `tailwindcss`, `postcss`, `autoprefixer`.

Dev script: `"dev": "next dev --port 3001"`

**`next.config.ts`:**
```typescript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  transpilePackages: [
    '@propertypro/db',
    '@propertypro/shared',
    '@propertypro/ui',
    '@propertypro/theme',
  ],
  env: {
    NEXT_PUBLIC_APP_ROLE: 'admin',
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableServerWebpackPlugin: !process.env.SENTRY_DSN,
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

**`tailwind.config.ts`:** Use the same token CSS file from `packages/ui/src/styles/tokens.css`. Content paths: `['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}']`.

**Sentry files:** Copy from `apps/web`, same structure. The DSN env vars are the same names (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`) — the owner will provide values.

### 2. Shared auth utility

**Create:** `packages/shared/src/auth/platform-admin.ts`

```typescript
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { eq } from '@propertypro/db/filters';
import { platformAdminUsers } from '@propertypro/db';

interface PlatformAdminUser {
  id: string;
  email: string;
  role: string;
}

export async function requirePlatformAdmin(
  supabaseUser: { id: string; email?: string } | null,
): Promise<PlatformAdminUser> {
  if (!supabaseUser) {
    throw new Error('UNAUTHORIZED');
  }

  const db = createAdminClient();
  const rows = await db
    .select()
    .from(platformAdminUsers)
    .where(eq(platformAdminUsers.userId, supabaseUser.id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error('FORBIDDEN');
  }

  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    role: row.role,
  };
}

export async function getPlatformAdminSession(
  supabaseUser: { id: string; email?: string } | null,
): Promise<PlatformAdminUser | null> {
  try {
    return await requirePlatformAdmin(supabaseUser);
  } catch {
    return null;
  }
}
```

**Note on function signature:** The function takes a Supabase user object, not a `Request`. This is because the middleware extracts the Supabase session (which requires the middleware Supabase client), and the API route handlers use the server Supabase client. Keeping session extraction separate from admin checking is cleaner.

**Export from:** `packages/shared/src/index.ts`

### 3. Admin middleware

**Create:** `apps/admin/src/middleware.ts`

**Pattern:** Follow `apps/web/src/middleware.ts` but simpler — no tenant resolution.

```typescript
// Responsibilities in order:
// 1. Supabase session refresh (same as apps/web)
// 2. Strip spoofed headers: x-community-id, x-tenant-slug, x-user-id, x-tenant-source
// 3. Allow through: /auth/login, /api/health, /_next/*, /favicon.ico
// 4. For all other routes: extract session, call requirePlatformAdmin()
//    - If UNAUTHORIZED → redirect to /auth/login
//    - If FORBIDDEN → redirect to /access-denied
// 5. Add X-Request-ID header (crypto.randomUUID())
// 6. Rate limiting on /api/* routes: 100 req/min per IP
```

**Rate limiting:** Implement a simple in-memory rate limiter (Map<string, { count, windowStart }>). Same approach as `apps/web` middleware. Do NOT skip rate limiting — this was explicitly called out as a v3 error.

**Matcher config:**
```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### 4. Auth UI

**`/auth/login`** — dark-themed login page:
- Background: `bg-gray-900` (#111827)
- Centered card: white, max-w-md, rounded-lg, shadow
- Heading: "Operator Console" (text-xl, font-semibold)
- Subheading: "PropertyPro Platform Administration" (text-sm, text-gray-500)
- Form: email input + password input + submit button
- Submit: call Supabase `auth.signInWithPassword()` via `@supabase/ssr` browser client
- On success: `router.push('/clients')` — middleware handles the admin check
- On error: show error message below the form

**`/access-denied`** — shown when user is authenticated but not an admin:
- Same dark background
- Centered card with warning icon
- Message: "Access Denied — Your account does not have platform administrator privileges."
- "Return to Login" button that calls `supabase.auth.signOut()` then redirects to `/auth/login`

### 5. Admin layout with sidebar

**`AdminLayout.tsx`:** Flex layout with:
- Left sidebar (w-56, bg-gray-900, text-white)
- Right content area (flex-1, bg-gray-50)

**`Sidebar.tsx`:** Navigation links:
```
CLIENTS
  Portfolio    /clients      (icon: Building2)
  Demos        /demo         (icon: PlayCircle)
```

Active state: `bg-gray-800` background on current route.

Logout button at the bottom of the sidebar.

### 6. Client Portfolio

**`/clients`** — server component.

Query all non-demo, non-deleted communities:
```sql
SELECT * FROM communities WHERE is_demo = false AND deleted_at IS NULL ORDER BY name
```
Via `createAdminClient()`.

For each community, also query unit count:
```sql
SELECT COUNT(*) FROM units WHERE community_id = ?
```

**Render:** Grid of cards (responsive: 1 col on mobile, 2 on md, 3 on lg).

Each card shows:
- Community name (text-lg, font-semibold)
- Type badge: "Condo §718" (blue bg), "HOA §720" (green bg), "Apartment" (purple bg)
- Location: "{city}, {state}"
- Subscription status badge: active (green), trialing (blue), past_due (red), canceled (gray), or "No subscription" (gray) if null
- Unit count: "{n} units"
- Created: "Since {MMM D, YYYY}"

Click anywhere on card → navigate to `/clients/{id}`

**Controls above the grid:**
- Search input: filters by community name (client-side `ILIKE` or client-side filter)
- Type dropdown: "All Types", "Condo §718", "HOA §720", "Apartment"
- Sort dropdown: "Name A-Z", "Name Z-A", "Newest", "Oldest"

**Stale Demos card:** Below the portfolio grid, a separate section titled "Stale Demos":
- Query: `SELECT * FROM demo_instances ORDER BY created_at`
- For each, compute age in days from `created_at`
- Group by age bracket: 10-19 (yellow badge), 20-29 (orange badge), 30+ (red badge)
- Skip demos less than 10 days old
- If no stale demos, don't show the section
- Each row: prospect name, template type, age badge, "Delete" button
- Delete: confirmation dialog → `DELETE FROM demo_instances WHERE id = ?` + `DELETE FROM communities WHERE id = seeded_community_id` via API route

**Note:** `demo_instances` table doesn't exist until Phase 2. The stale demos section should handle the case where the table doesn't exist (catch the query error gracefully) or be feature-flagged with a TODO comment.

### 7. Client Workspace shell

**`/clients/[id]`** — server component.

Fetch community by ID via `createAdminClient()`.
If not found OR `is_demo = true` → return `notFound()`.

**Tab layout:** Horizontal tabs at the top.
- **Overview** (default): Show community name, type, full address, subscription info, unit count, document count (query documents table), compliance score (query compliance checklist items)
- **Site Builder**: Placeholder card: "Site Builder — Coming in Phase 3"
- **Settings**: Placeholder card: "Community Settings"

Use URL-based tab selection: `/clients/[id]?tab=overview` (default), `?tab=site-builder`, `?tab=settings`

### 8. Health endpoint

**Create:** `apps/admin/src/app/api/health/route.ts`

```typescript
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

Also create the same in `apps/web` if it doesn't already exist: `apps/web/src/app/api/health/route.ts`

### 9. Tests

**Create:** `apps/admin/vitest.config.ts` — match the pattern of `apps/web/vitest.config.ts`

**Test files:**

**`apps/admin/__tests__/middleware/admin-auth.test.ts`:**
1. Request to `/clients` without session → redirect to `/auth/login`
2. Request to `/clients` with valid session but NO `platform_admin_users` row → redirect to `/access-denied`
3. Request to `/clients` with valid session AND `platform_admin_users` row → passes through
4. Request to `/auth/login` → always passes through (no admin check)
5. Request to `/api/health` → always passes through
6. Spoofed `x-community-id` header → stripped from request

**`apps/admin/__tests__/auth/platform-admin.test.ts`:**
1. `requirePlatformAdmin(null)` → throws UNAUTHORIZED
2. `requirePlatformAdmin({ id: 'non-admin-uuid' })` → throws FORBIDDEN
3. `requirePlatformAdmin({ id: 'admin-uuid' })` with matching row → returns PlatformAdminUser
4. `getPlatformAdminSession(null)` → returns null (no throw)

**Update CI:** Modify `.github/workflows/ci.yml`:
- Unit tests step: also build `@propertypro/theme` before running tests
- Add `apps/admin` to the build step

**Update:** `vitest.workspace.ts` — add `'apps/admin'`

## Do NOT

- Do not create demo generator UI — that's Phase 2
- Do not implement the site builder tab — that's Phase 3
- Do not create any API routes beyond `/api/health`
- Do not add `platform_observer` role — that's Phase 2+
- Do not modify `apps/web` middleware or routes (except adding `/api/health` if missing)

## Acceptance Criteria

- [ ] `pnpm --filter apps/admin dev` starts on port 3001
- [ ] Login page renders with dark theme
- [ ] Authenticated admin sees portfolio view
- [ ] Non-admin authenticated user sees access denied page
- [ ] Unauthenticated user redirected to login
- [ ] Client cards show correct data for seeded communities
- [ ] Client workspace shows Overview tab with community stats
- [ ] Sidebar navigation works
- [ ] Rate limiting returns 429 after threshold
- [ ] All tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds for both apps

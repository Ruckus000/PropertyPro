# Onboarding Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild onboarding to deliver under-2-minute admin setup, role-tailored invited user welcome screens, persistent dashboard checklists, and celebration moments — shipping this week.

**Architecture:** The onboarding system has 6 layers: (1) a new `onboarding_checklist_items` DB table for tracking activation progress, (2) a checklist service with auto-complete hooks wired into existing API routes, (3) a streamlined 2-step wizard replacing the current 4-5 step flow, (4) an in-dashboard checklist component with celebration state, (5) a role-tailored welcome screen for invited users, and (6) updated empty states across the app. Bug fixes are interleaved at their natural insertion points.

**Tech Stack:** Next.js 15 (App Router), React 19, Drizzle ORM, Supabase RLS, Tailwind + shadcn/ui, TanStack Query, sonner (new), canvas-confetti (new), framer-motion (existing).

**Design Spec:** `docs/superpowers/specs/2026-04-03-onboarding-revamp-design.md`

**Correction from spec:** The spec says migration `0131` but the journal is already at idx 131. The new migration is `0132_add_onboarding_checklist_items.sql`.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/db/migrations/0132_add_onboarding_checklist_items.sql` | DDL for new table + RLS + index |
| `packages/db/src/schema/onboarding-checklist-items.ts` | Drizzle ORM schema definition |
| `apps/web/src/lib/services/onboarding-checklist-service.ts` | Server-side CRUD: create items for role, mark complete, query by user |
| `apps/web/src/app/api/v1/onboarding/checklist/route.ts` | API: GET (list items), PATCH (mark complete) |
| `apps/web/src/hooks/use-onboarding-checklist.ts` | Client hook: TanStack Query wrapper for checklist data |
| `apps/web/src/hooks/use-confetti.ts` | Client hook: canvas-confetti with reduced-motion + Strict Mode guard |
| `apps/web/src/components/onboarding/onboarding-checklist.tsx` | Dashboard checklist card with progress bar, items, dismissal |
| `apps/web/src/components/onboarding/checklist-celebration.tsx` | Celebration state: confetti + animated check + success card |
| `apps/web/src/components/onboarding/checklist-sidebar-indicator.tsx` | Collapsed "Setup: 2/6" progress ring for sidebar |
| `apps/web/src/components/onboarding/compliance-preview.tsx` | Wizard Step 2: read-only compliance category list |
| `apps/web/src/components/onboarding/welcome-screen.tsx` | Invited user welcome: greeting + snapshot + nudge |
| `apps/web/src/components/onboarding/welcome-snapshot-cards.tsx` | Role-specific card sets (owner/board/tenant) |
| `apps/web/src/app/(authenticated)/welcome/page.tsx` | Welcome screen route (server component with data fetching) |

### Modified Files

| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Export new schema |
| `packages/db/migrations/meta/_journal.json` | Add idx 132 entry |
| `apps/web/package.json` | Add sonner + canvas-confetti |
| `apps/web/src/app/layout.tsx` | Add `<Toaster />` provider |
| `apps/web/src/components/onboarding/condo-wizard.tsx` | Rebuild as 2-step |
| `apps/web/src/components/onboarding/apartment-wizard.tsx` | Rebuild as 2-step |
| `apps/web/src/app/api/v1/onboarding/condo/route.ts` | Update for 2-step + checklist creation |
| `apps/web/src/app/api/v1/onboarding/apartment/route.ts` | Update for 2-step + checklist creation |
| `apps/web/src/app/(authenticated)/dashboard/page.tsx` | Add welcome redirect + checklist |
| `apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx` | Same |
| `apps/web/src/components/dashboard/dashboard-welcome.tsx` | "Welcome back" → "Welcome" |
| `apps/web/src/lib/constants/empty-states.ts` | Add 3 configs, rename 1 |
| `apps/web/src/components/signup/provisioning-progress.tsx` | Timeout fix + retry |
| `apps/web/src/components/signup/verify-email-content.tsx` | Fix back link |
| `apps/web/src/app/api/v1/invitations/route.ts` | Pass inviterName |
| `apps/web/src/lib/services/onboarding-service.ts` | Add inviterName param |
| `apps/web/src/app/api/v1/documents/route.ts` | Auto-complete hook |
| `apps/web/src/app/api/v1/announcements/route.ts` | Auto-complete hook |
| `apps/web/src/app/api/v1/residents/invite/route.ts` | Auto-complete hook |
| `apps/web/src/app/api/v1/notification-preferences/route.ts` | Auto-complete hook |
| `scripts/verify-scoped-db-access.ts` | Allowlist checklist service |

---

## Phase 0: Foundation

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install sonner and canvas-confetti**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
pnpm --filter @propertypro/web add sonner canvas-confetti
pnpm --filter @propertypro/web add -D @types/canvas-confetti
```

Expected: packages added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Verify installation**

```bash
pnpm typecheck
```

Expected: PASS (no type errors from new packages).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add sonner and canvas-confetti dependencies"
```

---

### Task 2: Database Migration

**Files:**
- Create: `packages/db/migrations/0132_add_onboarding_checklist_items.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration file**

Create `packages/db/migrations/0132_add_onboarding_checklist_items.sql`:

```sql
-- Migration 0132: Add onboarding checklist items table for activation tracking
CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("community_id", "user_id", "item_key")
);

-- Index for fast lookup by user within community
CREATE INDEX IF NOT EXISTS "idx_checklist_user_community"
  ON "onboarding_checklist_items" ("user_id", "community_id");

-- RLS: enable and add policies
ALTER TABLE "onboarding_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_checklist_items" FORCE ROW LEVEL SECURITY;

-- Read: users can read their own checklist items within their community
CREATE POLICY "checklist_items_select_own"
  ON "onboarding_checklist_items"
  FOR SELECT
  USING (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Insert: users can insert their own checklist items within their community
CREATE POLICY "checklist_items_insert_own"
  ON "onboarding_checklist_items"
  FOR INSERT
  WITH CHECK (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Update: users can update their own checklist items within their community
CREATE POLICY "checklist_items_update_own"
  ON "onboarding_checklist_items"
  FOR UPDATE
  USING (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Write-scope trigger: prevent cross-community writes
CREATE TRIGGER "enforce_community_scope_onboarding_checklist_items"
  BEFORE INSERT OR UPDATE ON "onboarding_checklist_items"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_community_scope();
```

- [ ] **Step 2: Add journal entry**

Add to `packages/db/migrations/meta/_journal.json`, after the idx 131 entry:

```json
,
    {
      "idx": 132,
      "version": "7",
      "when": 1775350000000,
      "tag": "0132_add_onboarding_checklist_items",
      "breakpoints": true
    }
```

- [ ] **Step 3: Run migration**

```bash
pnpm --filter @propertypro/db db:migrate
```

Expected: Migration applies successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0132_add_onboarding_checklist_items.sql packages/db/migrations/meta/_journal.json
git commit -m "feat(db): add onboarding_checklist_items table with RLS"
```

---

### Task 3: Drizzle Schema

**Files:**
- Create: `packages/db/src/schema/onboarding-checklist-items.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create schema file**

Create `packages/db/src/schema/onboarding-checklist-items.ts`:

```typescript
import {
  bigint,
  bigserial,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const onboardingChecklistItems = pgTable(
  'onboarding_checklist_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('onboarding_checklist_community_user_key').on(
      table.communityId,
      table.userId,
      table.itemKey,
    ),
  ],
);
```

- [ ] **Step 2: Export from schema index**

Add to `packages/db/src/schema/index.ts`, after the existing onboarding-wizard-state export (around line 57):

```typescript
export * from './onboarding-checklist-items';
```

And add the type exports in the type section (around line 315):

```typescript
export type OnboardingChecklistItem = typeof onboardingChecklistItems.$inferSelect;
export type NewOnboardingChecklistItem = typeof onboardingChecklistItems.$inferInsert;
```

- [ ] **Step 3: Verify types**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/onboarding-checklist-items.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add Drizzle schema for onboarding_checklist_items"
```

---

### Task 4: Sonner Toaster Provider

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add Toaster to root layout**

In `apps/web/src/app/layout.tsx`, add the import at the top of the file:

```typescript
import { Toaster } from 'sonner';
```

Then add `<Toaster />` inside the `<body>` tag, after `{children}`:

```tsx
<Toaster
  position="top-right"
  richColors
  toastOptions={{
    className: 'font-sans',
  }}
/>
```

- [ ] **Step 2: Verify dev server runs**

```bash
pnpm dev
```

Navigate to any page — verify no errors in console, Toaster doesn't render anything visible until a toast is triggered.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add sonner Toaster provider to root layout"
```

---

## Phase 1: Bug Fixes

### Task 5: Fix Blank Inviter Name in Invitation Emails

**Files:**
- Modify: `apps/web/src/lib/services/onboarding-service.ts`
- Modify: `apps/web/src/app/api/v1/invitations/route.ts`
- Modify: `apps/web/src/app/api/v1/residents/invite/route.ts`

- [ ] **Step 1: Update onboarding-service function signature**

In `apps/web/src/lib/services/onboarding-service.ts`, update the `createOnboardingInvitation` function params type (around line 128) to add `inviterName`:

```typescript
export async function createOnboardingInvitation(params: {
  communityId: number;
  userId: string;
  ttlDays?: number;
  actorUserId: string;
  inviterName: string;
}): Promise<{ id: number; token: string; expiresAt: Date }>
```

Then where `inviterName: ''` is used in the email creation (around line 178), replace with:

```typescript
inviterName: params.inviterName,
```

- [ ] **Step 2: Update invitations route**

In `apps/web/src/app/api/v1/invitations/route.ts`, in the POST handler where `inviterName: ''` is hardcoded (around line 118), replace with:

```typescript
inviterName: req.headers.get('x-user-full-name') || req.headers.get('x-user-email') || 'Your administrator',
```

- [ ] **Step 3: Update residents/invite route**

In `apps/web/src/app/api/v1/residents/invite/route.ts`, find where `createOnboardingInvitation` is called (around lines 118-144). Add `inviterName` to the call:

```typescript
const inviterName = req.headers.get('x-user-full-name')
  || req.headers.get('x-user-email')
  || 'Your administrator';
```

And pass it in the function call:

```typescript
await createOnboardingInvitation({
  communityId: effectiveCommunityId,
  userId: created.userId,
  ttlDays: data.ttlDays,
  actorUserId: audit.userId,
  inviterName,
});
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/onboarding-service.ts apps/web/src/app/api/v1/invitations/route.ts apps/web/src/app/api/v1/residents/invite/route.ts
git commit -m "fix: populate inviterName in invitation emails"
```

---

### Task 6: Fix Dashboard Greeting

**Files:**
- Modify: `apps/web/src/components/dashboard/dashboard-welcome.tsx`

- [ ] **Step 1: Change "Welcome back" to "Welcome"**

In `apps/web/src/components/dashboard/dashboard-welcome.tsx`, change line with `Welcome back, {firstName}` to:

```tsx
<h1 className="mt-1 text-2xl font-semibold text-content">Welcome, {firstName}</h1>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/dashboard-welcome.tsx
git commit -m "fix: change dashboard greeting from 'Welcome back' to 'Welcome'"
```

---

### Task 7: Fix Provisioning Timeout

**Files:**
- Modify: `apps/web/src/components/signup/provisioning-progress.tsx`

- [ ] **Step 1: Increase MAX_POLLS and add retry**

In `apps/web/src/components/signup/provisioning-progress.tsx`:

Change the constant (around line 35):

```typescript
const MAX_POLLS = 30; // was 15 — 60 seconds before showing failure
```

In the failure state JSX (around lines 136-160), add a retry button and manual login link after the existing failure message:

```tsx
<div className="mt-4 flex flex-col items-center gap-3">
  <button
    type="button"
    onClick={() => {
      pollCount.current = 0;
      setFailed(false);
      startPolling();
    }}
    className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
  >
    Check again
  </button>
  <a
    href="/auth/login"
    className="text-sm text-content-secondary transition-colors hover:text-interactive"
  >
    Or log in manually
  </a>
</div>
```

Note: `startPolling` should be extracted from the useEffect into a callable function. Move the polling logic into a `startPolling` callback ref that both the useEffect and the retry button can invoke.

- [ ] **Step 2: Verify component renders**

Start dev server, navigate to a provisioning return page, verify the failure state shows retry button after timeout.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/signup/provisioning-progress.tsx
git commit -m "fix: increase provisioning timeout to 60s and add retry button"
```

---

### Task 8: Fix "Wrong Email" Back Link

**Files:**
- Modify: `apps/web/src/components/signup/verify-email-content.tsx`

- [ ] **Step 1: Add signupRequestId to back link**

In `apps/web/src/components/signup/verify-email-content.tsx`, find the Link around line 319-326 and update the `href`:

```tsx
<Link
  href={`/signup${signupRequestId ? `?signupRequestId=${signupRequestId}` : ''}`}
  className="text-sm text-content-secondary transition-colors hover:text-interactive"
>
  Wrong email? Go back and update it
</Link>
```

The `signupRequestId` variable is already available in the component (used in other parts of the polling logic).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/signup/verify-email-content.tsx
git commit -m "fix: carry signupRequestId in 'wrong email' back link"
```

---

## Phase 2: Checklist Service (Backend)

### Task 9: Checklist Service

**Files:**
- Create: `apps/web/src/lib/services/onboarding-checklist-service.ts`
- Modify: `scripts/verify-scoped-db-access.ts`

This service handles all checklist operations. It uses the scoped client for normal operations and needs an allowlist entry because it accesses the `onboarding_checklist_items` table.

- [ ] **Step 1: Define checklist item keys and role mappings**

Create `apps/web/src/lib/services/onboarding-checklist-service.ts`:

```typescript
import { createScopedClient } from '@propertypro/db';
import { onboardingChecklistItems } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';

// ─── Item key definitions ────────────────────────────────────
export const ADMIN_CONDO_ITEMS = [
  'upload_first_document',
  'add_units',
  'invite_first_member',
  'review_compliance',
  'post_announcement',
  'customize_portal',
] as const;

export const ADMIN_APARTMENT_ITEMS = [
  'upload_community_rules',
  'add_units',
  'invite_first_member',
  'review_compliance',
  'post_announcement',
  'customize_portal',
] as const;

export const BOARD_MEMBER_ITEMS = [
  'review_announcement',
  'check_compliance',
  'update_preferences',
] as const;

export const OWNER_TENANT_ITEMS = [
  'review_announcement',
  'access_document',
  'update_preferences',
] as const;

export type ChecklistItemKey =
  | (typeof ADMIN_CONDO_ITEMS)[number]
  | (typeof ADMIN_APARTMENT_ITEMS)[number]
  | (typeof BOARD_MEMBER_ITEMS)[number]
  | (typeof OWNER_TENANT_ITEMS)[number];

// ─── Display text mapping ────────────────────────────────────
export const CHECKLIST_DISPLAY: Record<ChecklistItemKey, string> = {
  upload_first_document: 'Upload your first compliance document',
  upload_community_rules: 'Upload your community rules',
  add_units: 'Add your units',
  invite_first_member: 'Invite a board member or resident',
  review_compliance: 'Review your compliance score',
  post_announcement: 'Post your first announcement',
  customize_portal: 'Customize your portal',
  review_announcement: "Review your community's latest announcement",
  check_compliance: 'Check community compliance status',
  access_document: 'Access a community document',
  update_preferences: 'Update your notification preferences',
};

// ─── Role → item keys resolver ───────────────────────────────
type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';
type Role = string;

const ADMIN_ROLES = new Set([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

export function getItemKeysForRole(
  role: Role,
  communityType: CommunityType,
): readonly ChecklistItemKey[] {
  if (role === 'property_manager_admin' || role === 'cam' || role === 'board_president') {
    return communityType === 'apartment' ? ADMIN_APARTMENT_ITEMS : ADMIN_CONDO_ITEMS;
  }
  if (role === 'board_member') {
    return BOARD_MEMBER_ITEMS;
  }
  // owner, tenant, site_manager
  return OWNER_TENANT_ITEMS;
}
```

- [ ] **Step 2: Add CRUD operations**

Append to the same file:

```typescript
// ─── Create checklist items for a user ───────────────────────
export async function createChecklistItems(
  communityId: number,
  userId: string,
  role: Role,
  communityType: CommunityType,
): Promise<void> {
  const itemKeys = getItemKeysForRole(role, communityType);
  const scoped = createScopedClient(communityId);

  const rows = itemKeys.map((itemKey) => ({
    communityId,
    userId,
    itemKey,
  }));

  await scoped
    .insert(onboardingChecklistItems)
    .values(rows)
    .onConflictDoNothing();
}

// ─── Get checklist items for a user ──────────────────────────
export async function getChecklistItems(
  communityId: number,
  userId: string,
): Promise<Array<{
  id: number;
  itemKey: string;
  completedAt: Date | null;
  createdAt: Date;
}>> {
  const scoped = createScopedClient(communityId);

  return scoped
    .select({
      id: onboardingChecklistItems.id,
      itemKey: onboardingChecklistItems.itemKey,
      completedAt: onboardingChecklistItems.completedAt,
      createdAt: onboardingChecklistItems.createdAt,
    })
    .from(onboardingChecklistItems)
    .where(
      and(
        eq(onboardingChecklistItems.userId, userId),
      ),
    )
    .orderBy(onboardingChecklistItems.createdAt);
}

// ─── Check if user has any checklist items (welcome signal) ──
export async function hasChecklistItems(
  communityId: number,
  userId: string,
): Promise<boolean> {
  const items = await getChecklistItems(communityId, userId);
  return items.length > 0;
}

// ─── Mark a specific item complete (idempotent) ──────────────
export async function markItemComplete(
  communityId: number,
  userId: string,
  itemKey: ChecklistItemKey,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  await scoped
    .update(onboardingChecklistItems)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(onboardingChecklistItems.userId, userId),
        eq(onboardingChecklistItems.itemKey, itemKey),
        isNull(onboardingChecklistItems.completedAt),
      ),
    );
}

// ─── Auto-complete hook (fire-and-forget, never throws) ──────
export async function tryAutoComplete(
  communityId: number,
  userId: string,
  itemKey: ChecklistItemKey,
): Promise<void> {
  try {
    await markItemComplete(communityId, userId, itemKey);
  } catch {
    // Non-blocking: checklist failure must never break primary actions
  }
}
```

- [ ] **Step 3: Add to DB access guard allowlist**

In `scripts/verify-scoped-db-access.ts`, add to the `WEB_UNSAFE_IMPORT_ALLOWLIST` array (around line 65):

```typescript
resolve(repoRoot, 'apps/web/src/lib/services/onboarding-checklist-service.ts'), // onboarding checklist uses scoped client
```

Note: The checklist service uses `createScopedClient` (the safe import), not unsafe. But verify the guard doesn't flag it. If it does, add the allowlist entry. If it doesn't, skip this step.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/onboarding-checklist-service.ts scripts/verify-scoped-db-access.ts
git commit -m "feat: add onboarding checklist service with CRUD and auto-complete"
```

---

### Task 10: Checklist API Route

**Files:**
- Create: `apps/web/src/app/api/v1/onboarding/checklist/route.ts`

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/api/v1/onboarding/checklist/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/request/require-authenticated-user';
import { resolveEffectiveCommunityId } from '@/lib/request/resolve-community';
import { requireCommunityMembership } from '@/lib/request/require-community-membership';
import {
  getChecklistItems,
  markItemComplete,
  CHECKLIST_DISPLAY,
  type ChecklistItemKey,
} from '@/lib/services/onboarding-checklist-service';

// GET /api/v1/onboarding/checklist — list items for current user
export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req);
  await requireCommunityMembership(communityId, userId);

  const items = await getChecklistItems(communityId, userId);

  const enriched = items.map((item) => ({
    ...item,
    displayText: CHECKLIST_DISPLAY[item.itemKey as ChecklistItemKey] ?? item.itemKey,
  }));

  return NextResponse.json({ data: enriched });
});

// PATCH /api/v1/onboarding/checklist — mark item complete
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = (await req.json()) as { communityId?: number; itemKey?: string };

  if (!body.itemKey || typeof body.itemKey !== 'string') {
    return NextResponse.json({ error: 'itemKey is required' }, { status: 400 });
  }

  if (!(body.itemKey in CHECKLIST_DISPLAY)) {
    return NextResponse.json({ error: 'Invalid itemKey' }, { status: 400 });
  }

  const communityId = resolveEffectiveCommunityId(req, body.communityId);
  await requireCommunityMembership(communityId, userId);

  await markItemComplete(communityId, userId, body.itemKey as ChecklistItemKey);

  return NextResponse.json({ data: { itemKey: body.itemKey, completedAt: new Date() } });
});
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS. Note: If `resolveEffectiveCommunityId` requires a second argument for GET requests, check how other GET routes resolve communityId (may need to read from `x-community-id` header or query param).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/onboarding/checklist/route.ts
git commit -m "feat: add checklist API route (GET list, PATCH complete)"
```

---

### Task 11: Auto-Complete Hooks in Existing API Routes

**Files:**
- Modify: `apps/web/src/app/api/v1/documents/route.ts`
- Modify: `apps/web/src/app/api/v1/announcements/route.ts`
- Modify: `apps/web/src/app/api/v1/residents/invite/route.ts`
- Modify: `apps/web/src/app/api/v1/notification-preferences/route.ts`

Each modification follows the same pattern: import `tryAutoComplete`, call it fire-and-forget after the primary action succeeds.

All 9 auto-complete hooks from the spec must be wired. Each follows the same pattern: import `tryAutoComplete`, call fire-and-forget after the primary action succeeds.

- [ ] **Step 1: Add hook to documents POST (upload_first_document + upload_community_rules)**

In `apps/web/src/app/api/v1/documents/route.ts`, add import at top:

```typescript
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
```

In the POST handler, after the `createUploadedDocument` call succeeds and before the return (around line 100), add:

```typescript
// Auto-complete onboarding checklist (fire-and-forget)
// Both keys fired — only the one matching this user's checklist will update
void tryAutoComplete(effectiveCommunityId, userId, 'upload_first_document');
void tryAutoComplete(effectiveCommunityId, userId, 'upload_community_rules');
```

- [ ] **Step 2: Add hook to announcements POST (post_announcement)**

In `apps/web/src/app/api/v1/announcements/route.ts`, add the same import. In the `handleCreate` function, after the announcement is successfully created (around line 289), add:

```typescript
void tryAutoComplete(audit.communityId, audit.userId, 'post_announcement');
```

- [ ] **Step 3: Add hook to announcements GET by ID (review_announcement)**

Find the single-announcement route at `apps/web/src/app/api/v1/announcements/[id]/route.ts`. If it exists, add the import and in the GET handler after successfully loading the announcement:

```typescript
void tryAutoComplete(effectiveCommunityId, userId, 'review_announcement');
```

If this route does NOT exist (announcements may be fetched client-side via the list endpoint), add the hook to the GET list handler instead, triggering only when a specific `id` query param is present. Alternatively, add it to the announcement detail page component as a client-side effect:

```typescript
// In the announcement detail page component
useEffect(() => {
  if (announcementId && communityId && userId) {
    fetch('/api/v1/onboarding/checklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId, itemKey: 'review_announcement' }),
    }).catch(() => {});
  }
}, [announcementId, communityId, userId]);
```

- [ ] **Step 4: Add hook to residents/invite POST (invite_first_member)**

In `apps/web/src/app/api/v1/residents/invite/route.ts`, add the import. After the invitation is successfully created (around line 140), add:

```typescript
void tryAutoComplete(effectiveCommunityId, audit.userId, 'invite_first_member');
```

- [ ] **Step 5: Add hook to notification-preferences PATCH (update_preferences)**

In `apps/web/src/app/api/v1/notification-preferences/route.ts`, add the import. After the upsert succeeds (before the return), add:

```typescript
void tryAutoComplete(communityId, userId, 'update_preferences');
```

- [ ] **Step 6: Add hook to units POST (add_units — first unit only)**

Find the units creation endpoint (likely `apps/web/src/app/api/v1/units/route.ts` or handled within a settings route). Add the import and after a unit is successfully created:

```typescript
void tryAutoComplete(effectiveCommunityId, userId, 'add_units');
```

The `tryAutoComplete` function is idempotent — it only updates if `completed_at IS NULL`, so calling it on every unit creation is safe and has no performance impact after the first.

- [ ] **Step 7: Add hook to compliance GET (review_compliance — score > 0 condition)**

Find the compliance data endpoint (likely `apps/web/src/app/api/v1/compliance/route.ts`). Add the import. In the GET handler, after computing the compliance score, add the conditional auto-complete:

```typescript
// Only auto-complete if the user has actually uploaded something (score > 0)
if (complianceScore > 0) {
  void tryAutoComplete(effectiveCommunityId, userId, 'review_compliance');
}
```

- [ ] **Step 8: Add hook to branding PATCH (customize_portal)**

In `apps/web/src/app/api/v1/pm/branding/route.ts`, add the import. After branding is successfully updated (before the return), add:

```typescript
void tryAutoComplete(communityId, userId, 'customize_portal');
```

- [ ] **Step 9: Add hook to documents GET by ID (access_document)**

Find the single-document route at `apps/web/src/app/api/v1/documents/[id]/route.ts`. If it exists, add to the GET handler:

```typescript
void tryAutoComplete(effectiveCommunityId, userId, 'access_document');
```

If documents are fetched client-side, use the same client-side effect pattern as the announcement hook (Step 3 alternative).

- [ ] **Step 10: Verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS. The `void` prefix ensures fire-and-forget calls don't trigger unhandled promise warnings.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/api/v1/documents/ apps/web/src/app/api/v1/announcements/ apps/web/src/app/api/v1/residents/invite/route.ts apps/web/src/app/api/v1/notification-preferences/route.ts apps/web/src/app/api/v1/pm/branding/route.ts apps/web/src/app/api/v1/compliance/ apps/web/src/app/api/v1/units/
git commit -m "feat: add all 9 checklist auto-complete hooks per spec"
```

---

## Phase 3: Streamlined Wizard

### Task 12: Compliance Preview Component (Wizard Step 2)

**Files:**
- Create: `apps/web/src/components/onboarding/compliance-preview.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/onboarding/compliance-preview.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

interface ComplianceCategory {
  templateKey: string;
  title: string;
  category: string;
  statuteReference: string | null;
}

interface CompliancePreviewProps {
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  categories: ComplianceCategory[];
  onContinue: () => void;
  isLoading?: boolean;
}

const STATUTE_LABELS: Record<string, string> = {
  condo_718: '§718',
  hoa_720: '§720',
  apartment: 'your community type',
};

export function CompliancePreview({
  communityType,
  categories,
  onContinue,
  isLoading,
}: CompliancePreviewProps) {
  const statuteLabel = STATUTE_LABELS[communityType] ?? 'your community type';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-content">
          Here&apos;s what Florida requires for your community
        </h1>
        <p className="mt-2 text-base text-content-secondary">
          We&apos;ve mapped {categories.length} document categories based on {statuteLabel}.
          Your dashboard will track progress against these requirements.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {categories.map((cat) => (
          <div
            key={cat.templateKey}
            className="flex items-center gap-3 rounded-md border border-edge bg-surface-card px-4 py-3"
          >
            {/* Uses status-warning tokens from design system (maps to amber) for the "calm" compliance tier */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-status-warning-subtle">
              <svg
                className="h-[18px] w-[18px] text-status-warning"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-content">{cat.title}</p>
              {cat.statuteReference && (
                <p className="text-sm text-content-secondary">{cat.statuteReference}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-status-warning-subtle px-2.5 py-0.5 text-xs font-medium text-status-warning">
              Needed
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={onContinue}
          disabled={isLoading}
          className={cn(
            'inline-flex h-12 items-center gap-2 rounded-md bg-interactive px-8 text-base font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
            isLoading && 'opacity-60',
          )}
        >
          Go to your dashboard
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/compliance-preview.tsx
git commit -m "feat: add CompliancePreview component for wizard step 2"
```

---

### Task 13: Rebuild Condo Wizard as 2-Step

**Files:**
- Modify: `apps/web/src/components/onboarding/condo-wizard.tsx`
- Modify: `apps/web/src/app/api/v1/onboarding/condo/route.ts`

This is a significant rewrite. The condo wizard goes from 4 steps (statutory → profile → branding → units) to 2 steps (profile → compliance preview). The API route's POST handler needs to create checklist items on completion.

- [ ] **Step 1: Rewrite the frontend component**

Rewrite `apps/web/src/components/onboarding/condo-wizard.tsx`. The new wizard has:
- Step 0: Community profile (pre-filled from signup data — name, address, county already exist)
- Step 1: Compliance preview (read-only, shows categories from provisioning)
- On completion: POST to API which creates checklist items and marks wizard complete

Key changes from current implementation:
- Remove `StatutoryStep`, `BrandingStep`, `UnitsStep` imports and rendering
- Change `MAX_STEP_INDEX` from 3 to 1
- Keep the profile step (it's already step 1 in the current wizard, moves to step 0)
- Add compliance preview as step 1
- Remove skip button entirely
- The `completeWizard` call should pass `action: 'complete'` (no more `'skip'`)

The profile step already pre-populates from the community record (loaded via the GET endpoint). Keep that behavior. The compliance preview receives categories from the wizard state or a separate API call to load compliance checklist items.

- [ ] **Step 2: Update the API POST handler**

In `apps/web/src/app/api/v1/onboarding/condo/route.ts`, update the POST handler:

1. Remove unit creation logic (moved to checklist-driven flow)
2. Remove statutory document linking logic (moved to checklist-driven flow)
3. After setting `status = 'completed'`, create checklist items:

```typescript
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';

// Inside POST handler, after marking wizard complete:
await createChecklistItems(
  communityId,
  userId,
  membership.role,
  community.communityType as 'condo_718' | 'hoa_720' | 'apartment',
);
```

4. Update `MAX_STEP_INDEX` from 3 to 1
5. Remove schemas no longer needed (statutorySchema, unitSchema, brandingSchema)
6. Keep profileSchema — it's still used in step 0

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Test manually**

Start dev server, log in as a demo user, navigate to `/onboarding/condo`. Verify:
- Step 1 shows pre-filled profile
- Step 2 shows compliance categories with "Needed" badges
- Clicking "Go to your dashboard" completes wizard and redirects to dashboard
- Checklist items exist in DB after completion

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding/condo-wizard.tsx apps/web/src/app/api/v1/onboarding/condo/route.ts
git commit -m "feat: rebuild condo wizard as 2-step (profile + compliance preview)"
```

---

### Task 14: Rebuild Apartment Wizard as 2-Step

**Files:**
- Modify: `apps/web/src/components/onboarding/apartment-wizard.tsx`
- Modify: `apps/web/src/app/api/v1/onboarding/apartment/route.ts`

Same pattern as Task 13 but for the apartment flow. The apartment wizard goes from 5 steps (profile → branding → units → rules → invite) to 2 steps (profile → compliance preview).

- [ ] **Step 1: Rewrite the frontend component**

Mirror the condo wizard structure:
- Step 0: Profile (pre-filled)
- Step 1: Compliance preview (apartment categories — operational, not statutory)
- Remove `BrandingStep`, `UnitsStep`, `RulesStep`, `InviteStep`
- Change `MAX_STEP_INDEX` from 4 to 1
- Remove skip button

- [ ] **Step 2: Update the API POST handler**

Same as condo: remove unit creation, resident creation, invitation creation from the POST handler. Add checklist item creation. Update `MAX_STEP_INDEX` from 4 to 1.

```typescript
await createChecklistItems(
  communityId,
  userId,
  membership.role,
  'apartment',
);
```

- [ ] **Step 3: Verify and test**

```bash
pnpm typecheck && pnpm lint
```

Test manually: log in as apartment community admin, verify 2-step flow works.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/onboarding/apartment-wizard.tsx apps/web/src/app/api/v1/onboarding/apartment/route.ts
git commit -m "feat: rebuild apartment wizard as 2-step (profile + compliance preview)"
```

---

## Phase 4: Dashboard Checklist UI

### Task 15: Confetti Hook

**Files:**
- Create: `apps/web/src/hooks/use-confetti.ts`

- [ ] **Step 1: Create the hook**

Create `apps/web/src/hooks/use-confetti.ts`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface UseConfettiOptions {
  /** Fire on mount (default: true) */
  enabled?: boolean;
  /** Duration in ms (default: 3000) */
  duration?: number;
}

export function useConfetti({ enabled = true, duration = 3000 }: UseConfettiOptions = {}) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (!enabled || hasFired.current) return;
    hasFired.current = true;

    // Respect prefers-reduced-motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        disableForReducedMotion: true,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    const timeout = setTimeout(() => {
      confetti.reset();
    }, duration + 2000);

    return () => {
      clearTimeout(timeout);
      confetti.reset();
    };
  }, [enabled, duration]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-confetti.ts
git commit -m "feat: add useConfetti hook wrapping canvas-confetti"
```

---

### Task 16: Onboarding Checklist Hook

**Files:**
- Create: `apps/web/src/hooks/use-onboarding-checklist.ts`

- [ ] **Step 1: Create the TanStack Query hook**

Create `apps/web/src/hooks/use-onboarding-checklist.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ChecklistItem {
  id: number;
  itemKey: string;
  displayText: string;
  completedAt: string | null;
  createdAt: string;
}

export function useOnboardingChecklist(communityId: number | null) {
  return useQuery<ChecklistItem[]>({
    queryKey: ['onboarding-checklist', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/onboarding/checklist?communityId=${communityId}`);
      if (!res.ok) throw new Error('Failed to fetch checklist');
      const json = await res.json();
      return json.data;
    },
    enabled: communityId != null,
    staleTime: 30_000,
  });
}

export function useCompleteChecklistItem(communityId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemKey: string) => {
      const res = await fetch('/api/v1/onboarding/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, itemKey }),
      });
      if (!res.ok) throw new Error('Failed to complete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-checklist', communityId] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-onboarding-checklist.ts
git commit -m "feat: add useOnboardingChecklist TanStack Query hook"
```

---

### Task 17: Checklist Celebration Component

**Files:**
- Create: `apps/web/src/components/onboarding/checklist-celebration.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/onboarding/checklist-celebration.tsx`:

```tsx
'use client';

import { useConfetti } from '@/hooks/use-confetti';
import { cn } from '@/lib/utils';

interface ChecklistCelebrationProps {
  communityName: string;
  onDismiss: () => void;
  onViewCompliance: () => void;
}

export function ChecklistCelebration({
  communityName,
  onDismiss,
  onViewCompliance,
}: ChecklistCelebrationProps) {
  useConfetti({ enabled: true, duration: 3000 });

  return (
    <section className="relative rounded-md border border-edge bg-surface-card p-6 shadow-sm">
      {/* Close button */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-content-tertiary transition-colors hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        aria-label="Dismiss"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="flex flex-col items-center text-center">
        {/* Animated check icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-10 w-10 text-green-700"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M8 12.5L10.5 15L16 9.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-safe:animate-[draw_600ms_ease-out_forwards]"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: 20,
              }}
            />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-content">
          Your community is set up
        </h2>
        <p className="mt-2 max-w-md text-base text-content-secondary">
          You&apos;ve uploaded documents, invited members, and your compliance score is
          live. {communityName} is ready for your residents.
        </p>

        <button
          type="button"
          onClick={onViewCompliance}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        >
          View Compliance Dashboard
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add the draw keyframe**

Add to the app's global CSS file (likely `apps/web/src/app/globals.css` or the Tailwind config):

```css
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
```

And in `tailwind.config.ts`, extend the animation:

```typescript
animation: {
  draw: 'draw 600ms ease-out forwards',
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/checklist-celebration.tsx
git commit -m "feat: add ChecklistCelebration component with confetti and animated check"
```

---

### Task 18: Onboarding Checklist Component

**Files:**
- Create: `apps/web/src/components/onboarding/onboarding-checklist.tsx`

- [ ] **Step 1: Create the main checklist component**

Create `apps/web/src/components/onboarding/onboarding-checklist.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import { CHECKLIST_DISPLAY, type ChecklistItemKey } from '@/lib/services/onboarding-checklist-service';
import { ChecklistCelebration } from './checklist-celebration';
import { cn } from '@/lib/utils';

interface OnboardingChecklistProps {
  communityId: number;
  communityName: string;
}

// Maps item keys to the page they navigate to
const ACTION_ROUTES: Partial<Record<ChecklistItemKey, { label: string; href: string }>> = {
  upload_first_document: { label: 'Upload', href: '/documents' },
  upload_community_rules: { label: 'Upload', href: '/documents' },
  add_units: { label: 'Add', href: '/settings/units' },
  invite_first_member: { label: 'Invite', href: '/residents' },
  review_compliance: { label: 'View', href: '/compliance' },
  post_announcement: { label: 'Create', href: '/announcements' },
  customize_portal: { label: 'Customize', href: '/settings/branding' },
  review_announcement: { label: 'View', href: '/announcements' },
  check_compliance: { label: 'View', href: '/compliance' },
  access_document: { label: 'Browse', href: '/documents' },
  update_preferences: { label: 'Update', href: '/settings/notifications' },
};

export function OnboardingChecklist({ communityId, communityName }: OnboardingChecklistProps) {
  const router = useRouter();
  const { data: items, isLoading } = useOnboardingChecklist(communityId);
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !items || items.length === 0 || dismissed) return null;

  const completedCount = items.filter((i) => i.completedAt != null).length;
  const totalCount = items.length;
  const allComplete = completedCount === totalCount;
  const progressPct = (completedCount / totalCount) * 100;

  if (allComplete) {
    return (
      <ChecklistCelebration
        communityName={communityName}
        onDismiss={() => setDismissed(true)}
        onViewCompliance={() => {
          setDismissed(true);
          router.push('/compliance');
        }}
      />
    );
  }

  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-content-secondary">
            {completedCount} of {totalCount} complete
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-interactive transition-[width] duration-400 ease-out"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-label={`Setup progress: ${completedCount} of ${totalCount} complete`}
          />
        </div>
      </div>

      {/* Checklist items */}
      <ul className="space-y-3">
        {items.map((item) => {
          const isComplete = item.completedAt != null;
          const action = ACTION_ROUTES[item.itemKey as ChecklistItemKey];

          return (
            <li key={item.id} className="flex items-center gap-3">
              {/* Check circle */}
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                  isComplete
                    ? 'border-green-600 bg-green-600'
                    : 'border-edge',
                )}
              >
                {isComplete && (
                  <svg
                    className="h-3 w-3 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>

              {/* Text */}
              <span
                className={cn(
                  'flex-1 text-base',
                  isComplete
                    ? 'text-content-tertiary line-through'
                    : 'text-content',
                )}
              >
                {item.displayText}
              </span>

              {/* Action link */}
              {!isComplete && action && (
                <button
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="shrink-0 text-sm font-medium text-interactive transition-colors hover:text-interactive-hover"
                >
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Dismiss */}
      <p className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-sm text-content-secondary transition-colors hover:text-content"
        >
          I&apos;ll handle this later
        </button>
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/onboarding-checklist.tsx
git commit -m "feat: add OnboardingChecklist dashboard component with progress and celebration"
```

---

### Task 19: Checklist Sidebar Indicator

**Files:**
- Create: `apps/web/src/components/onboarding/checklist-sidebar-indicator.tsx`

- [ ] **Step 1: Create the compact progress ring component**

Create `apps/web/src/components/onboarding/checklist-sidebar-indicator.tsx`:

```tsx
'use client';

import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';

interface ChecklistSidebarIndicatorProps {
  communityId: number;
  onClick: () => void;
}

const RING_SIZE = 24;
const STROKE = 3;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ChecklistSidebarIndicator({
  communityId,
  onClick,
}: ChecklistSidebarIndicatorProps) {
  const { data: items } = useOnboardingChecklist(communityId);

  if (!items || items.length === 0) return null;

  const completed = items.filter((i) => i.completedAt != null).length;
  const total = items.length;

  if (completed === total) return null; // All done, hide indicator

  const offset = CIRCUMFERENCE - (completed / total) * CIRCUMFERENCE;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
      aria-label={`Setup progress: ${completed} of ${total} complete. Click to expand checklist.`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth={STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--interactive-primary)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-400"
        />
      </svg>
      <span className="tabular-nums">
        Setup: {completed}/{total}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Integrate into sidebar navigation**

Find the sidebar/nav rail component (likely in `apps/web/src/components/layout/` or `packages/ui/src/components/NavRail`). Add the `ChecklistSidebarIndicator` near the bottom of the sidebar, above the user profile section. It should only render when the checklist is dismissed from the dashboard (controlled by the same `dismissed` state — this requires lifting the dismissed state to a shared context or using a URL param/localStorage flag).

For the simplest implementation: use `localStorage` to persist the dismissed state:

```typescript
// In onboarding-checklist.tsx, when dismissing:
localStorage.setItem('onboarding-checklist-dismissed', 'true');

// In the sidebar, show indicator when:
const isDismissed = localStorage.getItem('onboarding-checklist-dismissed') === 'true';
```

When the sidebar indicator is clicked, clear the localStorage flag and navigate to dashboard (which re-renders the full checklist).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/checklist-sidebar-indicator.tsx
git commit -m "feat: add ChecklistSidebarIndicator for collapsed checklist state"
```

---

### Task 20: Integrate Checklist into Dashboard Pages

**Files:**
- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx`

- [ ] **Step 1: Update condo dashboard**

In `apps/web/src/app/(authenticated)/dashboard/page.tsx`:

1. Import the checklist component and the `hasChecklistItems` function
2. After the existing wizard redirect logic (line 43-47), add welcome screen redirect for invited users
3. Add the checklist component to the page content (above the existing dashboard content)

Add after the wizard redirect block:

```typescript
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { hasChecklistItems } from '@/lib/services/onboarding-checklist-service';

// Inside the page component, after wizard redirect check:
// Welcome screen redirect for invited users (no checklist items = not yet welcomed)
const hasItems = await hasChecklistItems(context.communityId, context.user.id);
if (!hasItems) {
  redirect(`/welcome?communityId=${context.communityId}`);
}
```

Then in the JSX, add above the existing `DashboardWelcome`:

```tsx
<OnboardingChecklist
  communityId={context.communityId}
  communityName={context.community.name}
/>
```

- [ ] **Step 2: Update apartment dashboard**

Same pattern in `apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx`. Add the same welcome redirect and checklist component.

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(authenticated)/dashboard/page.tsx apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx
git commit -m "feat: integrate onboarding checklist and welcome redirect into dashboards"
```

---

## Phase 5: Welcome Screen

### Task 20: Welcome Snapshot Cards

**Files:**
- Create: `apps/web/src/components/onboarding/welcome-snapshot-cards.tsx`

- [ ] **Step 1: Create role-specific card components**

Create `apps/web/src/components/onboarding/welcome-snapshot-cards.tsx`:

```tsx
import { cn } from '@/lib/utils';

// ─── Shared card wrapper ─────────────────────────────────────
function SnapshotCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-edge bg-surface-card p-5 transition-shadow hover:shadow-sm">
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  label,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  iconBg: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm',
          iconBg,
        )}
      >
        {icon}
      </div>
      <span className="text-sm font-medium uppercase tracking-wide text-content-secondary">
        {label}
      </span>
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-interactive transition-colors hover:text-interactive-hover"
    >
      {children} &rarr;
    </a>
  );
}

// ─── Icon components ─────────────────────────────────────────
function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8" y2="6.01" /><line x1="12" y1="6" x2="12" y2="6.01" /><line x1="16" y1="6" x2="16" y2="6.01" />
      <line x1="8" y1="10" x2="8" y2="10.01" /><line x1="12" y1="10" x2="12" y2="10.01" /><line x1="16" y1="10" x2="16" y2="10.01" />
      <line x1="8" y1="14" x2="8" y2="14.01" /><line x1="12" y1="14" x2="12" y2="14.01" /><line x1="16" y1="14" x2="16" y2="14.01" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// ─── Owner cards ─────────────────────────────────────────────
export interface CommunityData {
  name: string;
  communityType: string;
  unitCount: number;
  contactName: string | null;
}

export interface AnnouncementData {
  id: number;
  title: string;
  body: string;
}

export interface ComplianceData {
  score: number;
  satisfied: number;
  total: number;
}

export interface UnitData {
  unitNumber: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condominium \u00B7 \u00A7718',
  hoa_720: 'HOA \u00B7 \u00A7720',
  apartment: 'Apartment',
};

export function OwnerCards({
  community,
  announcement,
  compliance,
}: {
  community: CommunityData;
  announcement: AnnouncementData | null;
  compliance: ComplianceData;
}) {
  return (
    <>
      {/* Your community */}
      <SnapshotCard>
        <CardHeader icon={<BuildingIcon className="text-blue-600" />} label="Your community" iconBg="bg-blue-50" />
        <p className="text-lg font-semibold text-content">{community.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-content-secondary">
          <span>{TYPE_LABELS[community.communityType] ?? community.communityType}</span>
          <span className="h-4 w-px bg-edge" aria-hidden="true" />
          <span>{community.unitCount} units</span>
          {community.contactName && (
            <>
              <span className="h-4 w-px bg-edge" aria-hidden="true" />
              <span>Managed by {community.contactName}</span>
            </>
          )}
        </div>
      </SnapshotCard>

      {/* Latest from your board */}
      <SnapshotCard>
        <CardHeader icon={<BellIcon className="text-amber-600" />} label="Latest from your board" iconBg="bg-amber-50" />
        {announcement ? (
          <>
            <p className="text-lg font-semibold text-content">{announcement.title}</p>
            <p className="mt-1 text-base text-content-secondary line-clamp-2">
              {announcement.body.replace(/<[^>]+>/g, '').slice(0, 150)}
            </p>
            <ActionLink href={`/announcements/${announcement.id}`}>Read full announcement</ActionLink>
          </>
        ) : (
          <p className="text-base text-content-secondary">
            No announcements yet — you&apos;ll see them here when your board posts updates.
          </p>
        )}
      </SnapshotCard>

      {/* Community compliance */}
      <SnapshotCard>
        <CardHeader icon={<ShieldIcon className="text-green-600" />} label="Community compliance" iconBg="bg-green-50" />
        <p className="text-base text-content-secondary">
          Your community is tracking <strong className="font-semibold text-content">{compliance.satisfied} of {compliance.total}</strong> required document categories.
        </p>
      </SnapshotCard>
    </>
  );
}

// ─── Board member cards ──────────────────────────────────────
export function BoardMemberCards({
  compliance,
  recentActivity,
}: {
  compliance: ComplianceData;
  recentActivity: string;
}) {
  return (
    <>
      <SnapshotCard>
        <CardHeader icon={<ShieldIcon className="text-green-600" />} label="Compliance overview" iconBg="bg-green-50" />
        <p className="text-base text-content-secondary">
          <strong className="font-semibold text-content">{compliance.total - compliance.satisfied} items need attention</strong>
        </p>
        <ActionLink href="/compliance">View compliance details</ActionLink>
      </SnapshotCard>

      <SnapshotCard>
        <CardHeader icon={<DocIcon className="text-blue-600" />} label="Recent activity" iconBg="bg-blue-50" />
        <p className="text-base text-content-secondary">{recentActivity || 'No recent activity yet.'}</p>
      </SnapshotCard>

      <SnapshotCard>
        <CardHeader icon={<BellIcon className="text-amber-600" />} label="Your responsibilities" iconBg="bg-amber-50" />
        <p className="text-base text-content-secondary">
          Nothing pending right now. You&apos;ll see action items here when they come up.
        </p>
      </SnapshotCard>
    </>
  );
}

// ─── Tenant cards ────────────────────────────────────────────
export function TenantCards({ unit }: { unit: UnitData | null }) {
  return (
    <>
      <SnapshotCard>
        <CardHeader icon={<HomeIcon className="text-blue-600" />} label="Your residence" iconBg="bg-blue-50" />
        {unit ? (
          <>
            <p className="text-lg font-semibold text-content">Unit {unit.unitNumber}</p>
            <p className="mt-1 text-base text-content-secondary">
              {[
                unit.bedrooms != null ? `${unit.bedrooms} bed` : null,
                unit.bathrooms != null ? `${unit.bathrooms} bath` : null,
                unit.sqft != null ? `${unit.sqft} sq ft` : null,
                'Tenant',
              ]
                .filter(Boolean)
                .join(' \u00B7 ')}
            </p>
          </>
        ) : (
          <p className="text-base text-content-secondary">Your unit details will appear here once your manager completes setup.</p>
        )}
      </SnapshotCard>

      <SnapshotCard>
        <CardHeader icon={<DocIcon className="text-blue-600" />} label="Community rules & documents" iconBg="bg-blue-50" />
        <p className="text-base text-content-secondary">
          House rules, lease addendums, and community documents are available here.
        </p>
        <ActionLink href="/documents">Browse documents</ActionLink>
      </SnapshotCard>

      <SnapshotCard>
        <CardHeader icon={<HelpIcon className="text-amber-600" />} label="Need something?" iconBg="bg-amber-50" />
        <p className="text-base text-content-secondary">
          Submit a maintenance request or reach out to management directly from here.
        </p>
        <ActionLink href="/maintenance/new">Submit a request</ActionLink>
      </SnapshotCard>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/onboarding/welcome-snapshot-cards.tsx
git commit -m "feat: add role-specific welcome snapshot card components"
```

---

### Task 21: Welcome Screen Component

**Files:**
- Create: `apps/web/src/components/onboarding/welcome-screen.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/onboarding/welcome-screen.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  OwnerCards,
  BoardMemberCards,
  TenantCards,
  type CommunityData,
  type AnnouncementData,
  type ComplianceData,
  type UnitData,
} from './welcome-snapshot-cards';
import { CHECKLIST_DISPLAY, type ChecklistItemKey, getItemKeysForRole } from '@/lib/services/onboarding-checklist-service';
import { cn } from '@/lib/utils';

interface WelcomeScreenProps {
  firstName: string;
  role: string;
  communityId: number;
  community: CommunityData;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  announcement: AnnouncementData | null;
  compliance: ComplianceData;
  unit: UnitData | null;
  recentActivity: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

const ROLE_SUBTEXT: Record<string, string> = {
  owner: "Your community portal is set up. Here's what's here for you.",
  tenant: 'Everything about your residence, in one place.',
  board_member: "Your board has moved governance online. Here's where things stand.",
  board_president: "Your board has moved governance online. Here's where things stand.",
};

function getRoleCategory(role: string): 'owner' | 'board' | 'tenant' {
  if (role === 'board_member' || role === 'board_president') return 'board';
  if (role === 'tenant') return 'tenant';
  return 'owner';
}

export function WelcomeScreen({
  firstName,
  role,
  communityId,
  community,
  communityType,
  announcement,
  compliance,
  unit,
  recentActivity,
  logoUrl,
  primaryColor,
}: WelcomeScreenProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const roleCategory = getRoleCategory(role);
  const subtext = ROLE_SUBTEXT[role] ?? ROLE_SUBTEXT.owner;
  const checklistKeys = getItemKeysForRole(role, communityType);

  const handleContinue = async () => {
    setIsNavigating(true);
    // Create checklist items via API, then navigate
    await fetch('/api/v1/onboarding/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId }),
    }).catch(() => {
      // Non-blocking — items can be created on next dashboard load
    });
    router.push(`/dashboard?communityId=${communityId}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-page px-6 py-12">
      <div className="w-full max-w-[720px]">
        {/* Greeting */}
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md"
            style={{ backgroundColor: primaryColor ?? 'var(--interactive-primary)' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
            ) : (
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-content">
            {firstName}, welcome to {community.name}
          </h1>
          <p className="mx-auto mt-2 max-w-[480px] text-base text-content-secondary">
            {subtext}
          </p>
        </div>

        {/* Snapshot cards */}
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          Your overview
        </p>
        <div className="mb-10 space-y-4">
          {roleCategory === 'owner' && (
            <OwnerCards
              community={community}
              announcement={announcement}
              compliance={compliance}
            />
          )}
          {roleCategory === 'board' && (
            <BoardMemberCards
              compliance={compliance}
              recentActivity={recentActivity}
            />
          )}
          {roleCategory === 'tenant' && (
            <TenantCards unit={unit} />
          )}
        </div>

        {/* CTA */}
        <div className="mb-8 text-center">
          <button
            type="button"
            onClick={handleContinue}
            disabled={isNavigating}
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-md bg-interactive px-8 text-base font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
              isNavigating && 'opacity-60',
            )}
          >
            Go to your dashboard
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Explore preview */}
        <div className="rounded-md border border-edge bg-surface-card p-5">
          <p className="mb-4 text-sm font-medium text-content-secondary">
            A few things to explore when you&apos;re ready
          </p>
          <ul className="space-y-3">
            {checklistKeys.map((key) => (
              <li key={key} className="flex items-center gap-3">
                <div className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-edge" />
                <span className="text-base text-content">
                  {CHECKLIST_DISPLAY[key]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/onboarding/welcome-screen.tsx
git commit -m "feat: add WelcomeScreen component with role-tailored greeting and snapshot"
```

---

### Task 22: Welcome Page Route

**Files:**
- Create: `apps/web/src/app/(authenticated)/welcome/page.tsx`

This is a server component that fetches the data needed for the welcome screen, then renders the client component.

- [ ] **Step 1: Create the route**

Create `apps/web/src/app/(authenticated)/welcome/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requirePageAuthContext } from '@/lib/request/page-auth-context';
import { createScopedClient } from '@propertypro/db';
import { announcements, complianceChecklistItems, units, userRoles } from '@propertypro/db';
import { eq, and, desc, isNotNull } from '@propertypro/db/filters';
import { hasChecklistItems } from '@/lib/services/onboarding-checklist-service';
import { WelcomeScreen } from '@/components/onboarding/welcome-screen';

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ communityId?: string }>;
}) {
  const context = await requirePageAuthContext();
  const params = await searchParams;
  const communityId = params.communityId
    ? Number(params.communityId)
    : context.communityId;

  // If user already has checklist items, they've been welcomed — go to dashboard
  const alreadyWelcomed = await hasChecklistItems(communityId, context.user.id);
  if (alreadyWelcomed) {
    redirect(`/dashboard?communityId=${communityId}`);
  }

  const scoped = createScopedClient(communityId);

  // Fetch community, latest announcement, compliance data, and unit in parallel
  const [latestAnnouncement, checklistItems, userUnit, role] = await Promise.all([
    // Latest announcement
    scoped
      .select({ id: announcements.id, title: announcements.title, body: announcements.body })
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    // Compliance checklist items (for score calculation)
    scoped
      .select({
        documentId: complianceChecklistItems.documentId,
        isApplicable: complianceChecklistItems.isApplicable,
      })
      .from(complianceChecklistItems),

    // User's unit (for tenants)
    scoped
      .select({
        unitNumber: units.unitNumber,
        bedrooms: units.bedrooms,
        bathrooms: units.bathrooms,
        sqft: units.sqft,
      })
      .from(units)
      .innerJoin(userRoles, eq(userRoles.unitId, units.id))
      .where(eq(userRoles.userId, context.user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    // User's role
    scoped
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, context.user.id))
      .limit(1)
      .then((rows) => rows[0]?.role ?? 'owner'),
  ]);

  // Calculate compliance score
  const applicable = checklistItems.filter((i) => i.isApplicable !== false);
  const satisfied = applicable.filter((i) => i.documentId != null);
  const compliance = {
    score: applicable.length > 0 ? Math.round((satisfied.length / applicable.length) * 100) : 0,
    satisfied: satisfied.length,
    total: applicable.length,
  };

  // Community data from context
  const community = {
    name: context.community.name,
    communityType: context.community.communityType,
    unitCount: context.community.unitCount ?? 0,
    contactName: context.community.contactName,
  };

  // Branding
  const branding = context.community.branding as { primaryColor?: string; logoPath?: string } | null;
  const logoUrl = branding?.logoPath ?? null;
  const primaryColor = branding?.primaryColor ?? null;

  const firstName = context.user.fullName?.split(' ')[0] ?? 'there';

  return (
    <WelcomeScreen
      firstName={firstName}
      role={role}
      communityId={communityId}
      community={community}
      communityType={context.community.communityType as 'condo_718' | 'hoa_720' | 'apartment'}
      announcement={latestAnnouncement}
      compliance={compliance}
      unit={userUnit}
      recentActivity="" // Board member cards handle empty state gracefully — activity summary can be enhanced post-launch
      logoUrl={logoUrl}
      primaryColor={primaryColor}
    />
  );
}
```

Note: The exact query patterns and table/column names need to match the actual Drizzle schema. Verify imports and column names against the actual schema files during implementation. The data fetching pattern follows the existing dashboard pages.

- [ ] **Step 2: Add POST handler to checklist route**

The welcome screen calls `POST /api/v1/onboarding/checklist` to create items. Add to `apps/web/src/app/api/v1/onboarding/checklist/route.ts`:

```typescript
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = (await req.json()) as { communityId?: number };
  const communityId = resolveEffectiveCommunityId(req, body.communityId);
  const membership = await requireCommunityMembership(communityId, userId);

  await createChecklistItems(
    communityId,
    userId,
    membership.role,
    membership.communityType as 'condo_718' | 'hoa_720' | 'apartment',
  );

  return NextResponse.json({ data: { created: true } }, { status: 201 });
});
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(authenticated)/welcome/page.tsx apps/web/src/app/api/v1/onboarding/checklist/route.ts
git commit -m "feat: add welcome page route with server-side data fetching"
```

---

## Phase 6: Empty States

### Task 23: Update Empty State Configs

**Files:**
- Modify: `apps/web/src/lib/constants/empty-states.ts`

- [ ] **Step 1: Rename and add configs**

In `apps/web/src/lib/constants/empty-states.ts`:

1. Rename `compliance_new_association` to `compliance_empty` and update copy:

```typescript
compliance_empty: {
  title: "Your compliance tracker is ready",
  description: "We've mapped the categories Florida requires. Upload documents to start tracking your score.",
  actionLabel: "Upload First Document",
  icon: "upload",
},
```

2. Add new configs after the existing entries:

```typescript
no_residents: {
  title: "Add the people in your community",
  description: "Import residents via CSV or add them one by one. They'll get portal access to view documents and announcements.",
  actionLabel: "Add Residents",
  icon: "users",
},
no_meetings: {
  title: "Schedule and track board meetings",
  description: "Post meeting notices with the required advance notice. PropertyPro tracks the compliance timeline for you.",
  actionLabel: "Schedule Meeting",
  icon: "bell",
},
no_announcements_yet: {
  title: "No announcements yet",
  description: "Your board hasn't posted any announcements. You'll be notified when they do.",
  icon: "bell",
},
```

3. Update the `EmptyStateKey` type to reflect the rename and additions.

- [ ] **Step 2: Verify no references to old key**

```bash
# Search for the old key name to ensure nothing references it
grep -r "compliance_new_association" apps/web/src/ packages/
```

Expected: Only the config definition (which we just renamed). If found elsewhere, update those references too.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/constants/empty-states.ts
git commit -m "feat: update empty state configs — rename compliance_new_association, add 3 new configs"
```

---

## Phase 7: Final Verification

### Task 24: Full Build and Lint Check

- [ ] **Step 1: Run the full CI suite locally**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Address any failures. Common issues:
- Import paths that don't match actual exports
- Missing type exports from schema index
- DB access guard flagging new files (add to allowlist if needed)
- Unused imports from removed wizard steps

- [ ] **Step 2: Verify the DB access guard passes**

```bash
pnpm guard:db-access
```

If the checklist service or API route is flagged, add to the allowlist in `scripts/verify-scoped-db-access.ts`.

- [ ] **Step 3: Run integration tests**

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

- [ ] **Step 4: Manual smoke test**

Using the agent-login endpoint:

1. Log in as `pm_admin` → verify 2-step wizard → verify dashboard checklist appears
2. Log in as `owner` → verify welcome screen → verify dashboard checklist appears after clicking "Go to dashboard"
3. Upload a document → verify checklist item auto-completes → verify toast notification
4. Complete all checklist items → verify celebration with confetti

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build and lint issues from onboarding revamp"
```

---

## Dependency Graph

```
Phase 0 (foundation) ──┬── Task 1: Install deps
                        ├── Task 2: Migration
                        ├── Task 3: Drizzle schema
                        └── Task 4: Sonner provider

Phase 1 (bug fixes) ───┬── Task 5: inviterName ──────── (independent)
                        ├── Task 6: Welcome greeting ─── (independent)
                        ├── Task 7: Provisioning timeout  (independent)
                        └── Task 8: Wrong email link ──── (independent)

Phase 2 (backend) ─────┬── Task 9: Checklist service ─── (depends: Phase 0)
                        ├── Task 10: Checklist API ────── (depends: Task 9)
                        └── Task 11: Auto-complete hooks  (depends: Task 9)

Phase 3 (wizard) ──────┬── Task 12: Compliance preview ── (depends: Phase 0)
                        ├── Task 13: Condo wizard ──────── (depends: Task 9, 12)
                        └── Task 14: Apartment wizard ──── (depends: Task 9, 12)

Phase 4 (dashboard) ───┬── Task 15: Confetti hook ──────── (depends: Task 1)
                        ├── Task 16: Checklist hook ──────  (depends: Task 10)
                        ├── Task 17: Celebration component  (depends: Task 15)
                        ├── Task 18: Checklist component ── (depends: Task 16, 17)
                        ├── Task 19: Sidebar indicator ──── (depends: Task 16)
                        └── Task 20: Dashboard integration  (depends: Task 18, 19)

Phase 5 (welcome) ─────┬── Task 21: Snapshot cards ──────── (independent)
                        ├── Task 22: Welcome component ──── (depends: Task 21)
                        └── Task 23: Welcome page route ──── (depends: Task 22, 9)

Phase 6 (empty states) ── Task 24: Config updates ────────── (independent)

Phase 7 (verification) ── Task 25: Build + smoke test ────── (depends: all)
```

**Parallelizable:** Phase 1 tasks are all independent of each other and of Phase 2-6. Phase 6 is independent. Tasks 12, 15, 20 can run in parallel once Phase 0 completes.

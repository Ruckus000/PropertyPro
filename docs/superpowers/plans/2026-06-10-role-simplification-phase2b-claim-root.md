# Role Simplification — Phase 2b (Claim-Root Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `property_manager` claim `root_manager` for the rootless communities they manage (banner → aggregated screen, immediate first-come), notify the other admins with a reactive dispute path, give platform admins a reassign override, and ship the root-transfer API (UI deferred to 2c).

**Architecture:** One migration (0019 `root_claim_disputes`), three web services (claim / dispute / transfer) + a platform-admin reassign service, four `runRoute` API endpoints, one admin route+page, and the dashboard banner + claim screen + hook. The one-root partial unique index (`user_roles_one_root_per_community`, shipped in Phase 1 migration 0015) is the concurrency authority: a losing concurrent claim is caught and returned as `already_claimed` (HTTP 200), never a 500. Spec: `docs/superpowers/specs/2026-06-10-role-simplification-phase2b-claim-root-design.md`.

**Tech Stack:** Drizzle ORM + drizzle-kit, PostgreSQL (Supabase, FORCE RLS), Next.js 15 / TypeScript, Vitest, Resend (email), TanStack Query.

---

## PR & deploy-gate map

| PR | Contents | Tasks | Gate |
|---|---|---|---|
| PR-2b-mig | Migration 0019 + schema + audit actions | 1 | normal CI |
| **PROD APPLY** | Apply 0019 to prod (pipeline does NOT migrate) | (runbook) | after PR-2b-mig merges; **STOP for approval** like 2a |
| PR-2b-app | Queries, services, routes, notifications, admin surface, web UI | 2–10 | merge after 0019 prod-applied |

## File structure

```
packages/db/src/schema/root-claim-disputes.ts        # NEW table schema
packages/db/src/schema/index.ts                       # export the new table
packages/db/migrations/0019_root_claim_disputes.sql   # generated migration
packages/db/src/utils/audit-logger.ts                 # +4 audit actions
packages/db/src/queries/rootless-communities.ts       # +findMyRootlessCommunities (scoped variant)
apps/web/src/lib/services/claim-root-service.ts        # NEW: claimRoot, claimAllRoots
apps/web/src/lib/services/root-dispute-service.ts      # NEW: openDispute, reassignRoot, transferRoot
apps/web/src/app/api/v1/communities/claim-root/{contract,route}.ts        # NEW
apps/web/src/app/api/v1/communities/dispute-root-claim/{contract,route}.ts # NEW
apps/web/src/app/api/v1/communities/transfer-root/{contract,route}.ts      # NEW
packages/email/src/emails/RootClaimedEmail.tsx         # NEW email template
apps/admin/src/app/api/admin/communities/reassign-root/route.ts # NEW (platform-admin)
apps/admin/src/app/communities/rootless/page.tsx       # EXTEND: add disputes + reassign action
apps/web/src/components/dashboard/ClaimRootBanner.tsx  # NEW
apps/web/src/app/(authenticated)/dashboard/claim-root/page.tsx # NEW screen
apps/web/src/hooks/use-claim-root.ts                   # NEW hooks: useMyRootless, useClaimRoot, useDisputeRootClaim
apps/web/src/app/api/v1/communities/my-rootless/{contract,route}.ts        # NEW GET (banner/screen read source)
```

**Note on `permission` metadata:** none of the four new routes declare a `permission` field. `'roles'` is not added to `RBAC_RESOURCES` until Phase 3 (verified: `packages/shared/src/rbac-matrix.ts` has no `'roles'`), and the contract suite asserts every declared permission is in the matrix — so declaring `roles:write` would fail CI. Each route's runtime authorization is an explicit check (claim/dispute: caller holds `property_manager`; transfer: caller is current `root_manager`; reassign: platform-admin). All role-write services that import `@propertypro/db/unsafe` need BOTH an `// AUTHZ:` comment AND a `WEB_UNSAFE_IMPORT_ALLOWLIST` entry in `scripts/verify-scoped-db-access.ts`.

---

### Task 1: Migration 0019 — `root_claim_disputes` + audit actions (PR-2b-mig)

**Files:**
- Create: `packages/db/src/schema/root-claim-disputes.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/utils/audit-logger.ts`
- Generated: `packages/db/migrations/0019_root_claim_disputes.sql` + snapshot + journal

- [ ] **Step 1: Create the schema** `packages/db/src/schema/root-claim-disputes.ts`. Mirror an existing tenant table for column/RLS conventions (read `packages/db/src/schema/user-preferences.ts` or another recent small table first):

```ts
import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Root-claim disputes (role-v3 Phase 2b). When a property_manager claims root,
 * other admins may dispute; an open row surfaces in the platform-admin queue
 * until reassigned/resolved. Platform-admin-scoped reads (no resident access);
 * tenant write-scope trigger applies via community_id.
 */
export const rootClaimDisputes = pgTable('root_claim_disputes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  claimedUserId: uuid('claimed_user_id').notNull().references(() => users.id),
  disputedByUserId: uuid('disputed_by_user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('open'), // 'open' | 'resolved'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
});
```

- [ ] **Step 2: Export it** — add `export * from './root-claim-disputes';` to `packages/db/src/schema/index.ts` (match the existing export style there).

- [ ] **Step 3: Add audit actions.** In `packages/db/src/utils/audit-logger.ts`, extend the `AuditAction` union (after the `'root_pending_deletion'` line from 2a):

```ts
  | 'root_claimed' | 'root_claim_disputed' | 'root_reassigned' | 'root_transferred';
```
(Replace the trailing `;` on the previous last member with `|` continuation as needed.)

- [ ] **Step 4: Generate the migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --name root_claim_disputes`
Expected: `migrations/0019_root_claim_disputes.sql` with `CREATE TABLE "root_claim_disputes" (...)` + FKs, journal idx 19, snapshot. Read the generated SQL.

- [ ] **Step 5: Add RLS + write-scope trigger to the migration.** Tenant tables require RLS + the community-scope trigger (see `.claude/rules/migration-safety.md` and `tenant-isolation.md`). Read how a recent tenant-table migration (e.g. `0011_user_preferences.sql`) declares RLS + `CREATE TRIGGER enforce_community_scope...`, and APPEND the equivalent to the generated 0019 SQL: enable RLS; the write-scope trigger keyed on `community_id`; and a **SELECT policy gated on `pp_rls_can_read_audit_log(community_id)`** — the existing admin-tier-or-platform-admin function (already bilingual from Phase-1 0016). This table is NOT resident-facing, so reuse that function verbatim rather than inventing a new policy — it is exactly the admin-tier read class this dispute queue belongs to. INSERT/UPDATE go through the privileged `db` path (service layer), same as `compliance_audit_log`.

- [ ] **Step 6: Verify ordering + build**

Run: `pnpm exec tsx scripts/verify-migration-ordering.ts` (idx 19); `pnpm turbo run build --filter='./packages/*' --force`; `cd packages/db && pnpm exec tsc --noEmit`.
(Do NOT `db:migrate` — local env is prod. Host-check rule from 2a applies.)

- [ ] **Step 7: Commit + open PR-2b-mig**

```bash
git checkout -b feat/role-v3-phase2b-migration origin/main
git add packages/db/
git commit -m "feat(db): migration 0019 — root_claim_disputes table + v3 claim/dispute/transfer audit actions"
```

---

### Task 2: `findMyRootlessCommunities` scoped query (PR-2b-app)

**Files:**
- Modify: `packages/db/src/queries/rootless-communities.ts`
- Test: `packages/db/__tests__/rootless-communities.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing file):

```ts
import { findMyRootlessCommunities } from '../src/queries/rootless-communities';
it('returns only communities where the user is property_manager and no root exists', async () => {
  const rows = await findMyRootlessCommunities('user-1');
  expect(Array.isArray(rows)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** (`cd packages/db && pnpm exec vitest run __tests__/rootless-communities.test.ts`).

- [ ] **Step 3: Implement** — add to `rootless-communities.ts` (reuse the file's existing `notExists`/`db`/operator imports):

```ts
export interface MyRootlessCommunityRow { id: number; name: string; slug: string; }

/**
 * Communities where `userId` holds property_manager AND no root_manager exists.
 * Drives the claim banner (count > 0) and the aggregated claim screen.
 */
export async function findMyRootlessCommunities(userId: string): Promise<MyRootlessCommunityRow[]> {
  return db
    .select({ id: communities.id, name: communities.name, slug: communities.slug })
    .from(communities)
    .innerJoin(userRoles, and(
      eq(userRoles.communityId, communities.id),
      eq(userRoles.userId, userId),
      eq(userRoles.role, 'property_manager'),
    ))
    .where(and(
      isNull(communities.deletedAt),
      notExists(
        db.select({ one: sql`1` }).from(userRoles)
          .where(and(eq(userRoles.communityId, communities.id), eq(userRoles.role, 'root_manager'))),
      ),
    ))
    .orderBy(communities.name);
}
```
(Confirm `sql` is imported from `drizzle-orm`; if the existing file aliases the inner `userRoles` to avoid the self-join ambiguity, use an alias — drizzle requires aliasing a table joined to itself in a correlated subquery. If ambiguity arises, import `alias` from `drizzle-orm/pg-core` and alias the inner `userRoles`.)

- [ ] **Step 4: Run → PASS.** Commit:

```bash
git checkout -b feat/role-v3-phase2b-app origin/main   # AFTER PR-2b-mig merged
git add packages/db/src/queries/rootless-communities.ts packages/db/__tests__/rootless-communities.test.ts
git commit -m "feat(db): findMyRootlessCommunities — caller-scoped rootless list"
```

---

### Task 3: `claimRoot` service with race-safe `already_claimed` (PR-2b-app)

**Files:**
- Create: `apps/web/src/lib/services/claim-root-service.ts`
- Test: `apps/web/__tests__/lib/services/claim-root-service.test.ts`

- [ ] **Step 1: Write the failing test.** Mock `createScopedClient` (the scoped write) + the membership/rootless checks. Assert: (a) a property_manager in a rootless community → role updated to root_manager, returns `{ claimed: true }`; (b) a unique-index violation on UPDATE → returns `{ claimed: false, reason: 'already_claimed' }` (NOT a throw); (c) caller not a property_manager → throws ForbiddenError; (d) community already has a root → returns `{ claimed: false, reason: 'already_claimed' }`. Model the mock on an existing service test that mocks `createScopedClient` (read `apps/web/__tests__/lib/services/` for one).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `claim-root-service.ts`:

```ts
// AUTHZ: claim-root is the one sanctioned path for a property_manager to become
// root (spec §3.5(1)(b)). It self-authorizes via the explicit property_manager +
// rootless checks below; findMyRootlessCommunities (cross-community) comes from
// @propertypro/db/unsafe. This file MUST be added to WEB_UNSAFE_IMPORT_ALLOWLIST
// in scripts/verify-scoped-db-access.ts (the // AUTHZ comment alone is insufficient
// — both guards apply; this is the #718 two-guard lesson).
import { createScopedClient, logAuditEvent, userRoles } from '@propertypro/db';
import { findMyRootlessCommunities } from '@propertypro/db/unsafe';
import { and, eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';
import { notifyRootClaimed } from '@/lib/services/claim-root-notify';

export interface ClaimResult { communityId: number; claimed: boolean; reason?: 'already_claimed'; }

/** Claim root for one community. Caller must hold property_manager there and the
 *  community must be rootless. Race-safe via the one-root partial unique index. */
export async function claimRoot(userId: string, communityId: number): Promise<ClaimResult> {
  const scoped = createScopedClient(communityId);
  // 1. caller holds property_manager here?
  const mine = await scoped.selectFrom(userRoles, {}, and(
    eq(userRoles.userId, userId), eq(userRoles.role, 'property_manager'),
  )) as Array<Record<string, unknown>>;
  if (mine.length === 0) throw new ForbiddenError('Only a property manager of this community can claim root.');
  // 2. community already has a root?
  const existingRoot = await scoped.selectFrom(userRoles, {}, eq(userRoles.role, 'root_manager')) as unknown[];
  if (existingRoot.length > 0) return { communityId, claimed: false, reason: 'already_claimed' };
  // 3. flip my row to root_manager — index makes a concurrent winner exclusive.
  try {
    await scoped.update(userRoles, { role: 'root_manager', updatedAt: new Date() },
      and(eq(userRoles.userId, userId), eq(userRoles.role, 'property_manager')));
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return { communityId, claimed: false, reason: 'already_claimed' };
    throw err;
  }
  await logAuditEvent({
    userId, action: 'root_claimed', resourceType: 'community', resourceId: String(communityId),
    communityId, newValues: { role: 'root_manager' },
  });
  // Best-effort: a Resend/notification failure must NOT 500 a claim that already
  // committed (nor abort a claim-all batch). Mirrors 2a's offboarding-flag posture.
  try {
    await notifyRootClaimed(communityId, userId);
  } catch (notifyErr) {
    console.warn('[claim-root] notify failed (claim already committed)', { communityId, notifyErr });
  }
  return { communityId, claimed: true };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}
```
(Confirm `createScopedClient`'s update/selectFrom signatures against an existing service — adapt method names to the real scoped-client API. `23505` is Postgres unique_violation.)

- [ ] **Step 4: Add `claimAllRoots`** in the same file: resolve `findMyRootlessCommunities(userId)` (already imported from `@propertypro/db/unsafe` above), call `claimRoot` per community, return `ClaimResult[]`. Wrap each in try/catch so one failure doesn't abort the batch (mirror `pm/bulk/*` allSettled style).

- [ ] **Step 5: Run → PASS.** Commit `feat(web): claimRoot + claimAllRoots service (race-safe via one-root index)`.

---

### Task 4: `RootClaimedEmail` + notify-other-PMs (PR-2b-app)

**Files:**
- Create: `packages/email/src/emails/RootClaimedEmail.tsx`, `apps/web/src/lib/services/claim-root-notify.ts`
- Test: `apps/web/__tests__/lib/services/claim-root-notify.test.ts`

- [ ] **Step 1: Email template** — mirror an existing template (read `packages/email/src/emails/WelcomeEmail.tsx`). Props: `{ claimantName, communityName, disputeUrl }`. Body: "{claimantName} is now the root manager of {communityName}. If this isn't right, dispute it." + a button to `disputeUrl`. Export from the package index like the others.

- [ ] **Step 2: Failing test** for `notifyRootClaimed(communityId, claimantUserId)`: asserts email + in-app notification go to the OTHER admins of the community (not the claimant). Mock the email sender + notification insert.

- [ ] **Step 3: Implement** `claim-root-notify.ts`: look up the community's other `property_manager`/`root_manager` users (exclude `claimantUserId`) via the unscoped/admin path used by other notification senders (read `apps/web/src/lib/services/notification-service.ts` recipient-lookup pattern + `account-lifecycle-service.ts` `lookupLifecycleAdminRecipients`; `// AUTHZ:` comment + db-access allowlist entry if it imports `@propertypro/db/unsafe`). Send `RootClaimedEmail` via the email service; create in-app notifications via the existing notification helper. `disputeUrl` = `${APP_URL}/...` pointing at the dispute action. Audit `notification_sent` if that's the existing convention.

- [ ] **Step 4: Run → PASS.** Commit `feat(web): RootClaimedEmail + notify other PMs on claim with dispute link`.

---

### Task 5: `claim-root` route (runRoute) (PR-2b-app)

**Files:**
- Create: `apps/web/src/app/api/v1/communities/claim-root/contract.ts`, `.../route.ts`
- Test: `apps/web/__tests__/api/communities/claim-root.test.ts`

- [ ] **Step 1: Contract** (mirror `apps/web/src/app/api/v1/residents/contract.ts` + a `tenantScope` example from a route that declares it):

```ts
import { defineRoute, z } from '@propertypro/api-contract';
const claimRootBodySchema = z.object({
  communityId: z.number().int().positive().optional(),
  claimAll: z.boolean().optional(),
}).refine((b) => b.communityId != null || b.claimAll === true, 'communityId or claimAll required');
export const claimRootRoute = defineRoute({
  method: 'POST', path: '/api/v1/communities/claim-root',
  body: claimRootBodySchema,
  // tenantScope omitted for claimAll (multi-community); single-claim resolves communityId in-handler.
  // NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3, and the
  // contract suite asserts every declared permission is in the matrix/9-pair allowlist —
  // declaring roles:write FAILS CI. The runtime gate is the explicit PM+rootless check.
});
```
(Read the real `defineRoute` signature — adapt field names. `permission` is optional on the contract. Because claimAll spans communities, this route does NOT declare a single `tenantScope`; resolve per-community in the handler — `guard:tenant-scope` tolerates a tenantScope-less route per api-patterns.md.)

- [ ] **Step 2: Failing test** — POST with `{communityId}` by a property_manager → 200 `{ data: { results: [{ communityId, claimed: true }] } }`; `{claimAll:true}` → per-community results; non-PM → 403.

- [ ] **Step 3: Route handler** `route.ts` (import `runRoute` from `@/lib/api/run-route`): authenticate (`requireAuthenticatedUserId`); if `claimAll`, call `claimAllRoots(userId)`; else `claimRoot(userId, communityId)` wrapped to a single-element array; return `NextResponse.json({ data: { results } })`. No `requirePermission` call (claim is the sanctioned PM→root path; the service does the explicit checks).

- [ ] **Step 4: Run → PASS.** Commit `feat(web): POST /api/v1/communities/claim-root (claim + claim-all)`.

---

### Task 6: dispute endpoint + record (PR-2b-app)

**Files:**
- Create: `apps/web/src/lib/services/root-dispute-service.ts` (start it here; transfer/reassign added in Tasks 7-8), `apps/web/src/app/api/v1/communities/dispute-root-claim/{contract,route}.ts`
- Test: service + route tests

- [ ] **Step 1: Failing test** for `openDispute(communityId, disputedByUserId)` (the disputer is a property_manager who believes the claim was wrong). Assert: (a) inserts an `open` row in `root_claim_disputes` with the current root as `claimedUserId`, audit `root_claim_disputed`; (b) **idempotent** — if an open dispute already exists for the community, no duplicate insert (returns `{ disputed: true, alreadyOpen: true }`); (c) **no-current-root case** — if the community has NO `root_manager` (root was vacated/transferred/reassigned since the email was sent), do NOT insert a null `claimed_user_id` (the column is NOT NULL → would 23502); return `{ disputed: false, reason: 'no_current_root' }` (HTTP 200, friendly — the dispute is moot).

- [ ] **Step 2: Implement** `openDispute`: resolve the community's current `root_manager`; **if none, return `{ disputed: false, reason: 'no_current_root' }` (do not insert)**; if an open row exists, return `{ disputed: true, alreadyOpen: true }`; else insert `{communityId, claimedUserId: <current root>, disputedByUserId, status:'open'}` via scoped client + audit `root_claim_disputed`. Add `// AUTHZ:` + allowlist if it imports `@propertypro/db/unsafe`.

- [ ] **Step 3: Contract + route** `POST /api/v1/communities/dispute-root-claim` (`tenantScope: { in: 'body' }`, body `{ communityId }`, **no `permission` field** — same Phase-3-matrix reason as claim-root): authenticate; require caller is a property_manager of the community (explicit check); call `openDispute(communityId, userId)`; return `{ data: <openDispute result> }`.

- [ ] **Step 4: Tests pass.** Commit `feat(web): dispute-root-claim endpoint + root_claim_disputes open record`.

---

### Task 7: `transferRoot` service + endpoint (API only) (PR-2b-app)

**Files:**
- Modify: `apps/web/src/lib/services/root-dispute-service.ts`
- Create: `apps/web/src/app/api/v1/communities/transfer-root/{contract,route}.ts`
- Test: service + route tests

- [ ] **Step 1: Failing test** for `transferRoot(communityId, fromUserId, toUserId)`: atomic swap (from → property_manager, to → root_manager) in ONE transaction; `to` must already hold `property_manager` in the community (else ForbiddenError); the one-root index holds (within-tx swap). Assert both rows updated.

- [ ] **Step 2: Implement** using a single transaction (the scoped client's transaction, or the unsafe-client transaction pattern used by `elections-service.ts`/`site-blocks-service.ts` — `// AUTHZ:` + allowlist if unsafe): verify `to` holds property_manager; in tx: set `from` row role→property_manager, set `to` row role→root_manager; audit `root_transferred`. Order the updates so the index never sees two roots mid-statement (demote `from` first, then promote `to`).

- [ ] **Step 3: Contract + route** `POST /api/v1/communities/transfer-root` (`tenantScope: { in: 'body' }`, body `{ communityId, toUserId }`, **no `permission` field** — `roles` is not in RBAC_RESOURCES until Phase 3; declaring it fails the contract suite): authenticate; **explicit runtime gate: caller is the community's current root_manager** (read membership; throw ForbiddenError otherwise); call `transferRoot(communityId, callerId, toUserId)`; `{ data: { transferred: true } }`.

- [ ] **Step 4: Tests pass.** Commit `feat(web): transferRoot service + POST /api/v1/communities/transfer-root (root-initiated, UI in 2c)`.

---

### Task 8: platform-admin reassign (apps/admin) (PR-2b-app)

**Files:**
- Modify: `apps/web/src/lib/services/root-dispute-service.ts` (add `reassignRoot`)
- Create: `apps/admin/src/app/api/admin/communities/reassign-root/route.ts`
- Modify: `apps/admin/src/app/communities/rootless/page.tsx` (add open-disputes list + reassign action)
- Test: service test

- [ ] **Step 1: Failing test** for `reassignRoot(communityId, newUserId, platformAdminUserId)`: atomic in one transaction — demote current root (if any) → property_manager, promote `newUserId` → root_manager, resolve any `open` dispute for the community (`status='resolved', resolvedAt, resolvedBy=platformAdminUserId`), audit `root_reassigned`. Assert: (a) happy path swaps both rows + resolves the dispute; (b) **`newUserId` must already hold a `property_manager` row in the community** — if they have no membership, or only a `resident` row, throw ForbiddenError (do NOT promote a resident → that would trip the prod `chk_owner_flag_resident_only` CHECK for unit owners, and reassign is for managers only); (c) no-current-root community → still promotes `newUserId` (covers the zero-PM... no: zero-PM communities have no property_manager to promote — those are assigned by a different path, out of scope; assert ForbiddenError "no eligible property_manager to promote").

- [ ] **Step 2: Implement** `reassignRoot` (unsafe/admin path — cross-community platform op; `// AUTHZ:` + WEB_UNSAFE_IMPORT_ALLOWLIST entry). Single transaction. Verify `newUserId` has a `property_manager` row in the community (else ForbiddenError); demote current root (if any) `property_manager`; promote the `newUserId` `property_manager` row → `root_manager` (NEVER insert a new row, NEVER promote a resident); resolve open disputes; audit.

- [ ] **Step 3: Admin route** `apps/admin/src/app/api/admin/communities/reassign-root/route.ts` — `requirePlatformAdmin()` (copy from the rootless report route); POST `{ communityId, newUserId }` → `reassignRoot(...)`. 

- [ ] **Step 4: Extend the rootless admin page** — read `apps/admin/src/app/communities/rootless/page.tsx` (from 2a); add a section listing `root_claim_disputes` where `status='open'` (query via the admin db path) with a reassign control per row, and reassign on the rootless communities too. Keep the admin app's plain-fetch/server-render style.

- [ ] **Step 5: Tests pass + both apps tsc.** Commit `feat(roles): platform-admin reassign-root + open-disputes admin queue`.

---

### Task 9: ClaimRootBanner + claim screen + hook (PR-2b-app)

**Files:**
- Create: `apps/web/src/components/dashboard/ClaimRootBanner.tsx`, `apps/web/src/app/(authenticated)/dashboard/claim-root/page.tsx`, `apps/web/src/hooks/use-claim-root.ts`
- Modify: the dashboard shell that renders banners (find it: grep for the "finish your site" banner component)
- Test: hook test + banner render test

- [ ] **Step 0: `GET /api/v1/communities/my-rootless` route** — the banner/screen/hook need the caller's rootless list, but `findMyRootlessCommunities` lives behind `@propertypro/db/unsafe` (components/hooks must not import it). Add a `runRoute` GET (contract + handler) that authenticates, calls `findMyRootlessCommunities(userId)`, and returns `{ data: { communities: [...] } }`. No `tenantScope` (cross-community by the caller's userId). This is the single read source for both the banner count and the claim screen. Add a focused route test.

- [ ] **Step 1: `useClaimRoot` + `useMyRootless` hooks** — mirror an existing query+mutation hook pair that uses `requestJson` (read `apps/web/src/hooks/` for one). `useMyRootless` GETs `/api/v1/communities/my-rootless`; `useClaimRoot` POSTs `/api/v1/communities/claim-root` and invalidates the `my-rootless` query; returns per-community results. TDD with a mocked `requestJson`.

- [ ] **Step 2: `ClaimRootBanner`** — client component shown only when the caller has rootless communities. **Gate the fetch on admin tier:** the dashboard already knows the membership; only render the banner (which calls `useMyRootless`) when `membership.isAdmin` (or the equivalent admin-tier flag the dashboard shell has) — a resident must never fire `useMyRootless` (their list is always empty, but skip the call entirely). Read the existing "finish your site" dashboard banner (grep `site_onboarding`; Phase-2 polish added a dashboard banner) and mirror it: dismissible per-session (sessionStorage key `claim-root-dismissed`), copy "This community has no root manager — claim it?", link to `/dashboard/claim-root`. Decorative icons `aria-hidden`, focus-visible preserved (design rules).

- [ ] **Step 3: Claim screen** `/dashboard/claim-root/page.tsx` — read the caller's rootless list via `useMyRootless`; render the list with per-community "Claim" buttons + a "Claim all" button wired to `useClaimRoot`; show per-community result (claimed / already claimed) and the "others will be notified" note. Handle loading/empty/error states per design rules (`docs/design-system`). Add a `PageHeader` + breadcrumb per the design rule.

- [ ] **Step 4: Dispute landing surface (closes the dispute loop).** The `RootClaimedEmail` dispute link is a GET URL — make it land somewhere actionable. Have it point to `/dashboard/claim-root?dispute=<communityId>`; when that query param is present, the claim screen renders a **"Dispute this claim?"** confirm card (community name + the claimant) with a confirm button that POSTs to `/api/v1/communities/dispute-root-claim` via a `useDisputeRootClaim` hook (mirror `useClaimRoot`), showing the result (`disputed` / `already open` / `no current root — nothing to dispute`). Without this, the email link lands on a page with no dispute affordance and the dispute loop is unreachable. Build the hook + the card here.

- [ ] **Step 5: Wire the banner** into the dashboard shell where the other banners render (behind the admin-tier gate from Step 2).

- [ ] **Step 6: Tests + verify.** `cd apps/web && pnpm exec vitest run __tests__/hooks/...` + component test (incl. the `?dispute=` card rendering + dispute hook). Commit `feat(web): claim-root banner + aggregated claim screen + dispute card + hooks`.

---

### Task 10: Close-out + verification + PRs

- [ ] **Step 1: Full battery** (no prod DB): `pnpm turbo run build --filter='./packages/*' --force`; `cd apps/web && pnpm exec tsc --noEmit`; `cd ../admin && pnpm exec tsc --noEmit`; `cd ../.. && pnpm lint` (includes `guard:db-access`, `guard:tenant-scope`, `guard:authz-comments`, `guard:legacy-roles`, `guard:contracts`); `pnpm exec tsx scripts/verify-migration-ordering.ts`; `pnpm --filter @propertypro/web build`.
- [ ] **Step 2: Contract-suite** — the 4 new routes (claim-root, dispute-root-claim, transfer-root, my-rootless) are enumerated by `apps/web/__tests__/api-contract-suite/`; run it. They declare **no `permission` field** (deliberate — `roles` isn't in RBAC_RESOURCES until Phase 3), so the RBAC-metadata check is a no-op for them; the malformed-input→400 check still applies (the suite unwraps the claim-root `.refine`'d `ZodEffects` — verified it handles this). Confirm green; do NOT add `roles:write` to any contract to "fix" a failure — that's the wrong direction.
- [ ] **Step 3: db-access allowlist** — any new file importing `@propertypro/db/unsafe` (notify, dispute/transfer/reassign services) must be added to `WEB_UNSAFE_IMPORT_ALLOWLIST` in `scripts/verify-scoped-db-access.ts` AND carry an `// AUTHZ:` comment (both guards — the 2a lesson). Run `pnpm guard:db-access` to confirm.
- [ ] **Step 4: Open PR-2b-mig (Task 1) and PR-2b-app (Tasks 2-9).** Merge PR-2b-mig → **STOP for approval** → apply 0019 to prod (read the generated 0019 SQL; apply via Supabase MCP; verify the table exists + RLS) → append evidence to a Phase-2b audit note → merge PR-2b-app.
- [ ] **Step 5:** Next migration after this plan = **0020** (Phase 4 cleanup). Then write **Plan 2c** (root-only role-management UI: assign/revoke property_manager, set designations, the transfer UI consuming the 2b transfer endpoint).

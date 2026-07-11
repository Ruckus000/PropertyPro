# Role Simplification — Phase 2c (Root-Only Role Management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `root_manager` a `/settings/roles` screen + root-only endpoints to promote/revoke `property_manager`, set board `designation`s, and transfer root — and close the residents-PATCH manager-tier escalation path.

**Architecture:** Three root-only `runRoute` endpoints (assign/revoke role-assignments, set/clear designations) backed by one `role-management-service`, all single-community (scoped client, no unsafe). Each endpoint gates on the explicit "caller is this community's current `root_manager`" check (NOT `requirePermission` — `roles` enters `RBAC_RESOURCES` in Phase 3). Invariants are enforced at the service + the existing partial unique indexes (one root, one board_president). Transfer reuses the 2b endpoint. **No migration** — `designation`, both indexes, and the CHECK shipped in Phase 1. Spec: `docs/superpowers/specs/2026-06-11-role-simplification-phase2c-role-management-design.md`.

**Tech Stack:** Next.js 15 / TypeScript, Drizzle (scoped client), Vitest, TanStack Query, Zod.

---

## File structure

```
packages/db/src/utils/audit-logger.ts                                  # +4 AuditAction values
apps/web/src/lib/services/role-management-service.ts                    # NEW: assign/revoke/setDesignation
apps/web/src/app/api/v1/communities/role-assignments/{contract,route}.ts # NEW: POST assign + DELETE revoke
apps/web/src/app/api/v1/communities/designations/{contract,route}.ts    # NEW: POST set/clear
apps/web/src/lib/utils/role-validator.ts                               # +assertResidentTierRole
apps/web/src/app/api/v1/residents/route.ts                             # lockdown: reject manager-tier on PATCH
apps/web/src/components/residents/resident-form.tsx                    # narrow role picker to resident-tier
apps/web/src/hooks/use-role-management.ts                              # NEW: the 4 hooks
apps/web/src/app/(authenticated)/settings/roles/page.tsx              # NEW: server gate + shell
apps/web/src/components/settings/RolesAccessClient.tsx                 # NEW: the sections
```

---

### Task 1: Audit actions + `role-management-service`

**Files:**
- Modify: `packages/db/src/utils/audit-logger.ts`
- Create: `apps/web/src/lib/services/role-management-service.ts`
- Test: `apps/web/__tests__/lib/services/role-management-service.test.ts`

- [ ] **Step 1: Add the 4 audit actions.** In `packages/db/src/utils/audit-logger.ts`, extend the `AuditAction` union after the `root_transferred` line:

```ts
  | 'role_assigned' | 'role_revoked' | 'designation_set' | 'designation_cleared';
```
(Fix the trailing `;`/`|` continuation.)

- [ ] **Step 2: Write the failing service test.** Mock `createScopedClient`, `logAuditEvent` (model the mock on `apps/web/__tests__/lib/services/root-dispute-service.test.ts` — it mocks `@propertypro/db` scoped client + `logAuditEvent`). Cover:

```ts
// assignPropertyManager
it('promotes a resident to property_manager + audits role_assigned', async () => { /* scoped.update called role->property_manager; logAuditEvent role_assigned */ });
it('is idempotent — already property_manager returns alreadyAssigned', async () => { /* selectFrom finds property_manager → { assigned:true, alreadyAssigned:true }, no update */ });
it('rejects targeting the current root (ForbiddenError)', async () => { /* target row role=root_manager → throws */ });
// revokePropertyManager
it('demotes a property_manager to resident (isUnitOwner false) + audits role_revoked', async () => {});
it('no-ops when target is not a property_manager', async () => { /* { revoked:false, reason:'not_a_property_manager' } */ });
it('rejects revoking the root (ForbiddenError)', async () => { /* role=root_manager → throws "transfer root first" */ });
// setDesignation
it('sets board_member on an owner-resident + audits designation_set', async () => {});
it('clears designation (null) + audits designation_cleared', async () => {});
it('requires ack for a tenant target (NonOwnerAckRequiredError)', async () => { /* resident isUnitOwner=false, no ack → throws */ });
it('allows a tenant target when acknowledgeNonOwner=true', async () => {});
it('reassigns board_president atomically (clears prior president then sets)', async () => { /* two updates in one transaction */ });
it('rejects designations on apartment communities (ValidationError)', async () => {});
```

- [ ] **Step 3: Run → FAIL** (`cd apps/web && pnpm exec vitest run __tests__/lib/services/role-management-service.test.ts`).

- [ ] **Step 4: Implement** `apps/web/src/lib/services/role-management-service.ts` (single-community → scoped client; no `@propertypro/db/unsafe`):

```ts
import { createScopedClient, logAuditEvent, userRoles } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import type { CommunityType } from '@propertypro/shared';

export class NonOwnerAckRequiredError extends Error {
  constructor() { super('Board eligibility acknowledgement required for a non-owner.'); this.name = 'NonOwnerAckRequiredError'; }
}

export interface AssignResult { assigned: true; alreadyAssigned: boolean; }
export interface RevokeResult { revoked: boolean; reason?: 'not_a_property_manager'; }
export type Designation = 'board_president' | 'board_member';

async function roleOf(scoped: ReturnType<typeof createScopedClient>, userId: string): Promise<{ role: string; isUnitOwner: boolean } | null> {
  const rows = (await scoped.selectFrom(userRoles, {}, eq(userRoles.userId, userId))) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return { role: String(row['role']), isUnitOwner: row['isUnitOwner'] === true };
}

/** Promote an existing member to property_manager. Idempotent. Never the root. */
export async function assignPropertyManager(communityId: number, targetUserId: string, actorUserId: string): Promise<AssignResult> {
  const scoped = createScopedClient(communityId);
  const target = await roleOf(scoped, targetUserId);
  if (!target) throw new ValidationError('Target is not a member of this community.');
  if (target.role === 'root_manager') throw new ForbiddenError('Cannot change the root manager here — use Transfer root.');
  if (target.role === 'property_manager') return { assigned: true, alreadyAssigned: true };
  await scoped.update(userRoles, { role: 'property_manager', isUnitOwner: false, presetKey: null }, eq(userRoles.userId, targetUserId));
  await logAuditEvent({ userId: actorUserId, action: 'role_assigned', resourceType: 'community', resourceId: String(communityId), communityId, newValues: { userId: targetUserId, role: 'property_manager' } });
  return { assigned: true, alreadyAssigned: false };
}

/** Demote a property_manager to resident (tenant by default). Never the root. */
export async function revokePropertyManager(communityId: number, targetUserId: string, actorUserId: string): Promise<RevokeResult> {
  const scoped = createScopedClient(communityId);
  const target = await roleOf(scoped, targetUserId);
  if (!target) return { revoked: false, reason: 'not_a_property_manager' };
  if (target.role === 'root_manager') throw new ForbiddenError('Transfer root before changing the root manager.');
  if (target.role !== 'property_manager') return { revoked: false, reason: 'not_a_property_manager' };
  await scoped.update(userRoles, { role: 'resident', isUnitOwner: false }, eq(userRoles.userId, targetUserId));
  await logAuditEvent({ userId: actorUserId, action: 'role_revoked', resourceType: 'community', resourceId: String(communityId), communityId, newValues: { userId: targetUserId, role: 'resident' } });
  return { revoked: true };
}

/** Set/clear a board designation. condo/HOA only; one-president via atomic clear-then-set; tenant requires ack. */
export async function setDesignation(
  communityId: number, communityType: CommunityType, targetUserId: string,
  designation: Designation | null, acknowledgeNonOwner: boolean, actorUserId: string,
): Promise<{ ok: true }> {
  if (communityType === 'apartment') throw new ValidationError('Apartment communities have no board.');
  const scoped = createScopedClient(communityId);
  const target = await roleOf(scoped, targetUserId);
  if (!target) throw new ValidationError('Target is not a member of this community.');
  if (designation !== null && target.role === 'resident' && !target.isUnitOwner && !acknowledgeNonOwner) {
    throw new NonOwnerAckRequiredError();
  }
  if (designation === 'board_president') {
    // One president: clear the existing president (if any) then set — one transaction so the index never sees two.
    await scoped.transaction(async (tx) => {
      await tx.update(userRoles, { designation: null }, eq(userRoles.designation, 'board_president'));
      await tx.update(userRoles, { designation: 'board_president' }, eq(userRoles.userId, targetUserId));
    });
  } else {
    await scoped.update(userRoles, { designation }, eq(userRoles.userId, targetUserId));
  }
  await logAuditEvent({ userId: actorUserId, action: designation === null ? 'designation_cleared' : 'designation_set', resourceType: 'community', resourceId: String(communityId), communityId, newValues: { userId: targetUserId, designation } });
  return { ok: true };
}
```
(Verify the scoped client exposes `.transaction()` — read `packages/db/src/scoped-client.ts`; if scoped doesn't expose a transaction, the atomic clear-then-set uses the same two-update ordering as 2b's transfer via the unscoped-tx pattern — but prefer scoped. If scoped has no `.transaction`, do the two updates sequentially clear-then-set: the partial unique index still holds because the clear commits first. Adapt and note which you used.)

- [ ] **Step 5: Run → PASS.** Commit `feat(roles): role-management service (assign/revoke PM, set designation) + audit actions`.

---

### Task 2: The three root-only endpoints

**Files:**
- Create: `apps/web/src/app/api/v1/communities/role-assignments/{contract,route}.ts`, `.../designations/{contract,route}.ts`
- Test: `apps/web/__tests__/api/communities/role-assignments.test.ts`, `.../designations.test.ts`

- [ ] **Step 1: role-assignments contract** (mirror `apps/web/src/app/api/v1/communities/transfer-root/contract.ts` — NO `permission`, `tenantScope: { in: 'body' }`):

```ts
import { defineRoute, z } from '@propertypro/api-contract';
const bodySchema = z.object({ communityId: z.number().int().positive(), userId: z.string().uuid() });
export const assignRoleContract = defineRoute({ method: 'POST', path: '/api/v1/communities/role-assignments', request: { body: bodySchema }, response: z.unknown(), tenantScope: { in: 'body' } });
export const revokeRoleContract = defineRoute({ method: 'DELETE', path: '/api/v1/communities/role-assignments', request: { body: bodySchema }, response: z.unknown(), tenantScope: { in: 'body' } });
```
(If the runner doesn't accept a DELETE body cleanly, switch the DELETE to `tenantScope: { in: 'query' }` with `userId`+`communityId` as query params — read `.claude/rules/api-patterns.md`: bodyless DELETE uses query tenantScope. Note which you used.)

- [ ] **Step 2: role-assignments route** (mirror transfer-root/route.ts — root-identity gate, then service):

```ts
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { assignPropertyManager, revokePropertyManager } from '@/lib/services/role-management-service';
import { assignRoleContract, revokeRoleContract } from './contract';

async function requireRoot(communityId: number): Promise<string> {
  const callerId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, callerId);
  if (membership.role !== 'root_manager') throw new ForbiddenError('Only the root manager can manage roles.');
  return callerId;
}

export const POST = withErrorHandler(runRoute(assignRoleContract, async ({ body, communityId }) => {
  const callerId = await requireRoot(communityId);
  return assignPropertyManager(communityId, body.userId, callerId);
}));

export const DELETE = withErrorHandler(runRoute(revokeRoleContract, async ({ body, communityId }) => {
  const callerId = await requireRoot(communityId);
  return revokePropertyManager(communityId, body.userId, callerId);
}));
```

- [ ] **Step 3: designations contract + route** — body `{ communityId, userId, designation: z.enum(['board_president','board_member']).nullable(), acknowledgeNonOwner: z.boolean().optional() }`; route gates root, reads `membership.communityType`, calls `setDesignation(...)`. Map `NonOwnerAckRequiredError` → a 409 response: catch it in the handler and `throw new AppError('non_owner_requires_ack', 409, 'NON_OWNER_ACK_REQUIRED')` (read `apps/web/src/lib/api/errors.ts` for the `AppError` shape; `withErrorHandler` only special-cases `AppError`). `ValidationError` (apartment) → 400 automatically.

- [ ] **Step 4: Route tests** — assign by root → 200; non-root → 403; revoke-root → 403; designation tenant w/o ack → 409, with ack → 200; apartment designation → 400; malformed body → 400. Model on `apps/web/__tests__/api/communities/transfer-root` (the 2b route tests).

- [ ] **Step 5: Run → PASS.** Commit `feat(web): root-only role-assignments + designations endpoints`.

---

### Task 3: Residents-PATCH lockdown + resident-form narrowing

**Files:**
- Modify: `apps/web/src/lib/utils/role-validator.ts`, `apps/web/src/app/api/v1/residents/route.ts`, `apps/web/src/components/residents/resident-form.tsx`
- Test: `apps/web/__tests__/api/residents` (extend) + `apps/web/__tests__/lib/role-validator.test.ts`

- [ ] **Step 1: Failing test** for `assertResidentTierRole`: `assertResidentTierRole('resident')` ok; `assertResidentTierRole('property_manager')`/`'root_manager'`/`'manager'`/`'pm_admin'` → throws. Plus a residents-PATCH integration-ish test: PATCH with `role:'property_manager'` → 403 (the lockdown).

- [ ] **Step 2: Implement `assertResidentTierRole`** in `role-validator.ts`:

```ts
import { ForbiddenError } from '@/lib/api/errors';  // if not already imported here; else throw the validator's own error type
const MANAGER_TIER = new Set(['manager', 'pm_admin', 'property_manager', 'root_manager']);
/** The residents path may only set resident-tier roles; manager/root are root-only (Roles & Access). */
export function assertResidentTierRole(role: string): void {
  if (MANAGER_TIER.has(role)) {
    throw new ForbiddenError('Manager roles are assigned from Roles & Access (root only).');
  }
}
```
(If `role-validator.ts` is a pure util that shouldn't import the API error class, instead return a boolean `isResidentTierRole(role)` and throw `ForbiddenError` at the residents-route call site. Pick the cleaner option for this file — read its current imports.)

- [ ] **Step 3: Wire into the residents PATCH** — in `apps/web/src/app/api/v1/residents/route.ts`, after resolving `newRole` and before `validateRoleAssignment`, call `assertResidentTierRole(newRole)` (or the call-site throw). So a manager-tier role via that route 403s.

- [ ] **Step 4: Narrow the resident-form picker** — in `apps/web/src/components/residents/resident-form.tsx`, restrict the role options to resident-tier (Owner / Tenant). Read the current `ROLE_OPTIONS` (it has legacy preset options like CAM/Board); remove the manager/board options (those move to Roles & Access). Update any test snapshot/option-count assertions.

- [ ] **Step 5: Run → PASS** (`cd apps/web && pnpm exec vitest run __tests__/api/residents __tests__/lib/role-validator.test.ts`). Commit `fix(roles): lock residents-PATCH to resident-tier; narrow resident-form picker (close escalation path)`.

---

### Task 4: `/settings/roles` screen + hooks

**Files:**
- Create: `apps/web/src/hooks/use-role-management.ts`, `apps/web/src/app/(authenticated)/settings/roles/page.tsx`, `apps/web/src/components/settings/RolesAccessClient.tsx`
- Test: hook test + a component render test

- [ ] **Step 1: Hooks** (`use-role-management.ts`) — `useAssignPropertyManager` (POST /role-assignments), `useRevokePropertyManager` (DELETE /role-assignments), `useSetDesignation` (POST /designations — surfaces the 409 ack-required as a typed result so the UI can show the checkbox), `useTransferRoot` (POST /transfer-root — reuse). All via `requestJson`, invalidating the roster query. TDD with mocked `requestJson` (mirror `apps/web/src/hooks/use-claim-root.ts` from 2b).

- [ ] **Step 2: Server page** `settings/roles/page.tsx` — resolve membership; **gate `if (membership.role !== 'root_manager') redirect('/dashboard')`** (mirror the 2b claim screen's server gate); render `<PageHeader breadcrumb={<Breadcrumbs items=[{label:'Settings',href:'/settings'}] currentLabel="Roles & Access" />} title="Roles & Access">` then `<RolesAccessClient communityId={...} communityType={membership.communityType} currentRootUserId={...} />`. Pass the roster server-side or let the client fetch it.

- [ ] **Step 3: RolesAccessClient** — four sections per spec §5:
  - **Current root + Transfer**: typed-confirm modal (type the community name; "you will become a property_manager" notice) → `useTransferRoot`.
  - **Property managers**: list + inline-confirm Revoke → `useRevokePropertyManager`.
  - **Members roster**: Promote-to-PM → `useAssignPropertyManager`.
  - **Board (condo/HOA only — hidden on apartment)**: set/clear board_president (inline confirm to reassign) + board_member; on a tenant target, the 409 surfaces an "I confirm per our bylaws" checkbox that re-submits with `acknowledgeNonOwner`. Static note: "Board eligibility is governed by your bylaws and Florida statute; PropertyPro records the designation you set and does not determine eligibility."
  Loading(Skeleton)/empty(EmptyState)/error(AlertBanner)/success states; status = icon+text+color; decorative icons `aria-hidden`; focus-visible preserved. Components use the hooks, NOT raw fetch (guard:component-api-calls).

- [ ] **Step 4: Run tests + verify.** Commit `feat(web): /settings/roles root-only role-management screen + hooks`.

---

### Task 5: Close-out

- [ ] **Step 1: Full battery** (no prod DB): `pnpm turbo run build --filter='./packages/*' --force`; `cd apps/web && pnpm exec tsc --noEmit`; `cd ../.. && pnpm lint` (db-access, tenant-scope, authz-comments, component-api-calls, breadcrumbs, contracts, legacy-roles); `pnpm --filter @propertypro/web build`.
- [ ] **Step 2: Contract suite** — the 3 new routes (assign POST, revoke DELETE, designations POST) enumerated by `apps/web/__tests__/api-contract-suite/`; they declare NO `permission` (→ rbac-inapplicable) and use `tenantScope: { in: 'body' }` (or query for DELETE). Confirm malformed-input→400 passes for each. Do NOT add a `permission` field to fix a failure.
- [ ] **Step 3: db-access** — the service uses `createScopedClient` (no unsafe), so no allowlist entry needed; confirm `pnpm guard:db-access` is clean.
- [ ] **Step 4: Edge-case coverage check** (spec §7) — confirm tests exist for: assign-already-PM no-op, revoke-non-PM no-op, revoke-root 403, president atomic reassign (no 23505), tenant-designation 409→ack 200, apartment 400, non-root 403 on all four, residents-PATCH rejects manager-tier, resident-form resident-tier only, server gate redirects non-root.
- [ ] **Step 5: Open the PR** (single PR — no migration, no prod-apply gate). After merge: the role-simplification program's next chunk is **Phase 3** (the vocabulary drain + turning on root-only `roles:write` enforcement, which retires these explicit per-endpoint root checks into the RBAC matrix). Phase 4 cleanup migration stays **0020**.

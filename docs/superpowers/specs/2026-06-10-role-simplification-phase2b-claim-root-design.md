# Phase 2b — Claim-Root Flow Design

**Date:** 2026-06-10
**Status:** Approved by product owner (UX decisions below); implementation plan to follow
**Parent spec:** `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §4 Phase 2
**Depends on:** Phase 2a (merged + prod-applied) — backfill left every community rootless (`root_manager` vacant); `findRootlessCommunities()` exists; `checkPermissionV2` resolves a null-permissions `property_manager` to the full `property_manager_admin` matrix.

## 1. Purpose

After the 2a backfill, every existing community has no `root_manager`. Phase 2b lets a `property_manager` **claim** root for the communities they manage, notifies the other admins so a wrongful claim can be **disputed**, gives platform admins a **reassign** override, and ships the **root-transfer** API (its UI lands in 2c). There is no lockout pressure yet — root-only enforcement of billing/deletion/role-assignment is Phase 3 — so the claim flow has runway to roll out before any feature depends on root being filled.

## 2. UX decisions (product owner, 2026-06-10)

1. **Surface:** dismissible dashboard banner (per-session dismiss), not a blocking modal.
2. **Multi-community:** one aggregated claim screen — "Claim all" + per-community toggles.
3. **Dispute model:** claim is immediate (first-come, enforced by the one-root partial unique index); dispute is reactive (notify + flag for platform-admin review).
4. **Notify channels:** email (Resend) + in-app notification to the community's other property_managers; the message carries a dispute link.
5. **Transfer:** API built in 2b; UI in 2c. Root-initiated, atomic swap.
6. **Eligibility:** any `property_manager` may claim; zero-PM communities remain in the rootless report for platform-admin assignment.

## 3. Components & boundaries

### 3.1 Rootless detection (caller-scoped)
A new scoped query `findMyRootlessCommunities(userId)` returning the communities where the caller holds `property_manager` AND the community has no `root_manager`. Single grouped query (no per-community N+1). Reuses the 2a `findRootlessCommunities` SQL shape (the `NOT EXISTS root_manager` predicate) intersected with the caller's memberships. Drives both the banner (count > 0 → show) and the aggregated claim screen (the list).

### 3.2 Claim service + endpoint
- `POST /api/v1/communities/claim-root` (runRoute contract, `tenantScope: { in: 'body' }`) — body: `{ communityId }` or `{ claimAll: true }`.
- Service `claimRoot(userId, communityId)`:
  1. Verify caller holds `property_manager` in `communityId` (scoped membership check).
  2. Verify the community has no `root_manager` (re-checked server-side).
  3. `UPDATE user_roles SET role='root_manager', updated_at=now() WHERE user_id=$caller AND community_id=$c AND role='property_manager'`. The `user_roles_one_root_per_community` partial unique index makes a concurrent double-claim a clean loser → the loser's `UPDATE` violates the index → caught → returned as `{ claimed: false, reason: 'already_claimed' }` (HTTP 200, not an error).
  4. Audit `root_claimed` (per-community row; `compliance_audit_log.community_id` is NOT NULL).
  5. Fire notifications (§3.3) to the community's other property_managers.
- Claim-all: resolve `findMyRootlessCommunities`, claim each; return per-community results (`claimed` / `already_claimed`), mirroring the bulk-results pattern from `pm/bulk/*`.
- **Permission note:** claiming is NOT gated through `requirePermission('roles','write')` (that's root-only and would forbid a property_manager from claiming). It's a dedicated capability gated by the two explicit checks above (holds property_manager + community rootless). This is the one sanctioned path by which a property_manager becomes root (spec §3.5(1)(b)).

### 3.3 Notification + dispute
- On successful claim, notify every OTHER `property_manager`/`root_manager` (there won't be another root, but defensive) of `communityId`:
  - **Email** via Resend (new template `RootClaimedEmail`): "{claimant} is now the root manager of {community}. If this isn't right, dispute it." with a dispute link.
  - **In-app notification** (existing notification-service) with the same dispute link.
- **Dispute record:** a new lightweight table `root_claim_disputes` (`id`, `community_id` FK, `claimed_user_id`, `disputed_by_user_id`, `status` `open|resolved`, `created_at`, `resolved_at`, `resolved_by`). Rationale: 2a's offboarding used audit-only, but a dispute needs a **resolvable, queryable** status for the admin queue — audit rows are append-only and can't carry open/resolved state. Small, platform-admin-scoped (no `community_id`-based RLS needed beyond the standard; reads via the unsafe/admin path like the rootless report). Migration **0019**.
- `POST /api/v1/communities/dispute-root-claim` (the dispute link target; authenticated as a property_manager of that community): inserts an `open` dispute row + audit `root_claim_disputed`.

### 3.4 Platform-admin override (apps/admin)
- Admin route + page extending the rootless report area: lists **open disputes** and **rootless communities**. For each, a **reassign** action: `reassignRoot(communityId, newUserId)` — atomic in one transaction: demote current root (if any) → `property_manager`, promote `newUserId`'s `property_manager` row → `root_manager`; resolve any open dispute for that community. Platform-admin auth (`requirePlatformAdmin`). Audit `root_reassigned`.

### 3.5 Root transfer (API in 2b, UI in 2c)
- Service `transferRoot(communityId, fromUserId, toUserId)` — root-initiated; atomic swap (from → property_manager, to → root_manager) in one transaction; `to` must already hold `property_manager` in the community. The one-root index holds throughout (swap within a transaction). Audit `root_transferred`.
- `POST /api/v1/communities/transfer-root` (runRoute, `tenantScope: { in: 'body' }`). The contract declares `permission: 'roles:write'` for forward-compatibility with Phase 3's root-only matrix, but the **runtime gate is an explicit "caller is the community's current root_manager" check** (mirrors the claim pattern), because root-only enforcement of `roles:write` does not exist until Phase 3.
- UI deferred to 2c's role-management screen; the API + tests ship in 2b so platform-admin reassign and 2c both consume one transfer primitive.

### 3.6 Banner + claim screen (apps/web)
- `<ClaimRootBanner>` — rendered in the authenticated dashboard shell when `findMyRootlessCommunities` count > 0; dismissible per-session (sessionStorage); links to the claim screen. Follows the existing dashboard-banner pattern (`finish your site`).
- Claim screen at `/dashboard/claim-root` (or under settings): server-renders the list; "Claim all" + per-community claim buttons; optimistic UI via a `useClaimRoot` hook (`requestJson`); shows per-community result + the dispute/notification note.

## 4. Security invariants (spec §3.5)

- `root_manager` is written only via: claim (vacancy + property_manager check), transfer (current-root check), platform-admin reassign. No other path.
- Resident-minting paths remain untouched.
- Every role-write (claim/transfer/reassign/dispute) audit-logged.
- New endpoints: `runRoute` contracts with `tenantScope`; claim/transfer/dispute use the canonical `{ data: ... }` envelope and `requestJson` consumers.

## 5. Migration

- **0019 — `root_claim_disputes` table** (+ `community_id` FK with `onDelete: cascade`, RLS, write-scope trigger per tenant-table convention; or platform-admin-scoped like the report — decide in plan based on whether residents ever read it: they don't, so platform-admin/unsafe read + tenant write trigger). Next migration after this is **0020** (Phase 4 cleanup moves to 0020+).

## 6. Testing

- Claim: happy path (property_manager → root); race (two claimers, index loser gets `already_claimed`, not a 500); rejection (non-PM caller; community already has root); claim-all per-community results.
- Notification fires to other PMs only (not the claimant); dispute link records an open dispute.
- Reassign: atomic demote+promote; resolves open dispute; platform-admin-only.
- Transfer: atomic swap; current-root-only; `to` must be an existing property_manager.
- Real-path permission test: a freshly-claimed root_manager passes `requirePermission` for root-tier actions (and, until Phase 3, property_managers still operate normally).
- CI: `guard:tenant-scope`, `guard:db-access` (allowlist any new unsafe consumer), `guard:authz-comments`, contract suite for the new routes.

## 7. Out of scope (→ later)

- Root-only ENFORCEMENT of billing/deletion/role-assignment (Phase 3 — that's when a rootless community would actually be limited).
- The root-only role-management UI (2c) — assign/revoke property_manager, set designations, the transfer UI.
- 72-hour intent window / approval-gated claims (considered, rejected — immediate+reactive is sufficient with no lockout).

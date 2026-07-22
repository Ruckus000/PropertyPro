# Phase 3.2 — Board-Targeting Repoint (presetKey → designation) Design

**Date:** 2026-06-12
**Status:** Approved by product owner (decisions below); implementation plan to follow
**Parent spec:** `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §3.2 (Designation), §3.3 (What dissolves)
**Depends on:** Phases 1 / 2a / 2b / 2c / 3.1 (all merged + live). `designation` exists on `user_roles` and on `CommunityMembership` (3.1); the canonical `BoardDesignation` type + `BOARD_DESIGNATIONS` const live in guard-exempt `packages/shared/src/role-transition.ts` (3.1).

## 1. Purpose

Repoint every consumer that reads a board `presetKey` (`'board_president'` / `'board_member'`) to mean "board member" so it sources from `designation` instead. This MUST land before `presetKey` is dropped (3.3 / Phase 4). It also brings the remaining board-preset **writers** into lockstep (board preset ⇒ identical designation) so rows minted during the transition window stay visible to the repointed targeting.

## 2. Verified current state (the reason this is behavior-neutral)

Confirmed against code + prod (read-only Supabase MCP) on 2026-06-12:

- Prod `user_roles`: **579 board-preset rows = 579 designation rows, 0 mismatches** (`preset_key` and `designation` identical on every row; all are `property_manager`). Full distribution: resident 442; property_manager + board_president 461 / + board_member 118 / + cam 2 / + site_manager 48 / + NULL 221; 0 root_manager. **0 designations on non-management roles.** Every reader repoint below therefore selects exactly the same rows as today.
- `PM_SCOPE_DB_ROLES` (`role-transition.ts`) includes `property_manager`, so in the access-request and billing-recipient services the role arm already matches **every** prod admin row — the `board_president`/`cam` preset arms there are subsumed (dead in prod, alive only for hypothetical legacy `manager` rows).
- Verified reader surface (each checked against current code):
  1. `apps/web/src/lib/services/announcement-delivery.ts` `isAudienceMatch` (:52-64) — `board_only` = manager-tier role AND board presetKey.
  2. `apps/web/src/lib/services/notification-service.ts` `isRoleMatch` (:193-211) — same predicate; feeders pass `presetKey` at :406 / :804-806.
  3. `apps/web/src/lib/db/public-community-reader.ts` `getContactInfo` (:341-379) — the PUBLIC §718 board roster: SQL `role IN MANAGER_TIER AND presetKey IN (board_*)`; title fallback reads `presetKey`. **Statutory transparency surface — a silently-empty roster is a compliance regression.**
  4. `apps/web/src/lib/services/access-request-service.ts` (:236-244) — admin-notify recipients = `presetKey='board_president'` OR `presetKey='cam'` OR PM-scope role.
  5. `apps/web/src/lib/services/billing-upgrade-requests-service.ts` (:15, :46-50) — `BILLING_ADMIN_PRESETS = {board_president, cam}`; recipients = PM-scope OR (manager-tier AND billing preset).
  6. `packages/shared/src/billing/permissions.ts` `inferCanonicalRoleFromMembership` (:39-56) — maps manager-tier + board presetKey → legacy board names, feeding `canManageBilling` / sidebar / feature gates. File is guard-EXEMPT.
  7. `apps/web/src/app/(authenticated)/welcome/page.tsx` `resolveEffectiveDisplayRole` (:85-86) — display-only board distinction from presetKey.
- Verified writer surface (board presetKey written withOUT designation today):
  1. `packages/db/src/seed/seed-community.ts` `mapCanonicalToV2` (:256-259) — demo seeds mint `manager` + board preset, **no designation** → without lockstep, the repoint silently empties `board_only` and the roster in every seeded environment.
  2. `apps/web/src/lib/services/onboarding-service.ts` `createOnboardingResident` (:118-131) — mints `manager` + caller-supplied preset (reached via `POST /api/v1/residents/invite`).
  3. `apps/web/src/app/api/v1/import-residents/route.ts` (:58-72) — CSV legacy roles map to `manager` + board preset.
  4. `apps/admin/src/app/api/admin/communities/[id]/members/[userId]/route.ts` member-PATCH — accepts `preset_key` (incl. board values) and has **no designation concept**.
  - `demo-conversion.ts` (:303-313) already writes designation in lockstep (Phase 2a) — no change.

## 3. Decisions (product owner, 2026-06-12)

1. **`board_only` audiences (announcements + notifications): pure designation check, role-independent** — `designation != null` matches the parent spec ("designation valid on ANY role"), is behavior-neutral today (0 non-management designations), and forward-looking: a future resident-held board seat receives board announcements. The manager-tier role arm is dropped, not repointed.
2. **Public §718 roster: `designation IN ('board_president','board_member')`, any role.** The statutory board IS the set of designation holders. Title fallback reads designation. Same 579 rows today.
3. **Access-request notify: PM-scope roles OR `designation = 'board_president'`.** President arm repointed to designation (future-proof for a resident president); dead `cam`-preset arm dropped (cam-preset rows are `property_manager`, covered by the role arm).
4. **Billing: repoint reads only; the authority model change is deferred.** 3.2 makes the board-distinguishing reads designation-sourced so behavior is byte-identical and presetKey becomes droppable. The actual billing-authority change (root-only per parent spec §3.3) stays in 3.3/3.4. Billing temporarily reads designation — a documented transitional exception to "general permissions never read designation," deleted with the shim in Phase 4.
5. **Scope = readers + writer lockstep.** The 4 writers above set `designation` identical to any board `presetKey` they write, keeping the prod invariant true for new rows through the window. presetKey writes themselves are untouched (dropped in 3.3/Phase 4).
6. **Invite/import manager-minting escalation gap (parent spec §3.5 invariant 3 violation) is a separate follow-up task**, not folded into this behavior-neutral PR (chip `task_be56f05e`).
7. **No migration, no data change, no prod-apply gate.** Single code-only PR off origin/main; this spec + the plan are docs-only on their own branch.

## 4. Target model

### 4.1 Shared helpers (packages/shared/src/role-transition.ts — guard-exempt)

Next to `BOARD_DESIGNATIONS` / `BoardDesignation` (added in 3.1):

```ts
/** Canonical "is a board member" predicate (role-v3 §3.2). Sole source for board targeting from 3.2 on. */
export function hasBoardDesignation(value: unknown): value is BoardDesignation {
  return typeof value === 'string' && (BOARD_DESIGNATIONS as readonly string[]).includes(value);
}

/** President-only arms (access-request notify, billing president check). */
export function isBoardPresident(value: unknown): boolean {
  return value === 'board_president';
}
```

Consumers in guard-scanned files use these helpers (never inline `'board_president'`/`'board_member'` literals — `guard:legacy-roles` ratchet, floor 254).

### 4.2 Reader repoints

| # | Site | Today | Becomes |
|---|---|---|---|
| 1 | `announcement-delivery.ts` `isAudienceMatch` | manager-tier role AND board presetKey | `hasBoardDesignation(opts?.designation)` — role arm dropped. `resolveRecipients` threads `row['designation']` (rows are already `SELECT *`'d — zero query cost); `presetKey` opt removed. |
| 2 | `notification-service.ts` `isRoleMatch` + feeders :406/:804 | same | same; feeders pass `designation` instead of `presetKey`. `community_admins` filter (role-based) untouched. |
| 3 | `public-community-reader.ts` `getContactInfo` | SQL `role IN MANAGER_TIER AND presetKey IN (board_*)` | SQL `inArray(userRoles.designation, [...BOARD_DESIGNATIONS])` — role + preset clauses dropped; select `designation`; title fallback `isBoardPresident(row.designation) ? 'Board President' : 'Board Member'` (helper comparison — no new literal in this guard-scanned file; see 4.5). `users.deletedAt` filter and ordering unchanged. |
| 4 | `access-request-service.ts` notify | `presetKey='board_president'` OR `presetKey='cam'` OR PM-scope role | PM-scope role OR `isBoardPresident(row designation)` |
| 5 | `billing-upgrade-requests-service.ts` | PM-scope OR (manager-tier AND `presetKey IN {board_president, cam}`) | PM-scope OR (manager-tier AND (`isBoardPresident(designation)` OR `presetKey === 'cam'`)). The `cam` preset arm survives for hypothetical legacy `manager` rows; it dies in 3.3. |
| 6 | `permissions.ts` `inferCanonicalRoleFromMembership` | manager-tier switch on `presetKey` | gains optional `designation?: string \| null` input; for manager-tier rows, designation is checked **before** the preset switch (`board_president`/`board_member` from designation win). Preset board cases retained as bilingual fallback for callers not yet passing designation. The load-bearing default branch (`property_manager`+null→`'cam'`, `manager`+null→`'board_member'`) is untouched. Call sites that have a membership/row with designation pass it. |
| 7 | `welcome/page.tsx` `resolveEffectiveDisplayRole` | two `presetKey === 'board_*'` lines | designation checked first (via helpers), presetKey lines retained as fallback during the window. Display-only. |

### 4.3 Writer lockstep (board preset ⇒ identical designation)

| # | Site | Change |
|---|---|---|
| 1 | `seed-community.ts` `mapCanonicalToV2` + its insert site | board canonical roles also emit `designation` = the board value; insert writes it. `seed:verify` covers it. |
| 2 | `onboarding-service.ts` `createOnboardingResident` | when the written `presetKey` is a board value, write `designation` = same value (derive via `hasBoardDesignation`). |
| 3 | `import-residents/route.ts` CSV mapping | board CSV roles emit `designation` alongside the preset. |
| 4 | admin member-PATCH (`apps/admin`) | when the PATCH includes `preset_key`: board value ⇒ `designation` := same; non-board/null ⇒ `designation` := null. When `preset_key` is absent, designation untouched. Accepted edge: a root-set designation on a row is cleared if a platform admin later PATCHes that row's preset to a non-board value — consistent with lockstep during the window; the admin app gets a real designation concept in 3.3. The one-president partial unique index backstops a duplicate-president PATCH (DB error → 500-class failure surfaced to the platform admin; acceptable for the internal admin tool this phase). |

The root-only `POST /communities/designations` endpoint (2c) is **untouched** — it remains the only deliberate designation-management path; it intentionally does NOT write presetKey (designation is the future, preset is legacy).

### 4.4 What does NOT change

- Billing authority: board presidents keep purchase rights through the window (`canManageBilling` output identical for every prod row). Root-only billing is 3.3/3.4.
- `requireBoardDesignation()` and the 3.1 statutory gates — untouched.
- The strict-root 2c endpoints (role-assignments / designations / transfer-root) — untouched.
- All presetKey **writes** keep being written (bilingual window); no JSONB/permissions changes; no contracts gain a `permission` for `roles` (`roles` ∉ RBAC_RESOURCES until 3.3).
- No migration. Next migration number stays **0020** (Phase 4).

### 4.5 Guard impact

`guard:legacy-roles` (floor 254) counts `'board_president'`/`'board_member'` literals in scanned files. The repoint REPLACES existing literals at sites 1–5/7 with helper references → the count drops; ratchet the FLOOR down to the new `--report` count in the same PR. New comparisons in scanned files must use the helpers; `role-transition.ts` and `billing/permissions.ts` are the only EXEMPT files. The admin-app lockstep maps `preset_key` (an already-counted enum in that file) — keep new literals out by deriving designation from the validated preset value, not fresh literals.

## 5. Testing

- **Helpers:** `hasBoardDesignation` / `isBoardPresident` truth tables (board values, null, undefined, junk strings).
- **Per reader:** (a) designation-without-preset matches (the new canonical row shape); (b) resident + designation matches `board_only` / roster / president-notify (forward-looking — currently zero rows); (c) board-preset-WITHOUT-designation **no longer** matches (deliberate: designation is now the source of truth; prod has zero such rows and writers are in lockstep); (d) plain property_manager (no designation) does NOT match `board_only` (same as today); (e) access-request + billing recipients: PM-scope rows still always match; legacy `manager`+`cam` preset still matches billing recipients.
- **`inferCanonicalRoleFromMembership`:** designation wins over preset; preset-only still maps (bilingual fallback); default branches unchanged (`property_manager`+null→cam, `manager`+null→board_member).
- **Per writer:** seed mapping emits designation for board roles; onboarding/import write designation in lockstep; admin PATCH sets/clears designation with `preset_key` and leaves it untouched when `preset_key` absent.
- **Test-mock sweep:** new imports from `@propertypro/shared` in mocked modules → grep `vi.mock('@propertypro/shared'` across `apps/web/__tests__` and `apps/admin` tests; add the new exports to every factory (known CI trap).
- **Verification battery:** full guards + `cd apps/web && pnpm exec tsc` + `pnpm turbo run build --filter='./packages/*' --force` + unit tests + contract suite. NEVER run db:migrate or the integration vitest config locally (local DATABASE_URL = prod). Local `pnpm --filter @propertypro/web build` fails on unrelated `Missing DATABASE_URL` accounting routes — environmental; CI Build is the gate.
- **§718 roster prod equivalence:** read-only Supabase SQL pre-merge (done: 0 mismatches) and re-run post-deploy: rows matched by the old predicate (manager-tier + board preset) vs the new (designation IN board) — symmetric difference must be 0 per community.

## 6. Scope

One code-only PR off origin/main: shared helpers + 7 reader repoints + 4 writer lockstops + tests + guard floor ratchet. Spec/plan are docs-only on `feat/role-v3-phase3.2-board-repoint-spec`.

## 7. Out of scope (recorded)

- **Invite/import manager-minting lockdown** (§3.5 invariant-3 violation) — follow-up chip `task_be56f05e`.
- **Admin-app designation UI/API surface** (first-class designation field, president-conflict UX) — 3.3.
- **Matrix collapse, preset/JSONB drop, `BILLING_ADMIN_*` retirement, `inferCanonicalRoleFromMembership` deletion** — 3.3 / Phase 4.
- **Root-only billing/deletion/settings enforcement** — 3.4.

## 8. Open questions (recorded, not blocking)

- Should `board_only` announcement audiences eventually include a president-only variant? (No current product ask.)
- 3.3 must decide the fate of `displayTitle` defaults currently derived from presets at the writers ("Board President" etc.) — cosmetic, follows the preset drop.

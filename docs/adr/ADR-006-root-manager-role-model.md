# ADR-006: Root-Manager Role Model (supersedes ADR-001)

- Status: Accepted
- Date: June 15, 2026
- Amended: 2026-09-23 — as-shipped consolidation of the 2026-07-18 / 07-20 /
  08-07 addenda into one transition-status record (audit item R3-06), plus a
  correction to what `designation` actually gates (§2a, audit item R3-05). The
  decision itself is unchanged; only the description of what has landed, and the
  precision of §2's rule, were.
- Supersedes: [ADR-001 Canonical Role Model](./ADR-001-canonical-role-model.md)
- Deciders: Product Owner, Engineering
- Scope: Community role vocabulary, authorization model, board designation, provisioning constraints
- Design source: [`docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md`](../superpowers/specs/2026-06-10-root-manager-role-simplification-design.md)

## Context

ADR-001 proposed a seven-value domain-role enum (`owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`). In practice the **storage** layer had already collapsed to three roles (`resident` + `isUnitOwner`, `manager` + `presetKey`, `pm_admin`), while the seven-role vocabulary persisted only in the derived/RBAC layer — two models bridged by manager presets. This split created ambiguity and a large maintenance surface (the `RBAC_MATRIX`, manager presets, per-membership `permissions` JSONB, ~300 role string literals, 45 help articles).

The product owner approved a simplification to **three community roles plus a board designation**. This ADR records that model and supersedes ADR-001.

## Decision

### 1) Canonical community roles (`user_roles.role`)

| Role | Cardinality | Powers |
|---|---|---|
| `root_manager` | ≤ 1 per community (partial unique index; vacancy allowed) | Everything, including the four root-exclusive powers: role assignment, billing/subscription, community deletion, root transfer. |
| `property_manager` | unbounded; minted only by the root | Uniform operational power set (the union of the legacy cam / site_manager / property_manager_admin operational capabilities), minus the four root-exclusive powers. |
| `resident` | unbounded | As today; `isUnitOwner` distinguishes owner vs tenant for voting, assessments, leases, and billing CTAs. |

`platform_admin` remains system-scoped and is **not** stored in `user_roles` (unchanged from ADR-001).

### 2) Board designation (new, orthogonal to role)

- A nullable `designation` column on `user_roles`: `board_president | board_member`, valid on **any** role.
- ≤ 1 `board_president` per community (partial unique index).
- **General permissions never read `designation`.** "General permissions" means
  the `RBAC_MATRIX` / `checkPermissionV2` layer of §3, and that is still exactly
  true. It is NOT true that only three statutory features consult `designation`
  anywhere in the app — §2a enumerates every gate site that actually shipped,
  states the rule precisely, and says which half of that surface a guard may
  assert on. Read §2a before writing anything that claims to enforce this
  bullet. A self-managed board president is `root_manager` + `board_president`
  designation.

### 2a) What `designation` actually gates (as-shipped correction, 2026-09-23)

§2 as originally written said "general permissions never read `designation`" and
listed three statutory features. The sentence is still true of the matrix it
names — `RBAC_MATRIX` and `checkPermissionV2` (§3) do not read `designation` at
all, and never have. What eroded is the implication that those three features are
the whole list: measured 2026-09-23 there are **twelve gate sites**, itemised in
the census at the end of this section (several files carry more than one call).
This matters because Phase 2 is expected to turn §2 into a guard, and a guard
written from the shorthand would flag legal code.

**The rule, stated precisely (corrected 2026-09-28): `designation` grants
read/egress breadth** — including *initiating* egress operations, whose
bookkeeping writes (creating an export-job row, cancelling one) are the
mechanism by which the egress happens — **plus one closed set of statutory
board writes on elections and violations**, enumerated below. Outside that set
it never authorizes a write to a community business record.

> **Correction (2026-09-28).** The 2026-09-23 text of this section said
> designation "never grants write" and that `requireBoardDesignation`'s
> designation arm is "unreachable". That was true of **meetings** only. The
> RBAC matrix deliberately gives owners AND tenants `write` on `elections` and
> `violations` (the two-tier model: residents vote and self-report; admin
> actions are checked at the route), so on those two resources
> `requireBoardDesignation` is the ONLY thing between a resident and the admin
> actions — and a board-designated resident passes it. That is deliberate
> (board members run elections and enforce covenants; `setDesignation` seats a
> non-owner only with `acknowledgeNonOwner`, and
> `apps/web/__tests__/lib/statutory-gates.test.ts` pins that a non-owner
> designee passes), but it IS a designation-granted business-record write, and
> a guard written from the old text would have certified it as narrowing.

Two halves of that sentence do different work, and collapsing them is the
failure mode:

- "Never write" is too broad as a literal claim about SQL. A board member who
  starts an export does cause INSERTs and UPDATEs — on `community_export_jobs`.
  Those writes are not a business record being edited; they are the ledger of
  the egress itself, and there is no way to let a board member retrieve the
  association's statutory records without admitting them. The honest statement
  is that designation never authorizes a write **to a community business
  record**.
- The "grants" half is what makes the rule checkable, and it is the half the
  shorthand hid. See *Grant versus restrict* below.

**Grant versus restrict — the distinction a guard has to key on.** `designation`
enters a decision in one of two syntactic shapes, and they are opposite:

- **Granting shape** — `isAdmin || hasBoardDesignation(designation)`. Read
  left-to-right, `designation` is on the *positive* side of an OR: it can only
  **add** a caller that the role gate would have refused. Every one of the twelve
  shipped sites that uses this shape is a read, an egress, an audience
  selection, or a UI affordance. **None reaches a community business record.**
- **`requireBoardDesignation(membership)`** — `apps/web/src/lib/db/access-control.ts:103-107`
  (docblock `:85-102`), written `canActAsBoard(membership)` —
  `membership.isAdmin || hasBoardDesignation(membership.designation)`, exported so
  pages showing the matching controls use the identical predicate
  and applied as a **second gate after** `requirePermission(resource, 'write')`.
  Whether it restricts or grants depends on what the role gate before it
  already admitted:
  - **Meetings — restricting.** Residents hold no `meetings:write` (matrix
    owner/tenant rows), so everyone who reaches the second gate
    (`api/v1/meetings/route.ts:178`, board-type meetings) is already `isAdmin`:
    the designation arm cannot fire. Narrowing-only; the ROLE authorizes.
  - **Elections and violations — granting.** Owners and tenants hold `write`
    on both, so a resident reaches the second gate, and a board-designated one
    passes it. Here designation IS the authority for the admin action.

**Sanctioned designation-granted statutory writes (the complete set today).**
Via `requireElectionsAdminRole` (`apps/web/src/lib/elections/common.ts:23`) on
`api/v1/elections/[id]/` **open, close, certify, cancel, eligibility**, and
**proxies/[proxyId]/approve, reject**; and via `requireViolationAdminWrite`
(`apps/web/src/lib/violations/common.ts:34`) on `api/v1/violations/[id]`
**PATCH**, and `[id]/`**resolve, dismiss, fine, notice, hearing-notice**. Both
resources are excluded for apartments, which have no board (`setDesignation`
refuses them). Adding a route to this list requires amending this ADR.

**Therefore the guard must encode: `designation` may GRANT access to a path that
mutates a community business record ONLY through `requireBoardDesignation` on
the routes enumerated above (plus the two export-bookkeeping POSTs below) —
NOT "no designation-gated mutation"**, which would fail every sanctioned
statutory route and earn an exemption instead of a read.

**The guard has to key on an allow-list, not on syntax or call order.** A regex
hunting for an OR'd `designation` test flags `requireBoardDesignation` itself,
and "preceded by `requirePermission(..., 'write')`" proves nothing on elections
or violations, where that role gate admits residents
(`api/v1/elections/[id]/certify/route.ts:51-52` is the canonical pair). So the
checkable proposition is: *`requireBoardDesignation` is the only OR'd
`designation` predicate on a mutation path, and every call site of it (or of
the two wrappers) is on the enumerated list above or is the meetings route.*
Any other granting predicate reaching a mutation is a violation.

Two things the guard must NOT be, which the wording above invites:

- Not a claim that statutory writes *require* a designation. Management-tier
  callers pass every one of these gates on `isAdmin` alone; a guard asserting
  "statutory writes require a designation" would report a gate the code does not
  perform — the exact defect class `guard:legacy-roles` pass 2 was built to catch.
- Not a licence to widen the list. Granting residents `meetings:write` (a
  resident-held board seat calling board meetings) would turn the meetings
  site into a designation-**granted** write too; that is a statutory exception
  needing its own ADR amendment — not a silent update to this section.

**Sanctioned egress-bookkeeping writes.** Besides the statutory list above, these
two are the only writes a granting `designation` predicate admits, and adding a
third requires amending this ADR:

- `POST /api/v1/export/jobs` — creates the export job
  (`apps/web/src/app/api/v1/export/jobs/route.ts:21-22`).
- `POST /api/v1/export/jobs/[jobId]/cancel` — marks that job cancelled
  (`apps/web/src/app/api/v1/export/jobs/[jobId]/cancel/route.ts:18-19`).

Both go through `requireExportAccess` → `requireExportPermission` →
`isExportEligible`
(`apps/web/src/lib/services/export/export-route-auth.ts:116-127`), whose
predicate is `membership.isAdmin || hasBoardDesignation(membership.designation)`
at `:127`. Both write only export-job bookkeeping, and both are deliberately
*not* entitlement-gated: Florida associations carry record-retention duties
(§718.111(12)(b)) and the Terms promise retrieval after a lapse. The same
predicate also gates the legacy synchronous `POST /api/v1/export`
(`apps/web/src/app/api/v1/export/route.ts:12-14`) on purpose — two gates that can
drift is how one of them ends up wrong again.

**Census (measured 2026-09-23, `grep -rn
"hasBoardDesignation\|requireBoardDesignation\|canActAsBoard" apps/web/src packages/shared/src`;
rows 13–15 added 2026-09-30).**
The audit that raised R3-05 named two sites (export eligibility, insurance
recipients). The growth is **wider** than that — twelve sites — and they are not
all the same kind of thing:

| # | Site | Shape | Kind | What `designation` does |
|---|---|---|---|---|
| 1 | `apps/web/src/lib/services/export/export-route-auth.ts:127` | grant | **read/egress breadth** | `isExportEligible` admits board designees to the full record set, and admits the two sanctioned bookkeeping POSTs |
| 2 | `apps/web/src/app/(authenticated)/settings/export/page.tsx:54` | grant | UI mirror of #1 | shows/hides the export affordance with the same predicate |
| 3 | `apps/web/src/lib/services/notification-service.ts:200` | grant | **audience targeting** | `board_only` recipient filter resolves from designation, role-independently |
| 4 | `apps/web/src/lib/services/announcement-delivery.ts:51` | grant | **audience targeting** | `board_only` announcement audience, same rule |
| 5 | `apps/web/src/lib/services/insurance-alert-processor.ts:84-88` | grant | **audience selection only** | `isBoardOrAdminRecipient` picks WHO receives the alert. It authorizes no business-record write: the send is a system-actor cron, and no user request reaches this predicate as an authorization check. |
| 6 | `apps/web/src/lib/utils/compliance-cta.ts:41` | grant | **UI gating** | chooses the CTA label/handler a board designee sees; the underlying write still goes through the normal permission path |
| 7 | `apps/web/src/lib/services/onboarding-checklist-service.ts:89` | grant | **UI gating** | which onboarding checklist a board member is shown (`isBoardPresident` at `:85` resolves designation first) |
| 8 | `apps/web/src/components/compliance/compliance-command-center.tsx:37` | grant | **UI gating** | board vs. manager persona label |
| 9 | `apps/web/src/components/compliance/compliance-command-center.tsx:41` | grant | **UI gating** | board vs. manager view of the compliance centre |
| 10 | `apps/web/src/components/onboarding/welcome-screen.tsx:65,77,94` | grant | **UI gating** | welcome-screen persona and panel selection |
| 11 | `apps/web/src/app/api/v1/meetings/route.ts:178` | **restrict** | statutory mutation, narrowing-only | `requireBoardDesignation` gates creating / updating a `meetingType: 'board'`; residents hold no `meetings:write`, so the ROLE authorizes the write |
| 12 | `apps/web/src/lib/elections/common.ts:23` (`requireElectionsAdminRole`) and `apps/web/src/lib/violations/common.ts:34` (`requireViolationAdminWrite`), on the routes enumerated above | **grant** | **sanctioned statutory write** | residents hold `elections`/`violations` write, so the designation arm is what admits a board-designated resident (incl. an acknowledged non-owner) to the admin actions |
| 13 | `apps/web/src/app/(authenticated)/communities/[id]/board/elections/page.tsx` (`canActAsBoard`) | grant | **UI mirror of #12 (elections)** | shows the election admin controls (open/close/certify/cancel, eligibility snapshot, proxy approve/reject) with the same predicate as the API gate; proxy **revoke** stays on `isAdmin` or the grantor (`elections-service.ts` revokeProxy). |
| 14 | `apps/web/src/lib/announcements/read-visibility.ts` (`canReadAnnouncementAudience`) | grant | **read breadth, mirror of #4** | a board designee can read the `board_only` announcements #4 delivers to them |
| 15 | `apps/web/src/lib/help/reader.ts` (`boardSeat`) | grant | **UI gating** | shows the resident section's `boardOnly` help articles (election administration, export) — documentation of #1 and #13, no access of its own |
| 16 | `apps/web/src/lib/violations/common.ts` (`getViolationReadUnitIds`, `canActAsBoard`), used by the violations list/detail/search routes, `/violations`, `/violations/[id]` and the dashboard card | grant | **read breadth + UI mirror of #12 (violations)** | a board designee reads every unit's violations and gets the admin actions #12 already allows; creating a violation against any unit stays manager-only (no designation arm on POST). Every other resident reads their own units only — the dashboard card included |

Items 1–10 and 13–15 grant, and none of them mutates a business record. Item 11
restricts. Item 12 grants a business-record write — the sanctioned statutory set
enumerated above, and the only one. (Row 12 was classified "restrict,
narrowing-only" until 2026-09-28; see the correction note at the top of §2a.)

Note also what the census proves by absence: `RBAC_MATRIX` / `checkPermissionV2`
(§3) still do not read `designation` at all. The "general permissions" claim has
not eroded; what grew is the statutory-plus-egress-plus-targeting set around the
matrix.

### 3) Permission resolution

Authorization is enforced at the route/query layer via `requirePermission()` → `checkPermissionV2()` against the declarative `RBAC_MATRIX`. The matrix is keyed by community type × role × resource → `{read, write}`. Resident rows split internally by `isUnitOwner` (owner vs tenant policy). `root_manager` and `property_manager` resolve to the uniform full-operational policy. A `roles:write` action is root-only (enforced today by explicit `role === 'root_manager'` checks at the role-management endpoints).

### 4) Community-type constraints

| Community Type | Roles | Designations | `isUnitOwner` |
|---|---|---|---|
| `condo_718`, `hoa_720` | resident, property_manager, root_manager | allowed (board_president / board_member) | owner + tenant |
| `apartment` | resident, property_manager, root_manager | not used | tenant only (no owners) |

### 5) Provisioning & lifecycle

- The community **creator is the root** (`root_manager`), wired into the admin-minting paths.
- Resident-minting paths (join-requests, access-requests, CSV import, resident invite, resident-service) can never write a manager-tier role; only the root mints `property_manager`. (Enforced via `isResidentTierRole`.)
- Backfill left the root **vacant**; admins claim root on next authenticated load (first-claim-wins + dispute flag + platform-admin override).
- Claim, transfer, demotion, and designation changes are written to `compliance_audit_log`.

## What dissolved (cleanup, as shipped)

This section was written in the future tense. It is now a record.

`presetKey`, the per-membership `permissions` JSONB, and `legacyRole` were kept
read-only through the transition and **were dropped by the Phase 4 cleanup
migration**, which shipped as
`packages/db/migrations/0020_role_v3_cleanup.sql:36-38` (three
`ALTER TABLE public.user_roles DROP COLUMN IF EXISTS` statements, in that
order: `permissions`, `preset_key`, `legacy_role`). The `manager` / `pm_admin`
enum values and the stray `super_admin` value were removed in the same rebuild
(`0020_role_v3_cleanup.sql:43-45`: a fresh 3-value `user_role_v2_new` enum
replacing the old type). The legacy seven-role `RBAC_MATRIX` columns collapsed
to the three-role policy in the same phase (R3-01, shipped — see the as-shipped
status below).

Nothing in this section is pending. If you are reading it as a to-do list, stop:
the columns it names no longer exist, so a follow-up "cleanup" here has nothing
to clean.

## Transition status (as shipped)

> **Consolidated 2026-09-23 (audit item R3-06).** This section had grown into
> three separately-written addenda — 2026-07-18, 2026-07-20 and 2026-08-07 —
> stacked newest-first on top of a still-future-tense status list. Written at
> different moments, each one correctly described the world *as of its own
> date*, and together they had begun to contradict one another and the code:
> the 07-18 note declared a deferred bullet done while the bullet underneath it
> still said the same thing was deferred, and the 08-07 note closed R3-03 while
> leaving R3-03b standing as open. The three are collapsed below into **one**
> as-shipped record, organised by what shipped rather than by when the sentence
> was written.
>
> **Nothing was erased.** The provenance lines immediately below name each
> original addendum's date and what it recorded, so the ADR keeps the history
> that makes its conclusions auditable. Sub-section headings carry the date of
> the measurement they rest on.
>
> **Provenance**
> - **Addendum 2026-07-18** recorded that **Phase 4.1 had shipped**: migration
>   `0020` (role-v3 enum rebuild + column drops) live, and `checkPermissionV2`
>   (`apps/web/src/lib/db/access-control.ts`) resolving `property_manager` /
>   `root_manager` to the uniform management-tier row instead of reading the
>   per-row `permissions` JSONB — which made the then-first "Deferred" bullet
>   **done**. It listed as still open: the legacy seven-role `RBAC_MATRIX`
>   collapse (four columns unreachable at the choke point), the Phase 4.4 bridge
>   drain, and the Phase 3.4 root-only billing/deletion cutover (then still
>   gated on claim-root adoption). It referred to
>   `docs/audits/2026-07-18-refactor-audit-and-cleanup-roadmap.md` §4.2
>   (R3-01…R3-07).
> - **Addendum 2026-07-20** recorded that **role-v3 was fully landed**: the
>   7-role `RBAC_MATRIX` collapse (R3-01) + v1 `checkPermission` deletion
>   (R3-07), the bridge drain (R3-02) + billing-admin fix (R3-04), the
>   management-tier matrix-key rename to `manager`, the dead `user_role` pgEnum
>   drop (R3-06 — applied to prod as a verified no-op, both migration ledgers
>   reconciled), the global `CommunityRole` 7→3 narrowing, and the role
>   type/const alias consolidation had all shipped; the runtime role vocabulary
>   was v3-only, the compatibility shim was gone, and the `guard:legacy-roles`
>   STRUCTURAL + BRIDGE buckets were empty. It named exactly one item still
>   deferred: Phase 3.4 root-only billing/deletion, gated on claim-root
>   adoption by design.
> - **Addendum 2026-08-07** recorded that **Phase 3.4 had shipped**, retiring
>   R3-03 (the last deferred item) and with it the claim-root adoption gate, and
>   set out the enforcement points, the deliberate non-scope, the PM-experience
>   decision, rootless recovery, the zero-PM break-glass and the seed fix. It
>   left R3-03b (root self-deletion orphaning a community) open as a tracked
>   follow-up.
> - **Closure note 2026-08-09**, recorded here for the first time and
>   **superseding the 08-07 addendum's "R3-03b open" wording**: the root
>   offboarding **acknowledgement gate shipped**. It is *not* a hard block, and
>   that part of the original reasoning still stands — see *R3-03b* below.
> - **Correction 2026-09-23 (R3-06)**: this consolidation. Also struck from the
>   standing list: a bullet claiming that `checkPermissionV2` had yet to stop
>   reading the per-row JSONB — which the 07-18 note had already declared done,
>   and which the code has not done since `0020` dropped the column. Superseded
>   wording is described rather than re-quoted, and annotated in place rather
>   than silently deleted, so a reader holding an older revision can see what
>   changed and why — while this file keeps no standing copy of the false claim.

### Shipped, as of 2026-09-23

The model was delivered in phases (1 → 4) behind a compatibility shim and a
`guard:legacy-roles` floor, with no flag day. **Every phase is now complete;
nothing in this list is deferred.**

- **Live — the model itself:** the `designation` column + its gates
  (`requireBoardDesignation`, plus the read/egress and audience-targeting sites
  enumerated in §2a), the root claim/transfer/dispute flow, creator-is-root,
  resident-tier minting lockdown, and the board-targeting + vocabulary drains.
- **Live — Phase 4.1 (recorded shipped 2026-07-18):** migration `0020`
  (`packages/db/migrations/0020_role_v3_cleanup.sql`) — the role-v3 enum rebuild
  and the `permissions` / `preset_key` / `legacy_role` column drops, at `:36-38`
  and `:43-45` respectively.
- **Live — uniform management-tier permissions.** Making `property_manager`
  permissions **uniform** in `checkPermissionV2` was once deferred to a
  product-signed-off step, on the grounds that it would genuinely widen access
  for the minority of rows still carrying restricted preset-derived
  permissions, and that the uniform policy would only arrive with that
  sign-off — leaving the JSONB as the live source in the meantime. **Both
  halves of that bullet are historical.** The columns
  are gone (`0020:36-38`), and `checkPermissionV2`
  (`apps/web/src/lib/db/access-control.ts:42-56`) reads only the static
  `RBAC_MATRIX`: `resident` resolves to the `owner` or `tenant` row via
  `isUnitOwner`, and both management roles resolve to the single `manager` row.
  There is no per-row override path left to read and no restricted
  preset-derived row left to widen. **Do not write a guard, a plan step or a
  migration that assumes otherwise — the state it would be protecting against no
  longer exists, and a check for it can only ever pass vacuously.**
- **Live — Phase 4.2–4.4 vocabulary cleanup (recorded shipped 2026-07-20):** as
  itemised in the 07-20 provenance line above, including the R3-01 matrix
  collapse and the R3-02 bridge drain. The runtime role vocabulary is v3-only,
  the compatibility shim is deleted, the dead `user_role` pgEnum is dropped, and
  the `guard:legacy-roles` STRUCTURAL + BRIDGE buckets are empty.
- **Live — Phase 3.4 root-only billing/deletion (shipped 2026-08-07):** R3-03
  was the last deferred item; role-v3 has had no open work since.
- **Live — R3-03b root-offboarding acknowledgement gate (shipped 2026-08-09):**
  closes the one follow-up the 08-07 addendum left open. See below.

### Why the claim-root adoption gate no longer applies (measured against prod 2026-08-06, shipped 2026-08-07)

The gate existed to prevent locking out every admin in communities with no
claimed root. Measured against prod on 2026-08-06, all 7 live communities were
non-customers — ids 1–3 are `pnpm seed:demo` fixtures that leaked into prod,
133/134/135/147 are demo conversions, and there were **zero paying customers**.
3 of 7 held a root; the 4 rootless ones **each had ≥1 `property_manager`**, so
every one was self-claimable, and none had zero managers. There was no real
admin to lock out, and the lockout was recoverable everywhere it could occur.
The window only narrows as customers arrive, which is why this shipped then
rather than later. Re-verify before any similar change:

```sql
select c.id, c.slug, c.subscription_status,
       count(*) filter (where r.role='root_manager')     as roots,
       count(*) filter (where r.role='property_manager') as pms
from communities c left join user_roles r on r.community_id = c.id
where c.deleted_at is null group by c.id, c.slug, c.subscription_status;
```

### How Phase 3.4 is enforced (shipped 2026-08-07)

`requireRootManager` (`apps/web/src/lib/api/role-guard.ts`) on
`POST /api/v1/subscribe`, `POST /api/v1/subscribe/change-plan`, and
`POST|DELETE /api/v1/communities/delete`; a root-only `hasRole` **redirect**
(never a throw — that handler has no `withErrorHandler`) on `/billing/portal`.
`canManageBilling` (`packages/shared`) is the matching client-side predicate.
`settings:write` is NOT usable for this: the RBAC matrix collapses
`property_manager` and `root_manager` onto a single `manager` row and
structurally cannot tell them apart — that is the bug this closes.
`apps/web/__tests__/api/root-exclusive-routes.test.ts` is the fence against
re-widening.

### Explicitly NOT narrowed, with reasons

Recorded so these are not "finished" later by mistake.

- `POST /api/v1/account/delete` — *account*, not *community*, deletion.
  Self-scoped and legally required to stay self-service (erasure requests);
  residents must be able to use it. **This stays outside the root-exclusive set
  even after R3-03b shipped**, below: the answer to the adjacent gap is an
  acknowledgement, not a permission change, precisely because making deletion
  root-only would break the statutory erasure path for the one user most likely
  to need it.
- `POST /api/v1/communities/[id]/cancel` — gates on **billing-group
  ownership AND a current management role** (`property_manager` or
  `root_manager`) in that community, not on root. A root check would break the
  multi-community PM cancel flow, where the owner manages but may not be root.
  *Corrected 2026-09-28:* this entry used to say the owner "may not be a member
  of the child community at all". No legitimate path produces that — both link
  paths (`getOrCreateBillingGroupForPm`, add-to-group provisioning) require the
  owner to manage the community — and nothing ever detaches a community from a
  group, so the only owner who is not a member is one the association has
  removed. The route soft-deletes immediately, so that owner is now refused and
  every cancellation writes a `community_canceled` audit event
  (`docs/audits/2026-09-28-route-authz-census.md`, F6).
- `/api/v1/stripe/connect/*` — the community's *inbound* dues collection, not
  PropertyPro's subscription. Root-gating would block routine PM operations.
- `POST /api/v1/settings/support-access` and `PATCH /api/v1/transparency/settings`
  — **reviewed 2026-08-09 and deliberately left on `settings:write`.** A
  pre-ship planning note listed these alongside the three billing/deletion
  routes as places where "`settings:write` undercovers it", and that note
  outlived its context. Neither is one of the four root-exclusive powers:
  support-access grants or revokes consent for PropertyPro support staff to
  access the community, and transparency/settings is §718 public-transparency
  configuration — routine compliance work a CAM performs. Making either
  root-only would EXTEND the closed set (an amendment to this ADR, not a
  completion of R3-03) and would block property managers from ordinary
  operations. If support-access should later be reserved to the root on
  trust grounds, that is a new product decision and belongs in its own ADR
  entry, not in the R3-03 tail.

### R3-03b — root self-deletion orphaning a community: CLOSED (shipped 2026-08-09)

The 08-07 addendum recorded the adjacent gap this way: a root could delete their
own account and leave a community rootless, and `requestUserDeletion` did
nothing but *note* it — a warning log plus a `root_pending_deletion` audit
event, inside a `try/catch` that swallowed failures, so even the flag was
best-effort. It deferred a fix as **R3-03b**,
[issue #924](https://github.com/Ruckus000/PropertyPro/issues/924), on two
grounds: the deferral's own precondition was unmet (`root-offboarding.ts` said
"Phase 3 will block once the claim/transfer UX (2b) exists", and 2b had not
shipped), and R3-03 had just raised the stakes — with billing now root-exclusive,
a community whose root deletes their account has nobody who can pay it until
someone claims root, so what had been a governance annoyance had become a
possible lapse-to-suspension path, with no self-service recovery at all in the
zero-property-manager case.

**Both premises are now superseded.** 2b shipped (claim-root and transfer-root
are both live), and the **ack gate shipped on 2026-08-09**, so R3-03b is closed:

- `RootOffboardingAckRequiredError` —
  `apps/web/src/lib/services/account-lifecycle-service.ts:522-551`. The class is
  at `:522-527`; `requestUserDeletion` computes `findRootOffboardingImpact` and
  throws at `:547-549`, **before** the deletion-request insert, so a user who
  bails at the confirmation prompt leaves no stray cooling request behind.
- Wired at `apps/web/src/app/api/v1/account/delete/route.ts:52-65`, which maps
  the error to **409 `ROOT_OFFBOARDING_ACK_REQUIRED`** — not 403. The affected
  communities ride along in the payload so the client can name them, flag the
  ones with no successor, and re-submit with `acknowledgeRootOffboarding: true`.

**The deliberate design decision that survives the closure: ACK, not a hard
block.** Account deletion is self-scoped and legally required to stay
self-service for erasure requests, so the user is *informed and consents* rather
than being refused. That is why the status code is a confirmable 409 rather than
a permission denial, and it mirrors the existing `NonOwnerAckRequiredError`
precedent in `role-management-service`. Do not "harden" this into a block: a
refusal would make the platform unable to honour an erasure request from a root,
which is a worse compliance failure than the orphan it prevents.

**What is still best-effort, and why that is right.** The *flagging* — the
`console.warn` plus the `root_pending_deletion` /
`root_pending_deletion_no_successor` audit events at
`account-lifecycle-service.ts:574-605` — remains inside a `try/catch` that
swallows failures, because by then the request is committed and the user has
consented, so a logging failure must not surface to them as an error. It is no
longer the *only* protection: the ack gate runs before the insert and
propagates, and the comment at `:599-602` states that division of labour
explicitly ("The ack gate above is the part that must not be swallowed, and it
runs before this block precisely so it cannot be"). Communities with no
successor get a distinct action so they are not buried among the recoverable
ones.

### PM experience after the narrowing (shipped 2026-08-07)

Read-only, never hidden — hiding would make the capability loss invisible. A
property manager keeps `canViewBilling` (plan, status, interval) and the
past-due/trialing banners *without* their action links, and
`getLockedFeatureBehavior` routes them to the "request" CTA instead of a purchase
button that would dead-end in a 403.

### Rootless recovery (shipped 2026-08-07)

`/settings/billing` renders a non-dismissible notice for a PM in a rootless
community linking `/dashboard/claim-root`. It is deliberately NOT
`ClaimRootBanner`, which is dismissible and writes a shared
`claim-root-dismissed` sessionStorage key — dismissing it on the dashboard would
suppress it here too, on a surface where suppression means staying locked out.

### Zero-PM break-glass (no such community existed as of 2026-08-06)

`reassignRootOp` requires the target to already be a `property_manager`, so it
is two steps: a platform admin promotes someone to `property_manager` via the
admin app, then calls `POST /api/admin/communities/reassign-root`.

### Seed fix landed with Phase 3.4 (shipped 2026-08-07)

`pnpm seed:demo` previously minted a root only for palm-shores, which is why
prod's seeded sunset-condos and sunset-ridge are rootless. It now mints one per
community (`ROOT_MANAGER_BY_SLUG` in `scripts/seed-demo.ts`). The leaked prod
fixtures were left alone — backfilling a root there is an ownership assertion,
not a data fix, and belongs to a separate human-approved cleanup.

## Consequences

| Type | Consequence |
|---|---|
| Positive | One small role vocabulary across storage and the derived layer; far less code to reason about. |
| Positive | Board membership is a clean statutory marker decoupled from operational permissions. |
| Tradeoff | No per-manager permission overrides post-cleanup (granularity loss — accepted). |
| Tradeoff | Rootless communities lose billing/deletion until claimed (accepted; visible via the admin rootless report, and `/settings/billing` links a rootless PM straight to claim-root). **Realised 2026-08-07** with R3-03. |

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Keep the seven-role enum (ADR-001) | The storage layer already used three roles; maintaining the seven-role derived vocabulary was the source of the drift. |
| Make `designation` grant general permissions | Re-introduces designation-as-permission coupling; the model deliberately keeps general permissions (the `RBAC_MATRIX` rows of §3) role-only. The read/egress-breadth and audience-targeting sites §2a lists are NOT this — they are outside the matrix, and §2a states where the line actually falls. |
| Reduce restricted board members in place via designation gating | Contradicts "general permissions never read designation" (§2, as refined by §2a); restricted actors belong at the resident tier (+ designation) instead. |

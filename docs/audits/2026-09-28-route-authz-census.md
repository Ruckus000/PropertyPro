# Route authorization census — 2026-09-28

**Scope:** every `route.ts` under `apps/web/src/app/api`, read at `72ba2c6` (census)
and re-measured at `3a5afb6` (guard). `apps/admin` is out of scope; see
[Deferrals](#deferrals).

**Outcome:**
- Five real read or authorization leaks were found. All five are fixed: F1 in #1198, F2–F5 in #1199.
- A sixth (F6, the cancel route) came out of verifying a deferral after the guard landed; it is fixed in the follow-up PR.
- The WS3 guard (`pnpm guard:route-gates`) then landed with **no frozen baseline**. Every exported verb is either gated or carries a reviewed claim.

## Why a census, not a baseline

Roadmap row 2.2 (AZ-05) originally proposed a guard requiring a gate idiom per route, with the ~34 ungated routes frozen in a shrink-only baseline. A rough grep at `72ba2c6` instead found **115 of 285 route files** with no recognisable gate helper.

Freezing that number would have written every hole in it into the ledger as "accepted". So the 115 routes (165 handlers) were read first:
- each handler was traced into its helpers and services, and classified by what the code does, not by a helper's name;
- every SUSPECT was re-read by hand before it was reported.

| Class | Handlers (approx.) | Meaning |
|---|---|---|
| HELPER_GATED | ~70 | A role check lives in a domain helper (`requireFinance*`, `requireEsign*`, `requireStaffOperator`, `requirePmPortfolioAccess`, …) that the grep did not know. |
| SELF_SCOPED | ~40 | The caller only reads or writes their own rows. |
| PUBLIC_BY_DESIGN | ~22 | Token-, signature- or intentionally public. |
| COMMUNITY_OPEN | ~15 | Any member, on purpose, and the RBAC matrix agrees. |
| **SUSPECT** | **5 + 1 chain** | Below. |

## Findings (all fixed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | critical | **Signup account-takeover chain.** Submitting a victim's email returned the victim's existing `signupRequestId` and overwrote their pending community name, plan and slug. `GET /auth/provisioning-status` hands a single-use login token to the first poller, so an attacker polling faster than the victim's browser won a root-manager session. | #1198: the upsert's `setWhere` requires the caller to own the id, or the row to be expired (the id is then rotated). A refused caller gets the generic response, an unlinked id, and no auth call. |
| F2 | medium | `GET /overview` listed, for a tenant, the titles and ids of board-only, owner-only and unpublished announcements, of documents their role cannot open (including violation evidence), and the compliance score (`compliance:read` is false for tenants). | #1199: per-community membership with `listVisibleAnnouncements`, `buildAccessibleDocumentsFilter` and `checkPermissionV2`. |
| F3 | medium | `GET /onboarding/{apartment,condo}` was readable by any member: residents' names and emails, and unit rents. It also created a wizard row as a side effect. The POST and PATCH in the same files were gated. | #1199: `requireMutationAuthorization` on both GETs; the pages redirect non-admins. |
| F4 | low–medium | `GET /help/search` ignored role visibility: manager-only article titles, and FAQ answers restricted by role. | #1199: role passed to `searchArticles`; `searchCommunityFaqs` filters with `isFaqVisibleToRole`. |
| F5 | low | `GET /amenities/[id]/schedule` returned every reservation's `userId`, `unitId` and notes to any member. | #1199: admins get full rows; residents get their own rows plus anonymised slots. |
| F6 | medium (latent) | **A removed manager could still cancel and soft-delete a client community.** `POST /communities/[id]/cancel` checked only billing-group ownership, and nothing ever detaches a community from a group or changes its owner. The soft-delete is immediate, outside the deletion-request lifecycle, and wrote no audit event. Production exposure on 2026-09-28: zero (3 linked communities, every owner still a manager; the path has never been used). | Requires billing-group ownership **and** a current `property_manager`/`root_manager` role in that community; writes a `community_canceled` audit event. ADR-006's exception corrected. |

## Would the guard have caught them?

The honest answer shaped the guard's design.

| # | Caught by `guard:route-gates`? | Why |
|---|---|---|
| F1 | No | The route is sessionless and belongs to `guard:token-auth-routes`. The bug was logic. |
| F2 | No | Behind a real gate; the leak was inside the handler. |
| F3 | **Yes, but only per verb** | The file had a gated POST. A per-file check passes it. |
| F4 | No | Behind a member-level gate; leak inside the handler. |
| F5 | No | Behind `require*ReadPermission`, which admits every member; leak inside the handler. |

So the guard catches one class of bug: a verb shipped with no gate. It cannot see over-broad gates or leaks inside handlers, and those were four of the five findings. It was built **per verb** because that is the only design choice that catches a finding we actually had. The roadmap had deferred per-verb checking as a `ponytail:` item; that deferral was reversed.

## The guard: `pnpm guard:route-gates` (`scripts/verify-route-gates.ts`)

Measured at landing: **285 route files, 423 exported verbs.**

| Status | Verbs | Rule |
|---|---|---|
| helper-gated | 311 | The verb's body, followed through same-file functions, calls a `GATE_HELPERS` entry. |
| token-verified | 6 | Calls a `verify*Token` verifier (the pattern is shared with `guard:token-auth-routes`). |
| inline | 29 | `if (<role/ownership condition>) throw new ForbiddenError(…)`. |
| claimed | 77 | `// route-gate: <class> — <reason>` directly above the export: 32 `self-scoped`, 15 `community-open`, 30 `public`. |

Four design points, each forced by something found while building it:

- **A new marker, not `// AUTHZ:`.** `guard:authz-comments` already owns `AUTHZ:`, as the rationale above an `@propertypro/db/unsafe` import, and 7 route files carry one.
- **Helper names are verified, not trusted.** Each `GATE_HELPERS` entry names its defining file, and the guard checks that the definition throws or calls another gate. `requireReservationPermission` (`lib/work-orders/common.ts`) reads like a gate but is a documented no-op. The dry run had it listed; the self-check rejects it.
- **Three helpers are deliberately not gates:**
  - `requireEntitledForAdminRead` checks subscription lifecycle and is a no-op for residents;
  - `requireCommunityRole` validates a role string;
  - `require*Enabled` / `requirePlanFeature` are plan and feature flags.

  Excluding the first moved 15 member-open reads (documents, help, search, FAQs) from "gated" to explicit `community-open` claims, which is what they are.
- **Inline `ForbiddenError` counts only under an identity condition.** The first version credited any inline `ForbiddenError`. The guard's own revert-check (delete `requireMutationAuthorization` from `GET /onboarding/condo`, i.e. re-introduce F3) **still passed**: the file's local `requireCondoCommunity()` throws `ForbiddenError` on community *type*. Only a condition naming a role, admin/author flag, or the caller's own user or unit ids is now credited. Feature-flag and data checks (`!features.hasX`, `!created`) are not.

## Deferrals

Each deferral has a trigger. None of them is fixed here.

- **The public community search lists demo communities**, with no opt-in. Trigger: launch marketing, or the first real community.
- **`/upload` has no quota and no mime allowlist.** Members only, under their community's prefix. Trigger: a storage-cost alert.
- **`phone/verify/send` is open to SMS pumping.** Trigger: a Twilio spend alert, or before the SMS launch.
- **The access-request OTP can be deliberately locked out.** Trigger: the first report.
- **Unsubscribe tokens never expire, and a GET mutates.** Trigger: a link-scanner incident.
- **`DELETE /esign/consent` is manager-only, so residents cannot withdraw consent** (ESIGN Act). A legal question, on the counsel list with the notice templates.
- **Cancel-path soft-delete bypasses the deletion lifecycle** (follow-up to F6). `communities/[id]/cancel` soft-deletes immediately with no deletion request, so `recoverCommunity` cannot restore it and the purge never processes it; restoring one takes a manual data repair. Trigger: the first real cancellation (none in production on 2026-09-28), or onboarding the first multi-community management company — whichever comes first.
- **No way to move a community out of a billing group.** Nothing ever clears `communities.billing_group_id` or changes a group's owner, so an association that leaves its management company stays in that company's group (and billing). Trigger: the first association that switches management companies.
- ~~**`apps/admin` routes (61) are outside the guard.**~~ **Closed by roadmap 2.5:** `apps/admin/src/app/api` is a second scan target with its own verified helper list (`requirePlatformAdmin`, `requireCronSecret`, `billingActionRoute`). 83 verbs: 82 gated, 1 claim (`/api/health`). The reason it was worth doing before the trigger fired: admin middleware lets the PREFIX `/api/admin/internal/` through sessionless for the cron bearer, so a route added there is protected only by its own call.
- **`route.ts` files outside `app/api` are outside the guard** (web: `billing/portal`, `auth/verify-signup`, three dev routes; admin: `dev/agent-login`). Trigger: a new non-dev `route.ts` outside `app/api`.
- **Support can confirm any phone as the impersonated user's** (#1230). During a support session, `phone/verify/confirm` takes the number from the request, so an operator holding a phone can make it the account's verified emergency-SMS number. Restricting confirm to the number already on file was considered and rejected: `PATCH account/profile`, also open to support, sets any number first, so that restriction changes nothing. The real control is telling the account holder: email them whenever support changes or verifies their phone. Today only the community's managers see the change, in the support access log. That log masks the number to its last four digits, so it cannot show which number received texts in between if an operator sets their own number and later reverts it. Trigger: a second person gets support access, or the first real customer community. At that point, also decide whether the full number belongs in a platform-admin-only log.
- **`contract.permission` metadata** (on 239 contracted routes, enforced nowhere) is not cross-checked against the real gate. Trigger: `runRoute` starts enforcing `permission`, or a review finds the two disagreeing.

## Addendum: server pages that read tables directly (roadmap 2.3)

Before freezing the 21 server files that import tables directly into `guard:route-table-imports`'s baseline, each was read with the same method as above: who can reach it, whether the read is scoped, and whether it skips a visibility rule the API for the same data applies.

| # | Severity | Finding | Fix |
|---|---|---|---|
| P1 | medium | `/emergency` listed every broadcast (title, severity, delivery counts) to any member. Tenants have `emergency_broadcasts: read = false`, and the list API refuses them. | #1206: `requirePermission(..., 'read')` before the read. |
| P2 | low | `/settings/billing` put `stripeCustomerId` and `paymentFailedAt` in every member's RSC payload. | #1206: management tier only. |
| P3 | low | `/welcome` computed and sent the compliance score to members without `compliance:read`. | #1206: the checklist is read only when that check passes. |

The other 18 files are gated, or read only the caller's own row or a single low-sensitivity column. Two notes that are not leaks:
- `mobile/settings` read every member's notification preferences and picked the caller's in JS. It is now drained onto `getNotificationPreferencesForUser`.
- `mobile/meetings` skips the API's lapsed-subscription check (`requireEntitledForAdminRead`) for managers. That is billing policy, not visibility.

A separate bug came out of the same read: `/welcome` found the caller's unit by `ownerUserId`, so a tenant never saw theirs. It is fixed by resolving the unit through `listActorUnitIds`, like the ~40 other consumers.

**Deferral: demo tenants have no role unit.** On 2026-09-28 production had 16 tenants, all in demo communities, and none with `user_roles.unit_id`: the seed bypassed `validateRoleAssignment`, which requires a unit for every resident. 15 of them are linked only by a lease; 1 has no link at all. Every `listActorUnitIds` consumer (packages, visitors, work orders, payments, ARC, violations, elections, and now `/welcome`) therefore sees no unit for them. Two fixes exist:
- repair the seed data (cheap);
- make `listActorUnitIds` read active leases. That widens what ~40 consumers let a tenant touch, so it needs its own authorization review.

Trigger: the first real apartment community, or a demo-quality report that tenants "have no unit".

**Update 2026-09-29 — the SEED side is fixed (branch `claude/demo-resident-units`); the `listActorUnitIds` option was not taken, so no authorization semantics changed.**
- `seedRoles` (`packages/db/src/seed/seed-community.ts`) accepts an optional `unitId` and its upsert now does `unit_id = coalesce(excluded.unit_id, user_roles.unit_id)`, so a reseed or cross-community re-assignment no longer nulls an existing link. It used to write a literal NULL for every role and `unit_id = excluded.unit_id`, which wiped the link seed-demo wrote afterwards on every reseed.
- `seedCommunity` now links every resident after units and leases exist: a tenant gets its ACTIVE lease's unit; an owner gets the unit it owns, or claims the lowest-numbered unowned unit (setting `units.owner_user_id` and `unit_id` together). This covers the admin console's "create demo" resident persona (`role: 'owner'`) and every apartment tenant.
- `scripts/seed-demo.ts` links `tenant.one@sunset.local` to the second Sunset Condos unit by unit number (role `unit_id` only; tenants do not own), and links the cross-community owner (`owner.one` in Palm Shores) the same way `seedCommunity` does.
- Pinned by `packages/db/__tests__/seed-resident-units.integration.test.ts` (local DB) and a SQL-shape unit test in `packages/db/__tests__/seed/seed-community.test.ts`.

**Existing production demo rows are NOT repaired by this change.** They correct on the next reseed of each demo (the nightly reset / a fresh admin demo). Decision 2026-09-29: no production data repair.


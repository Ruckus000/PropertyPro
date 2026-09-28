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
- **`apps/admin` routes (61) are outside the guard.** Trigger: the first admin route not behind `requirePlatformAdmin` or the admin session.
- **`contract.permission` metadata** (on 239 contracted routes, enforced nowhere) is not cross-checked against the real gate. Trigger: `runRoute` starts enforcing `permission`, or a review finds the two disagreeing.

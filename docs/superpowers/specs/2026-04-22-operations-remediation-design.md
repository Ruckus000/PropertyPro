# Operations Hub Remediation — Design

**Date:** 2026-04-22
**Scope:** Remediate 9 findings in the Operations/Maintenance/Search surface. Two-phase plan.
**Status:** Design — awaiting implementation-plan authorship.

---

## 1. Context and problem statement

An audit of the current Operations surface produced 9 findings (referred to by number throughout this doc). The reported user-visible bug: typing "maintenance" in the command palette redirects to `/dashboard?reason=invalid-selection`. Root cause: the feature registry advertises `/maintenance/submit` without a `communityId`, which that page hard-redirects away from.

All nine findings share the same underlying defect: **route construction is fragmented across four sources of truth**, and **the Operations page claims to be a unified hub that the implementation does not actually deliver**. Fixing only the reported bug would leave the IA broken. Fixing the IA without fixing the underlying duplication would let the same class of bug recur.

### The 9 findings, condensed

1. Search hits for "Maintenance" route to `/maintenance/submit` without `communityId` → hard redirect to dashboard.
2. Operations page advertises itself as the canonical hub but only ships a request CTA; no work-order or reservation creation.
3. Feature registry advertises `/work-orders` and `/amenities` page routes that do not exist in this repo.
4. Route construction duplicated across feature-registry, command-palette-paths, help task-cards, welcome-snapshot-cards.
5. Operations page CTA is static ("Submit Request") regardless of active tab — wrong on Reservations, wrong on Work Orders.
6. Hub hides data volume: `useMaintenanceRequests` called without pagination; "All" feed cursor never used.
7. "All" feed merges maintenance + work orders only; reservations excluded while copy claims unification.
8. Timestamps rendered with browser-local `toLocaleString()` despite existing community-timezone helpers.
9. Plan gating split: shell, Operations page, work-orders API, amenities API gate on raw community type; maintenance API uses effective plan features. "Nav says yes, product says no" drift.

### Verification note

All 9 findings were verified against the current codebase in the `inspiring-stonebraker-933192` worktree before this design was drafted. No work-orders or amenities page routes exist under `apps/web/src/app/(authenticated)/`. Command Palette V2 is live (`USE_COMMAND_PALETTE_V2 = true` at [app-shell.tsx:37](../../../apps/web/src/components/layout/app-shell.tsx:37)).

---

## 2. Decisions

Locked during brainstorming. Any deviation requires revisiting the relevant question.

| # | Question | Decision |
|---|---|---|
| D1 | Missing `/work-orders` / `/amenities` page routes | Route into Operations via `?tab=work-orders` / `?tab=reservations`. No new top-level pages. |
| D2 | Operations hub depth | Full workspace: inline creation forms for requests, work orders, reservations. |
| D3 | Route-construction duplication | Single canonical route-builder module + CI guard. |
| D4 | Plan-gating drift | Unify on effective plan features for the operations surface (shell, ops page, WO/amenities APIs, search service). Other 15 `getFeaturesForCommunity` call sites tracked as explicit follow-up. |
| D5 | "All" feed coverage | Extend backend to merge reservations as a third source. |
| D6 | Pagination UX | "Load more" button. Cursor-based for "All", page-based for per-entity feeds. |
| D7 | Legacy `/maintenance/submit` & `/maintenance/inbox` | Both become thin redirect pages into Operations. Bookmarks and email deep links continue to work. |
| D8 | Phasing | Two-phase: Phase 1 = correctness foundation, Phase 2 = workspace forms + "All" feed extension + WO/Reservations pagination. |

---

## 3. Architecture and module boundaries

### 3.1 Canonical route builder

**New module: `apps/web/src/lib/operations/routes.ts`** — pure, sync, deterministic path builders. No DB. No side effects.

```ts
export type OperationsTab = 'all' | 'requests' | 'work-orders' | 'reservations';

export function operationsHubHref(
  communityId: number,
  tab?: OperationsTab,
  extras?: { from?: 'maintenance'; scope?: 'mine' | 'community' }
): string;

export function operationsTabHref(
  communityId: number,
  tab: OperationsTab
): string;

// Strict validation — throws on non-positive integer. Callers handle the error.
export function buildLegacyRedirectParams(
  searchParams: Record<string, string | string[] | undefined>
): URLSearchParams;
```

The module also exports a `KNOWN_OPERATIONS_HREFS` sentinel set (computed at import time) that the CI guard uses to verify registry entries.

**Deliberate omissions** (rejected bloat):
- No `workOrdersHref` / `amenitiesHref` — those names imply top-level pages that do not exist. Callers use `operationsTabHref(cid, 'work-orders')`.
- No `legacyMaintenanceRedirectHref` — redundant with `operationsHubHref(cid, 'requests', { from: 'maintenance' })`.

### 3.2 Callers adopting the builder

| Caller | Current href | Becomes |
|---|---|---|
| [feature-registry.ts:151](../../../apps/web/src/lib/constants/feature-registry.ts:151) (page-maintenance) | `/maintenance/submit` | `operationsTabHref(cid, 'requests')` |
| [feature-registry.ts:259](../../../apps/web/src/lib/constants/feature-registry.ts:259) (page-maintenance-inbox) | `/maintenance/inbox` | `operationsTabHref(cid, 'requests')` |
| [feature-registry.ts:453](../../../apps/web/src/lib/constants/feature-registry.ts:453) (page-work-orders) | `/work-orders` | `operationsTabHref(cid, 'work-orders')` |
| [feature-registry.ts:483](../../../apps/web/src/lib/constants/feature-registry.ts:483) (action-submit-maintenance) | `/maintenance/submit` | `operationsTabHref(cid, 'requests')` |
| [feature-registry.ts:523](../../../apps/web/src/lib/constants/feature-registry.ts:523) (action-reserve-amenity) | `/amenities` | `operationsTabHref(cid, 'reservations')` |
| [feature-registry.ts:657](../../../apps/web/src/lib/constants/feature-registry.ts:657) (action-dispatch-work-order) | `/work-orders` | `operationsTabHref(cid, 'work-orders')` |
| [command-palette-paths.ts:42](../../../apps/web/src/components/command-palette/command-palette-paths.ts:42) (`maintenance` case) | `/maintenance/{submit,inbox}` | `operationsTabHref(cid, 'requests')` |
| [task-cards.ts:44](../../../apps/web/src/lib/help/task-cards.ts:44) (`maintenance` card) | `/maintenance/submit?…` | `operationsTabHref(cid, 'requests')` |
| [welcome-snapshot-cards.tsx:383](../../../apps/web/src/components/onboarding/welcome-snapshot-cards.tsx:383) | `/maintenance/submit?…` | `operationsTabHref(cid, 'requests')` |

### 3.3 Search-label disambiguation

`label: 'Maintenance'` in the registry stays — users type "maintenance" and expect "Maintenance" in results. Clicking routes them to Operations hub. The palette subtitle (`description: 'Submit and track maintenance requests'`) grounds the user. Not a label rename — deliberate preservation of muscle memory.

### 3.4 Plan-gating unification

Two patterns, applied per context.

**Pattern A — sync context (pages, components, helpers holding a `CommunityMembership`):**

```ts
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';

const features = getEffectiveFeatures(
  membership.communityType,
  resolvePlanId(membership.subscriptionPlan)
);
```

`subscriptionPlan` is already on [community-membership.ts:14](../../../apps/web/src/lib/api/community-membership.ts:14). Sync, no DB round trip.

**Pattern B — API route handlers (canonical pattern from [maintenance-requests/route.ts:100-104](../../../apps/web/src/app/api/v1/maintenance-requests/route.ts:100)):**

```ts
const typeFeatures = getFeaturesForCommunity(membership.communityType);
if (!typeFeatures.hasWorkOrders) throw new ForbiddenError('...');
await requirePlanFeature(communityId, 'hasWorkOrders');
```

Type check stays. Plan check is added. Error shapes are stable: `ForbiddenError` for type denial, `PLAN_UPGRADE_REQUIRED` for plan denial.

**Scope of the unification (Phase 1):**

| File | Pattern |
|---|---|
| [page-shell-context.ts:69](../../../apps/web/src/lib/request/page-shell-context.ts:69) | A |
| [operations/page.tsx:35](../../../apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx:35) | A |
| [work-orders/common.ts:10-22](../../../apps/web/src/lib/work-orders/common.ts:10) (`requireWorkOrdersEnabled`, `requireAmenitiesEnabled`) | A internally; signature preserved |
| [work-orders/route.ts:41](../../../apps/web/src/app/api/v1/work-orders/route.ts:41) | B (add) |
| amenities POST/GET + reserve routes | B (add) |
| reservations POST/GET + cancel routes | B (add) |
| [data-search-service.ts:190](../../../apps/web/src/lib/search/data-search-service.ts:190) | A |

### 3.5 Nav gating

Operations nav entry at [nav-config.ts:112-118](../../../apps/web/src/components/layout/nav-config.ts:112) uses `featureKey: 'hasMaintenanceRequests'` — apartments with work orders/amenities but no maintenance see no Operations link.

**Approach:** extend `NavItemConfig` with `featureKeys?: readonly (keyof CommunityFeatures)[]` (any-of semantics). `featureKey` remains for existing entries. `getVisibleItems` and `getVisibleItemsWithPlanGate` check both. The Operations entry sets `featureKeys: ['hasMaintenanceRequests', 'hasWorkOrders', 'hasAmenities']`. No type-system breakage for existing entries.

### 3.6 Rollback flag

One env var: `OPERATIONS_HUB_ROUTING`. Default behavior is v2. Setting to `v1` causes the route-builder to emit legacy strings and the redirect-only pages to render their prior SubmitForm UI. Read only in server-side code (route builder imported from SSR contexts, redirect pages). Client bundles always ship v2 behavior — v1 rollback requires redeploy.

---

## 4. Phase 1 — Foundation scope

### 4.1 URL contract for the Operations hub

```
/communities/[id]/operations
  ?tab=(all|requests|work-orders|reservations)
  &from=(maintenance)?
  &status=<string>?
  &priority=(low|medium|high|urgent)?
  &unitId=<int>?
  &q=<string>?
  &cursor=<opaque>?
  &page=<int>?
```

Unknown params ignored. The redirect pages preserve an allowlist (`status`, `priority`, `unitId`, `q`) via `buildLegacyRedirectParams`.

### 4.2 Change manifest

**New files:**
- `apps/web/src/lib/operations/routes.ts` (canonical builders)
- `apps/web/src/lib/operations/__tests__/routes.test.ts`
- `scripts/verify-operations-routes.ts` (CI guard)
- `scripts/__tests__/verify-operations-routes.test.ts` (guard-the-guard)
- `scripts/__tests__/fixtures/{good,missing-community-id,phantom-page}-registry.ts`

**Rewritten to redirect-only (~15 lines each):**
- `apps/web/src/app/(authenticated)/maintenance/submit/page.tsx`
- `apps/web/src/app/(authenticated)/maintenance/inbox/page.tsx`

Both carry `// breadcrumbs:exempt — redirect-only page` comments.

**Registry/caller switches:** 9 files listed in §3.2.

**Gating swaps (Pattern A):** 4 files listed in §3.4.

**Gating additions (Pattern B):** API route files listed in §3.4 (exact file set audited per §10).

**Nav gating:** `apps/web/src/components/layout/nav-config.ts`.

**Operations hub extension (`operations-hub.tsx`):**
- Read `status`, `priority`, `unitId`, `q`, `cursor`, `page` from `useSearchParams`, pass through to existing hooks (all already accept these params).
- Render `<LoadMoreButton>` on `all` (cursor) and `requests` (page+1) tabs.
- Replace `new Date(...).toLocaleString()` at lines 253, 307 with `formatInCommunityTimezone` from [format-date.ts:18](../../../apps/web/src/lib/utils/format-date.ts:18). Server page passes `communityTimezone` as prop.

**Rollback flag integration:** consumed at three points only (route builder, two redirect pages).

### 4.3 Pagination honesty

Phase 1 does not add pagination to APIs that lack it.

| Tab | Current API support | Phase 1 behavior |
|---|---|---|
| All | Cursor (`/api/v1/operations`) | Load More wired |
| Requests | Page-based (`/api/v1/maintenance-requests`) | Load More wired (page+1) |
| Work Orders | None (array response) | "Showing N results" footer; filter narrows |
| Reservations | None (array response) | Same |

Work Orders / Reservations API pagination is closed in Phase 2.

### 4.4 Timezone fix

The two offending `toLocaleString()` call sites swap to `formatInCommunityTimezone(date, communityTimezone)`. If `CommunityMembership.communityTimezone` is absent (verify during implementation), the Operations page performs a one-time `SELECT timezone FROM communities WHERE id = ?` and passes it down. One prop, three render sites fixed.

### 4.5 Analytics

- Retain `[analytics] maintenance_redirect` at [operations-hub.tsx:85](../../../apps/web/src/components/operations/operations-hub.tsx:85).
- Add `[analytics] operations_legacy_redirect` fired from the redirect pages with `{ source: 'submit' | 'inbox', hadFilters: boolean }`.
- Add `[analytics] operations_pagination_loaded` on Load More click with `{ tab, mechanism: 'cursor' | 'page' }`.

### 4.6 What Phase 1 does not do

Pointers to where each deferred item lands:

- Inline creation forms — §5.
- Extend "All" feed to merge reservations — §5.
- Contextual CTA per tab — §5.
- Work Orders / Reservations API pagination — §5.
- Runtime click-through tests — §6.
- Other 15 `getFeaturesForCommunity` call sites — §8 (follow-up).

---

## 5. Phase 2 — Workspace scope

### 5.1 Contextual CTA

The static `requestActionHref`/`requestActionLabel` props on `OperationsHub` are removed. CTA is computed from selected tab + role + enabled features.

| Tab | Resident | Admin / Manager / CAM / Site Manager / PM Admin |
|---|---|---|
| All | "Submit Request" | Primary: "Dispatch Work Order"; overflow: "Submit Request" |
| Requests | "Submit Request" | "Submit Request" (staff can submit on behalf) |
| Work Orders | CTA hidden | "Dispatch Work Order" |
| Reservations | "Reserve Amenity" | "Reserve Amenity" |

The operations-hub tests at [operations-hub.test.tsx:81-109](../../../apps/web/__tests__/components/operations/operations-hub.test.tsx:81) that pin the wrong behavior are rewritten.

### 5.2 Form placement — drawer via shadcn Sheet

URL contract gains a `create` param:

```
?tab=requests&create=request
?tab=work-orders&create=work-order
?tab=reservations&create=reservation
```

Back button closes. Deep links into create state work. Tab switching does not destroy in-progress form state. Filter params beneath the drawer are preserved.

### 5.3 Three form components

**`<RequestCreateSheet>`** — thin wrapper around existing [SubmitForm](../../../apps/web/src/components/maintenance/SubmitForm.tsx). Adds drawer container and post-create `invalidateQueries(MAINTENANCE_REQUEST_KEYS)`. No logic duplication.

**`<WorkOrderCreateSheet>`** — new. Admin-only. Fields match [work-orders POST schema](../../../apps/web/src/app/api/v1/work-orders/route.ts:21): title, description, priority, unit, vendor, SLA response/completion hours, notes. Vendor picker depends on whether a vendor-list endpoint exists (verify during implementation; if absent, ships with "assign later" — vendor stays null).

**`<ReservationCreateSheet>`** — new. Any role. Fields: amenity (from `GET /api/v1/amenities`), date, start time, end time, unit, notes. Constructs ISO datetimes from date+time+community TZ per [reserve schema](../../../apps/web/src/app/api/v1/amenities/[id]/reserve/route.ts:22). Uses `GET /api/v1/amenities/[id]/schedule` to show conflicts as UX hint (not a server-side enforcement replacement).

Shared `<FormDrawer>` container for consistent header/footer/error pattern across all three.

### 5.4 "All" feed merges reservations

`operations-service.ts` updated:

- `OperationsSourceType` extended: `'maintenance_request' | 'work_order' | 'reservation'`.
- Sort key: `createdAt DESC` unchanged (activity feed, not event calendar).
- Cursor discriminator extended to include `reservation` type. Phase 1 cursors remain decodable.
- `partialFailure` / `unavailableSources` already supports this.
- Reservation title derived via LEFT JOIN on amenities: `"Reservation — <amenity name>"`.
- Copy at [operations/page.tsx:51](../../../apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx:51) and [operations-hub.tsx:133](../../../apps/web/src/components/operations/operations-hub.tsx:133) now accurately describes behavior.

### 5.5 Work Orders / Reservations pagination

Page-based pagination added to three APIs:

- `GET /api/v1/work-orders` — accepts `page`, `limit`; returns `{ data, meta: { page, limit, total } }`.
- `GET /api/v1/reservations` — same.
- Amenities list stays non-paginated (bounded, used as picker source).

Client hooks accumulate pages on Load More. Phase 1's "Showing N results" footer is removed, replaced by real Load More button.

### 5.6 Rollback flag

Phase 2 adds `OPERATIONS_HUB_CREATE_SHEETS`. Default `on`. Setting to `off` disables `?create=` drawer parsing and reverts CTAs to Phase 1's `<Link>` forms. Phase 1 routing fixes remain intact.

### 5.7 What Phase 2 does not do

- Work-order vendor directory / vendor creation UI.
- Server-side amenity double-booking prevention beyond existing behavior.
- Bulk actions (approve N requests, dispatch N work orders).
- Drill-down detail routes — hub cards continue linking to existing `/maintenance/requests/[id]` detail pages (verify during implementation; if missing for a type, log as follow-up).
- Inline filter UI (chips, dropdowns). URL params are the primary filter surface.
- Reservation edit/cancel from the hub — existing routes unchanged.

---

## 6. Testing and CI

Four layers.

### 6.1 Unit (Vitest, `pnpm test`)

**`apps/web/src/lib/operations/__tests__/routes.test.ts`**
- `operationsTabHref(42, 'requests')` shape assertions.
- `operationsHubHref(42, 'requests', { from: 'maintenance' })` preserves `from` and `tab`.
- Invalid `communityId` (0, -1, NaN, undefined) throws.
- `buildLegacyRedirectParams` allowlists exactly `status`, `priority`, `unitId`, `q`.
- `OPERATIONS_HUB_ROUTING=v1` emits legacy hrefs.

**`apps/web/src/lib/request/__tests__/page-shell-context.test.ts`** (extend)
- Essentials plan + condo_718 → `hasEsign` composed to `false` even though type enables it.
- `subscriptionPlan=null` → type-only features (fail-open).
- Unknown legacy plan string → fail-open.

**`apps/web/src/lib/search/__tests__/data-search-service.test.ts`** (new or extend)
- Plan excludes `hasWorkOrders` → searching "work order" omits `page-work-orders`.

**`apps/web/src/lib/work-orders/__tests__/common.test.ts`** (new)
- `requireWorkOrdersEnabled` throws on plan-excluded features.
- `requireAmenitiesEnabled` same.

### 6.2 CI guard — `scripts/verify-operations-routes.ts`

Wired into the existing `lint` pipeline alongside the three existing guards (matches [package.json:31](../../../package.json:31) pattern).

**Enforcement:**
1. Every registry entry with function-valued `href` evaluates cleanly at `cid=1`.
2. Operations-family hrefs must flow through `operations/routes.ts` (verified via `KNOWN_OPERATIONS_HREFS` set intersection).
3. Non-operations hrefs must resolve to an `(authenticated)/**/page.tsx` on disk OR appear on the explicit allowlist (`/settings`, `/settings/export`, `/help`, `/help/contact`, `/auth/login`, `/dashboard`).
4. Operations hrefs contain `communityId=` or `/communities/[0-9]+/`.
5. Arrow hrefs produce identical output for `cid=1` and `cid=999` (catches surprise branching).

Uses `tsx` (already in devDeps) to import TypeScript directly — no build step.

**Guard-the-guard:** `scripts/__tests__/verify-operations-routes.test.ts` with three fixtures asserting exact exit codes and error strings.

### 6.3 Component (Testing Library)

**Feature-matrix nav test** — `apps/web/src/components/layout/__tests__/nav-operations-gate.test.ts` (new)

| Community type | Plan | Role | Expect Operations? |
|---|---|---|---|
| condo_718 | professional | resident | yes |
| condo_718 | essentials | resident | yes |
| condo_718 | essentials | cam | yes |
| apartment | operations_plus | site_manager | yes |
| apartment | operations_plus | resident | yes |
| apartment | apartments_basic | resident | yes iff any-of |
| hoa_720 | professional | board_president | yes |

Matrix iterates exported `COMMUNITY_TYPES` so new types auto-expand coverage.

**`operations-hub.test.tsx` rewrites:**
- Reservations tab → "Reserve Amenity" CTA (Phase 2).
- Work Orders tab → no CTA for residents; "Dispatch Work Order" for admins (Phase 2).
- `?status=new` URL → Requests filter state honored (Phase 1).
- `?from=maintenance` → banner still visible (regression check).
- Timestamp uses injected community timezone, not browser.

**New component tests:**
- `<RequestCreateSheet>` / `<WorkOrderCreateSheet>` / `<ReservationCreateSheet>` — open/close on URL param, role gating, POST payload correctness, invalidation-on-success.

**Redirect-page tests:** `apps/web/src/app/(authenticated)/maintenance/submit/__tests__/page.test.ts` — input → expected redirect URL. Covers normal path, filter-preservation, NaN, 0, negative, missing.

### 6.4 Runtime click-through (preview tools)

Not automated. Part of the Phase 1 PR checklist. Uses existing `preview_*` workflow per [agent-testing.md](../../../.claude/rules/agent-testing.md):

1. `preview_start("web")`
2. `preview_eval` agent-login as owner
3. Navigate to dashboard
4. `preview_click` search input, `preview_fill` "maintenance"
5. `preview_click` first result
6. `preview_snapshot` — assert URL contains `/operations?tab=requests` AND title is "Operations"
7. Repeat for `as=cam`, `as=board_president`, `as=site_manager`
8. Repeat for "work order", "amenity", "reservation"
9. Hit stale bookmark `/maintenance/submit?communityId=<id>&status=new` — confirm filter preservation
10. Hit stale bookmark `/maintenance/inbox?communityId=<id>&priority=urgent` — confirm filter preservation
11. Load More on a community with >20 requests

PR template updated to require pasting the final `preview_snapshot` output or explicitly declaring "no search-surface changes."

### 6.5 Execution in CI

- Unit tests → existing `pnpm test` job.
- Guard → existing `lint` job (new line in the chain).
- Integration tests for redirect pages → existing `integration-tests.yml` workflow.

Expected CI delta: ~30 unit cases added (<1s), ~2s added to lint. No new job slots.

### 6.6 Tests deleted

- The "Submit Request on Reservations tab" assertion at [operations-hub.test.tsx:81](../../../apps/web/__tests__/components/operations/operations-hub.test.tsx:81) — pins the bug. Rewritten.
- Server-side render test for [maintenance/submit/page.tsx:80-134](../../../apps/web/src/app/(authenticated)/maintenance/submit/page.tsx:80) — legacy page is now redirect-only. SubmitForm component tests remain.

---

## 7. Cutover and rollback

### 7.1 Deploy sequence

**Phase 1 PR → main:**
1. Pre-merge: `OPERATIONS_HUB_ROUTING=v2` set in Vercel (belt-and-suspenders; default is v2).
2. Pre-merge: CI guard green on PR; preview click-through snapshot pasted in PR description.
3. Merge → Vercel auto-deploy. No DB migration. No downtime.

**Phase 2 PR → main:** after Phase 1 has soaked ≥72 hours with flat error rates. Same deploy model. `OPERATIONS_HUB_CREATE_SHEETS=on` default.

### 7.2 Rollback mechanics

**Phase 1 rollback — env flag (MTTR ~2 min):**
- Set `OPERATIONS_HUB_ROUTING=v1`, redeploy.
- Route builder emits legacy hrefs. Redirect pages render prior SubmitForm UI.
- Nav `featureKeys` extension not flag-gated — preserves apartment-community Operations access across rollback.

**Phase 1 rollback — git revert (MTTR ~10 min):**
- For gating cascades (Pattern A / B changes). Single-commit revert.

**Phase 2 rollback — env flag:**
- `OPERATIONS_HUB_CREATE_SHEETS=off` disables `?create=` parsing; CTAs revert to Phase 1 `<Link>` forms.
- Phase 1 routing fixes and the reservations-in-"All"-feed extension remain live (additive, safe).

**Unflagged additive changes (rely on revert):**
- Nav `featureKeys` extension.
- Operations filter param honoring.
- "All" feed reservation merge.
- WO/Reservations pagination.

### 7.3 In-flight traffic

- **Users mid-submit on old `/maintenance/submit`:** form POSTs to unchanged `/api/v1/maintenance-requests`. Submit completes. No data loss.
- **Bookmarks to `/maintenance/submit?communityId=42`:** resolve via new redirect page. 302/307 to Operations. Keep working.
- **Email deep links:** audit `packages/email/templates` during implementation; existing legacy links redirect correctly.
- **Open command palette at deploy moment:** cached old bundle → old href → new redirect page → Operations. One extra hop for ~10 seconds of users.

### 7.4 Observability

New analytics events (§4.5). Existing `maintenance_redirect` event stays load-bearing — volume signals when legacy redirect pages can eventually be deleted (future cleanup, not this plan).

**72-hour watch post-Phase-1:**
- 4xx rate on `/api/v1/work-orders` and `/api/v1/amenities/*` (new plan check may trip previously-granted communities; first 24 hours are noisiest).
- 5xx rate on `/communities/[id]/operations` (should stay flat).
- Shell page render time (Pattern A is sync — no regression expected).

### 7.5 Communication

- Pre-merge engineering Slack: Phase name, findings addressed, rollback command, "no DB change."
- Post-deploy: paste preview snapshot in release thread.
- No customer-facing announcement (invisible-if-it-works is the correct UX).

### 7.6 Post-deploy verification (10 min)

Run after each phase ships — preview tools against production URL (or test account). Steps enumerated in §6.4 steps 4–11. Failure on any step triggers the phase's rollback.

---

## 8. Explicit follow-ups (outside this plan)

Tracked as separate issues. Not Phase 1, not Phase 2.

- Unify the remaining 15 `getFeaturesForCommunity` call sites (polls, elections, finance, violations, transparency, help, calendar, esign, accounting, logistics, dashboard data loader, api community context, mobile pages, onboarding pages). Same drift class, different surfaces.
- Vendor directory / vendor creation UI (enables real vendor picker in `<WorkOrderCreateSheet>`).
- Server-side amenity double-booking prevention (if existing API lacks it — verify, flag separately).
- Inline filter UI for the Operations hub (chips, dropdowns). URL params suffice until user feedback demands otherwise.
- Eventual deletion of the legacy `/maintenance/submit` and `/maintenance/inbox` redirect pages once `operations_legacy_redirect` telemetry hits a low-enough threshold.

---

## 9. Rejected alternatives

Named so future readers understand why we did not take these paths.

- **Dedicated `/work-orders` and `/amenities` page routes.** Rejected — duplicates what Operations is for; re-fragments IA.
- **Hiding work orders / amenities / dispatch from discovery entirely.** Rejected — regresses advertised functionality.
- **`workOrdersHref` / `amenitiesHref` / `legacyMaintenanceRedirectHref` helpers.** Rejected — semantic sleight-of-hand; `operationsTabHref(cid, tab)` is the honest API.
- **Changing `NavItemConfig.featureKey` to a predicate function.** Rejected — type ripple across all existing entries. Additive `featureKeys` achieves the goal with minimal blast radius.
- **Renaming the "Maintenance" search label to "Operations."** Rejected — breaks muscle memory.
- **Playwright for runtime click-through.** Rejected — adds a framework for one test surface. Existing `preview_*` tools cover the same ground.
- **Single big-bang plan or three-phase plan.** Rejected — two-phase trades review cycles for risk isolation at the right granularity.
- **Flag-gating additive server-side changes** (nav, filter params, feed merge). Rejected — doubles flag surface for changes that don't carry regression risk. Revert is the correct primitive.

---

## 10. Open verification items (resolve during implementation, not design)

- Confirm `CommunityMembership.communityTimezone` exists. If absent, Operations page performs a one-time `SELECT timezone` and passes down.
- Confirm drill-down detail routes (`/maintenance/requests/[id]`, etc.) exist for each entity type. If missing, log as follow-up rather than building in Phase 2.
- Audit `packages/email/templates` for hardcoded `/maintenance/submit` or `/maintenance/inbox` links. Any found should be updated to the builder; hardcoded links that already lacked `communityId` were already broken.
- Confirm presence or absence of a vendor-list endpoint. Drives whether `<WorkOrderCreateSheet>` ships with a real vendor picker or "assign later" in Phase 2.
- Audit every route file under `/api/v1/{work-orders,amenities,reservations}` for precise Pattern B insertion points. Both GET and mutation endpoints are in scope where they currently call `requireWorkOrdersEnabled` or `requireAmenitiesEnabled`. Expected set is 6–8 files; enumerate in the implementation plan.

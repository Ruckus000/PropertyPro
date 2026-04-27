# Fix Tracker

Cursor-actionable implementation document. Each phase = one PR. Phases are independent unless explicitly stated.

Audit baseline: 2026-04-27, branch `claude/brave-mcnulty-65adf7`. Six issues confirmed live, one denied via repro, one re-scoped.

> **Correction from initial audit:** The component referenced as `apps/web/src/components/shared/upgrade-prompt.tsx` does NOT exist. The actual file is [apps/web/src/components/billing/upgrade-dialog.tsx](apps/web/src/components/billing/upgrade-dialog.tsx) and the component is `<UpgradeDialog>`. Phase 1's root cause has been re-investigated.

---

## Common Preamble — READ BEFORE STARTING ANY PHASE

### Cursor instructions (apply to every phase)

1. **One phase = one PR.** Do not implement multiple phases in the same branch. Do not "while you're at it" anything.
2. **Stay inside `Files to touch`.** If you discover a file outside that list needs changing, **stop and surface it as a question** before editing.
3. **Do not refactor.** Adjacent code that looks improvable is out of scope. Leave it.
4. **Do not add dependencies** without flagging the bundle/license impact in the PR description and getting approval.
5. **Do not skip tests.** Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, plus the per-phase Verification block. CI will fail if you don't.
6. **Do not bypass the project rules** in `.claude/rules/*.md`. Every phase below quotes the relevant rules inline — follow them verbatim.
7. **If a phase's acceptance criteria are unclear**, ask. Do not guess.
8. **No commits with `--no-verify`, `--no-gpg-sign`, or amends to landed commits.**

### One-time setup (do once when first picking up the repo)

```bash
# From the worktree root
ln -s /Users/jphilistin/Documents/Coding/PropertyPro/.env.local .env.local 2>/dev/null || true
ln -s ../../.env.local apps/web/.env.local 2>/dev/null || true
nvm use                                        # Node 20 per .nvmrc
pnpm install --prefer-offline
pnpm --filter @propertypro/db db:migrate       # only if migrations are pending
pnpm seed:demo                                 # if running locally
```

### Project-wide guardrails (apply to every phase)

These come from `.claude/rules/*.md`. Cursor: read these now and keep them in scope across the whole task.

**Tenant isolation** (`tenant-isolation.md`):
- All tenant DB access goes through `createScopedClient(communityId)` from `@propertypro/db`. Never import Drizzle's `db` directly.
- Operators come from `@propertypro/db/filters`, not `drizzle-orm`.
- New tenant tables need: `community_id` FK + `deleted_at` soft-delete + RLS policies + write-scope trigger.

**API patterns** (`api-patterns.md`):
- Every route handler under `apps/web/src/app/api/v1/` MUST: wrap in `withErrorHandler`, call `requirePermission(resource, action)`, validate body with Zod, use `createScopedClient(communityId)`, log mutations via `logAuditEvent()`.

**Migration safety** (`migration-safety.md`):
- Last migration on main: `0143_help_article_feedback.sql`. Highest journal idx: check `_journal.json` before naming new files.
- Drizzle `.defaultNow()` returns a `timestamp`, not a date — use `sql\`CURRENT_DATE\`` for date-only.

**Design system** (`design.md`):
- Use `cn()` from `@/lib/utils`. Use design tokens (`--text-primary`, `--surface-card`, etc.) — never raw hex.
- Spacing: only token values (`space-1` … `space-8`). Never ad-hoc.
- Status: icon + text + color via `getStatusConfig()` from `docs/design-system/constants/status.ts`. Never color alone.
- Touch targets: 44px mobile, 36px desktop.
- Every authenticated detail/new/edit page renders `<PageHeader breadcrumb={<Breadcrumbs items={...} currentLabel="..." />}>`. Breadcrumb is the ONLY back affordance on those pages — no extra back-link in actions or above the header.

**Florida compliance** (`florida-compliance.md`):
- PropertyPro provides NO legal/engineering/financial advice.
- All compliance audit-trail entries → `compliance_audit_log` table.

### Common verification (run before opening any PR)

```bash
pnpm typecheck                       # types across all packages
pnpm lint                            # includes guard:db-access, guard:breadcrumbs
pnpm test                            # unit tests
# Phase-specific tests called out per phase
```

CI runs 7 jobs per PR (lint, typecheck, unit, **no-mock-guard**, migration-ordering, perf-check, build). The `no-mock-guard` job will fail PRs that introduce mocks into integration tests — keep DB-touching tests against the real schema. If a phase touches API routes or schemas, also run integration tests:

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

### Cross-cutting reminders (apply to every phase as relevant)

**Test file convention:** the codebase uses both `__tests__/<file>.test.ts` directories AND colocated `<file>.test.ts` siblings. Match what already exists for the file you're editing — do not invent a new convention.

**Notifications:** mutation flows that affect a resident (creating a violation, registering a visitor as someone's host, etc.) likely emit an in-app notification. There's an existing notifications system on main. Before adding a new notification trigger, verify: (a) does it already fire automatically from the API route, (b) what's the channel/title pattern. If unclear, surface as a question rather than building a parallel system.

**Audit logging:** `compliance_audit_log` tracks compliance-relevant events. Document views, violation creation, document publishes, etc. all emit entries via `logAuditEvent()`. When you change a flow that touches compliance data, verify the audit-log call is preserved or extended — never silently dropped.

**TanStack Query:** mutations should `queryClient.invalidateQueries({ queryKey: ... })` on success so lists refresh without a full page reload. Match the key pattern used by the existing query.

### Definition of Done (every phase)

- [ ] Acceptance criteria all checked
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green
- [ ] Manual repro confirmed in the preview browser
- [ ] No files outside the listed scope were modified
- [ ] No new dependencies were added without explicit approval
- [ ] PR description includes: problem statement, change summary, manual test plan, screenshots if UI changed
- [ ] Reviewer-ready: diff is minimal and focused

---

## Phase 1 — Operations upgrade dialog populates plan info

**Status:** ☐ Not started · **PR:** _TBD_

### Goal
When a community on a plan that lacks all three Operations features clicks the Operations sidebar item, the resulting upgrade dialog renders a populated plan name and meaningful copy (not "null" or empty).

### Out of scope
- Any other sidebar nav entry's plan-gate logic
- The plan/feature definitions in `@propertypro/shared`
- Any change to `findCheapestPlanForFeature` itself
- The `Stripe` checkout flow
- Adding new plans

### Root cause (re-verified against the actual code)
**Correction:** the original audit pointed at `apps/web/src/components/shared/upgrade-prompt.tsx` — that file does not exist. The actual component is [apps/web/src/components/billing/upgrade-dialog.tsx](apps/web/src/components/billing/upgrade-dialog.tsx).

What the dialog actually does today (verified by reading the file):

```ts
// upgrade-dialog.tsx
const copy = featureKey ? getPlanFeatureCopy(featureKey) : null;
const upgradePlan = featureKey ? findCheapestPlanForFeature(featureKey) : null;
const headingText = copy?.displayName ?? 'Upgrade required';
const tagline = copy?.tagline ?? `This feature is available on the ${upgradePlan?.displayName ?? 'higher'} plan.`;
```

So:
- `getPlanFeatureCopy(null)` is **already** guarded — heading falls back to `'Upgrade required'`. Not the bug.
- `<FeatureHero featureKey={null}>` renders a generic gradient + Sparkles ([feature-hero.tsx:19-58](apps/web/src/components/billing/feature-hero.tsx:19)). Not the bug.
- The actual bug: `upgradePlan` is computed inside the dialog from `featureKey`. When `featureKey` is null (any-of gates), `upgradePlan` is null → tagline reads literally `"This feature is available on the higher plan."`. The word "higher" is the literal fallback string.

Meanwhile [nav-config.ts:430-433](apps/web/src/components/layout/nav-config.ts:430) **already computes** the correct plan name for any-of gates:
```ts
const cheapest = candidates.sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd)[0];
upgradePlanName = cheapest?.displayName ?? null;
```

But [app-sidebar.tsx:217](apps/web/src/components/layout/app-sidebar.tsx:217) only threads `featureKey` through:
```ts
setUpgradeFor({ featureKey: clickedItem.upgradeFeatureKey });  // ← only featureKey
```

So `upgradePlanName` is computed and discarded. **The fix is to thread `upgradePlanId` (or equivalent) from `nav-config.ts` → `app-sidebar.tsx` → `<UpgradeDialog>` so the dialog can render the correct plan even when `featureKey` is null.**

### Acceptance criteria (binary)
- [ ] `nav-config.ts` `getVisibleItems()` already computes `upgradePlanName`. Add `upgradePlanId: PlanId | null` to the same returned shape (resolve via `Object.entries(PLAN_FEATURES).find(...)` against the cheapest plan, mirroring the dialog's existing lookup).
- [ ] `app-sidebar.tsx`'s `setUpgradeFor({...})` payload extends from `{ featureKey }` to `{ featureKey, upgradePlanId }`. The `<UpgradeDialog>` `open` props extend correspondingly.
- [ ] `<UpgradeDialog>` uses an explicit `upgradePlanId` prop (when provided) to look up the plan, falling back to its existing `findCheapestPlanForFeature(featureKey)` only when `upgradePlanId` is null. The tagline now reads `"This feature is available on the Operations Plus plan."` (or the relevant cheapest plan), never `"...on the higher plan."`
- [ ] Existing test [apps/web/src/components/layout/__tests__/nav-operations-gate.test.ts](apps/web/src/components/layout/__tests__/nav-operations-gate.test.ts) gains ONE new test: when ALL 3 Operations features are plan-excluded (`hasMaintenanceRequests=false, hasWorkOrders=false, hasAmenities=false`) but type-allowed, `getVisibleItems()` returns the entry with `planLocked: true`, a non-null `upgradePlanName`, AND a non-null `upgradePlanId`. **Read the file before adding** — there are 8 tests already; add only the missing case.
- [ ] One new test covers `<UpgradeDialog>` rendering the correct plan name when `featureKey={null}` AND `upgradePlanId="operations_plus"`. Place the test next to existing component tests (colocated `.test.tsx` siblings, NOT a new `__tests__/` directory).
- [ ] DOM assertion: `expect(within(dialog).queryByText(/higher plan/i)).not.toBeInTheDocument()` — guards against the literal "higher" fallback regression.

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/components/layout/nav-config.ts` | Compute and return `upgradePlanId` alongside existing `upgradePlanName` |
| `apps/web/src/components/layout/app-sidebar.tsx` | Thread `upgradePlanId` into the dialog's open payload + props |
| `apps/web/src/components/billing/upgrade-dialog.tsx` | Accept new `upgradePlanId` prop; prefer it over the internal `findCheapestPlanForFeature(featureKey)` fallback |
| `apps/web/src/components/layout/__tests__/nav-operations-gate.test.ts` | Add the missing case (DO NOT duplicate existing tests) |
| `apps/web/src/components/billing/upgrade-dialog.test.tsx` (new, colocated) | Render test for `featureKey={null}` + `upgradePlanId="operations_plus"` |

### Patterns to follow
- `<UpgradeDialog>` already uses the shared `Dialog` primitive — keep it.
- `PlanId` type from `@propertypro/shared` is the source of truth; use it.
- Don't change `findCheapestPlanForFeature` itself.

### Security review
- No auth/authz changes. No new fetches.

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm test --filter @propertypro/web -- nav-operations-gate upgrade-dialog
```

### Manual repro steps
1. Login as `cam` on a community whose plan excludes all 3 Operations features (verify by checking the plan in admin or DB).
2. Click Operations in the sidebar.
3. Confirm dialog renders: title `"Upgrade required"`, tagline names a real plan (e.g., `"Operations Plus"`), CTA opens `/settings/billing/change-plan`.
4. Confirm the literal word `"higher"` does NOT appear in the body copy.

### Trade-offs / Why this approach
- **Threading the planId vs. teaching the dialog to consume `featureKeys[]`:** threading is minimally invasive and keeps the dialog API simple. The alternative would require the dialog to re-implement the cheapest-plan-for-multi-feature reduce — duplicating logic that already lives in `nav-config.ts`. Threading wins on DRY.
- **Why not just hardcode "higher" → "Operations Plus" in the tagline fallback?** Because the cheapest plan for Operations could change as plans evolve. Threading the resolved plan keeps the source of truth in one place (`nav-config.ts`).

---

## Phase 2 — Remove "E-Signatures Coming Soon" banner from Doc Center

**Status:** ☐ Not started · **PR:** _TBD_

### Goal
The E-Sign button in the document library navigates to the existing `/esign` page when E-Sign is enabled; otherwise the button does not render. The "Coming Soon" banner is deleted entirely.

### Out of scope
- The actual `/esign/templates` and `/esign/submissions` pages
- The signing flow at `/api/v1/esign/sign/...`
- Any other "coming soon" surfaces (audit them in a follow-up; this PR only touches the doc center)

### Root cause
- [apps/web/src/components/documents/document-library.tsx:42](apps/web/src/components/documents/document-library.tsx:42) — `showEsignBanner` state
- [apps/web/src/components/documents/document-library.tsx:103](apps/web/src/components/documents/document-library.tsx:103) — button toggles the banner
- [apps/web/src/components/documents/document-library.tsx:147-171](apps/web/src/components/documents/document-library.tsx:147) — unconditional "E-Signatures Coming Soon" JSX
- E-Sign is fully shipped: `/esign/templates`, `/esign/submissions`, `/api/v1/esign/...` exist on main

### Acceptance criteria (binary)
- [ ] When `community.features.hasEsign === true`, the E-Sign button renders and clicking it navigates to `/esign?communityId={id}` (or `/communities/{id}/esign`, whichever matches the current routing convention — verify with grep first).
- [ ] When `community.features.hasEsign === false`, the E-Sign button does NOT render at all (no banner, no paywall, nothing).
- [ ] The `showEsignBanner` state and the entire JSX block at lines 147-171 are deleted from the file (zero remaining references).
- [ ] `grep -rn "Coming Soon" apps/web/src/components/documents/` returns no results.
- [ ] No new tests required, but any existing snapshot/test that asserted the banner copy is updated.

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/components/documents/document-library.tsx` | Remove banner state + JSX; gate button on `hasEsign`; navigate on click |

### Patterns to follow
- Use `useRouter().push(...)` from `next/navigation` for navigation.
- Use `cn()` for class composition.
- Use the existing `<Button>` from the design system; no new components.
- Read `hasEsign` from whatever community/features context the rest of the file already consumes — do not introduce a new fetch.

### Security review
- No new API routes. No new permissions. Navigation only.
- Confirm the destination route already requires auth via middleware (it does — `/esign/*` is a protected path).

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm test --filter @propertypro/web -- document-library
grep -rn "showEsignBanner\|Coming Soon" apps/web/src/components/documents/  # should be empty
```

### Manual repro steps
1. Login as `cam` (Sunset Condos likely has `hasEsign: true`).
2. Navigate to the document library.
3. Click E-Sign button → confirm navigation to the e-sign page.
4. (If feasible) flip `hasEsign` to false in DB or use a community without it. Confirm the button is hidden, no banner.

### Trade-offs / Why this approach
- Resolving the original Phase 2 internal contradiction: we picked "hide the button when feature is off" (KISS) over "render a paywall." Communities without e-sign rarely benefit from a marketing paywall in the document library; if we want one, that's a separate UX surface.

---

## Phase 3a — Activity History: convert side Sheet to centered Dialog

**Status:** ☐ Not started · **PR:** _TBD_

### Goal
The compliance Activity History opens as a centered modal Dialog (xl width: 960px), not a right-side Sheet.

### Out of scope
- The user-id input UX (Phase 3b)
- Any visual/typographic polish (Phase 3c)
- The audit-trail data layer or API

### Root cause
- [apps/web/src/components/compliance/compliance-activity-history-sheet.tsx](apps/web/src/components/compliance/compliance-activity-history-sheet.tsx) — wraps Radix Sheet (right side)

### Acceptance criteria (binary)
- [ ] Component renamed: `compliance-activity-history-sheet.tsx` → `compliance-activity-history-modal.tsx`. Update all imports.
- [ ] Uses our shared `Dialog` primitive (`@/components/ui/dialog`) — same one as `<UpgradeDialog>`.
- [ ] `DialogContent` is sized `lg` (720px) per design tokens, NOT `xl`. Rationale: the table is read-heavy but doesn't need ultra-wide. If the user later disagrees, change it then.
- [ ] Focus trap, ESC-to-close, focus return — all working (Dialog primitive provides these for free).
- [ ] No code references to `Sheet` remain in the renamed file.

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/components/compliance/compliance-activity-history-sheet.tsx` | Rename + reimplement using Dialog |
| Every file importing the old name | Update import paths (run `grep -rln "compliance-activity-history-sheet" apps/`) |

### Patterns to follow
- Use the existing `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription` exports from `@/components/ui/dialog`.
- Width: `className="sm:max-w-[720px]"` on `<DialogContent>`.
- Provide `<DialogTitle>` and `<DialogDescription>` for a11y.

### Security review
- No data-layer changes. Pure UI.

### Verification
```bash
pnpm typecheck
pnpm lint
grep -rn "compliance-activity-history-sheet\|Sheet.*ActivityHistory" apps/  # should be empty
pnpm test --filter @propertypro/web -- activity-history compliance
```

### Manual repro steps
1. Login as `cam`.
2. Navigate to `/communities/2/compliance`.
3. Open Activity History.
4. Confirm: centered modal, not right-side panel. ESC closes. Focus returns to the trigger button on close.

### Trade-offs / Why this approach
- Renaming the file is a one-time churn cost; it pays back by making the file's purpose match its content. SRP.
- Keeping width at `lg` (not `xl`) is YAGNI — start small, expand only if users say it's cramped.

---

## Phase 3b — Activity History: replace User ID textbox with resident picker

**Status:** ☐ Not started · **PR:** _TBD_ · **Depends on:** Phase 3a (or rebase if 3a hasn't shipped yet)

### Goal
The "User ID" filter input becomes a searchable picker that autocompletes on user name or email.

### Out of scope
- Any other audit-filter input (date range, action type, etc.)
- The audit-trail API itself (which already supports `?userId=`)
- New backend endpoints — we'll use the existing resident search

### Root cause
- [apps/web/src/components/audit/AuditFilters.tsx:85-97](apps/web/src/components/audit/AuditFilters.tsx:85) — raw `<input type="text">` asking the user to type a UUID

### Critical context (verified against the API)
[apps/web/src/app/api/v1/search/residents/route.ts](apps/web/src/app/api/v1/search/residents/route.ts) calls `searchResidentsByTrigram` which **only returns residents** (owners + tenants). It does NOT include staff (CAM, board_member, board_president, site_manager, property_manager_admin). The audit log records actions by ANY actor, including staff. So `<ResidentSearchCombobox>` is the wrong tool for the audit-filter use case — picking from it would never surface a CAM who modified a record.

This means Phase 3b actually has a prerequisite decision:

**Option A (recommended): build a `<UserSearchCombobox>` + a new `/api/v1/search/users` endpoint** that returns ALL community members (residents + staff). Mirror the trigram logic from `searchResidentsByTrigram` — copy the pattern, don't extend the resident search. KEEP the existing resident search untouched (residents-only is correct for visitor registration, lease creation, etc.).

**Option B: extend `searchResidentsByTrigram` with an optional `includeStaff: boolean` parameter** plus a query-string flag on the API. Smaller diff, but mixes responsibilities (the function name no longer matches its behavior).

Pick Option A. It's an additive change with clear separation. Names match behavior. Other consumers stay safe.

### Acceptance criteria (binary)
- [ ] New endpoint `/api/v1/search/users/route.ts` mirrors the residents endpoint structure: `withErrorHandler` + `requirePermission(membership, 'audit', 'read')` (or whichever permission gates audit-trail viewing — check the existing audit-trail endpoint), returns `{ id, title, subtitle, role, ... }` for community members regardless of role.
- [ ] New `searchUsersByTrigram(communityId, q, ...)` function in `packages/db/` — copy the trigram pattern from `searchResidentsByTrigram`. Different DB query (joins members not residents).
- [ ] New component `apps/web/src/components/shared/UserSearchCombobox.tsx` — copy from `ResidentSearchCombobox.tsx`, wire to `/api/v1/search/users`. Same UX (300ms debounce, min query length, etc.).
- [ ] [AuditFilters.tsx:85-97](apps/web/src/components/audit/AuditFilters.tsx:85) — replace the raw text input with `<UserSearchCombobox>`. When a user is picked, `filters.userId` is set; when cleared, `filters.userId` is `null` and the query refetches without it.
- [ ] Filter input width: drop `w-48`. Use `w-full` inside its grid cell so it matches the other filters' responsive behavior.
- [ ] **Do NOT** remove `shadow-e0`. It maps to `--elevation-e0: none` (verified in [tokens.css:234](packages/ui/src/styles/tokens.css:234)) — it's already a no-op visually. Removing it is churn for no value.

### Files to touch
| File | Reason |
|------|--------|
| New: `packages/db/src/queries/search-users.ts` (or wherever trigram queries live — match existing pattern) | DB query for community members |
| New: `apps/web/src/app/api/v1/search/users/route.ts` | API endpoint |
| New: `apps/web/src/components/shared/UserSearchCombobox.tsx` | UI component |
| `apps/web/src/components/audit/AuditFilters.tsx` | Replace raw input |
| `apps/web/src/components/audit/AuditTrailViewer.tsx` | Filter wiring if needed |

### Patterns to follow
- API pattern: `withErrorHandler` + `requirePermission` + Zod query parsing + scoped DB access via `createScopedClient` (or the unscoped equivalent if the search query needs to span scoped + non-scoped tables — match what `searchResidentsByTrigram` does).
- Tenant isolation: search must be community-scoped — never return users from other communities.
- DB access guard: the new query must use `@propertypro/db/filters` operators, not raw `drizzle-orm` imports. CI's `guard:db-access` will fail otherwise.

### Security review
- **Permission gate:** only roles allowed to view the audit trail can search users. Mirror whatever `/api/v1/audit-trail` requires.
- **Tenant scoping:** community-scoped at the DB query level — never globally search users.
- **Privacy:** subtitle should NOT expose email or phone for non-staff actors who view audit data. Limit subtitle to role + unit number, similar to the residents endpoint.
- **Rate limiting:** the existing search endpoints rely on the route-level rate limiter (verify in middleware). No new gate needed.

### Verification
```bash
pnpm typecheck
pnpm lint                            # guard:db-access
pnpm test --filter @propertypro/web -- AuditFilters UserSearchCombobox
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts -- search/users
```

### Manual repro steps
1. Login as `cam`. Open compliance Activity History.
2. Click into the user filter. Type `cam` → confirm Cameron (CAM) appears as a result.
3. Type `ow` → confirm Olivia Owner appears (a resident also surfaces).
4. Pick → confirm filter applies, table refetches with `?userId=...`.
5. Clear → confirm filter resets.

### Trade-offs / Why this approach
- **New endpoint over extending residents:** keeps SRP clean. The residents endpoint stays correct for residents-only consumers (visitor registration, lease creation, etc.). The audit trail gets its own purpose-fit endpoint.
- **Bundle/dup cost:** ~80 LOC of new combobox is acceptable duplication. Premature abstraction (a generic `<EntitySearchCombobox<T>>`) would over-DRY. Revisit only if a third use case emerges.

---

## Phase 3c — Activity History: design polish (DEFERRED)

**Status:** ⛔ Blocked on designer review · **PR:** _Do not open until reviewed_

### Goal
A pass on visual hierarchy, typography, spacing, and information density of the Activity History modal, aligned to the design system.

### Why deferred
- The original feedback ("looks like crap, needs UI/UX designer review") is opinion-based and not actionable without specific direction.
- Phases 3a and 3b address the concrete asks (modal vs. sheet, picker vs. UUID).
- A polish pass without a designer's input risks burning effort on the wrong details.

### Action required (not Cursor work)
1. Show 3a + 3b in the preview to the designer / product owner
2. Capture specific deltas (spacing, hierarchy, table density, status pills, etc.)
3. Re-open Phase 3c with concrete acceptance criteria

---

## Phase 4 — Payments unified screen

**Status:** ☐ Not started · **PR:** _TBD_
**Decisions:** Old routes redirect to `/payments?tab=…`. Resident "Pay" view + admin Finance tabs share one route, gated by role.

### Goal
The Payments sidebar entry leads to a single unified screen at `/communities/[id]/payments`. Admins see role-aware tabs; residents see only the payment portal. Old `/assessments` and `/finance` routes redirect.

### Out of scope
- Stripe webhook logic or any payment processing changes
- The component internals of `payment-portal.tsx`, `assessment-manager.tsx`, `finance-dashboard.tsx` — they get re-mounted as tab panels but their behavior doesn't change
- Reporting endpoints or the data-layer for finance

### Current structure
- [apps/web/src/components/layout/nav-config.ts:148-156](apps/web/src/components/layout/nav-config.ts:148) — Payments parent declares `children: ['assessments', 'finance']`
- All three components already live under [apps/web/src/components/finance/](apps/web/src/components/finance/) — `payment-portal.tsx`, `assessment-manager.tsx`, `finance-dashboard.tsx`
- Current routes:
  - `/communities/[id]/payments` → `payment-portal.tsx` (resident)
  - `/communities/[id]/assessments` → `assessment-manager.tsx` (admin)
  - `/communities/[id]/finance` → `finance-dashboard.tsx` (admin)

### Acceptance criteria (binary)
- [ ] `/communities/[id]/payments/page.tsx` becomes a thin role gate. Pseudo-code:
  ```tsx
  if (role === 'owner' || role === 'tenant') {
    return <PaymentPortal ... />; // existing component, no wrapper needed
  }
  return <AdminPaymentsTabs initialTab={searchParams.tab ?? 'overview'} ... />;
  ```
- [ ] New file: `apps/web/src/app/(authenticated)/communities/[id]/payments/_components/AdminPaymentsTabs.tsx` (use the `_components/` colocation pattern; it's already used elsewhere in `(authenticated)/`). Renders TWO tabs: `overview` → `<FinanceDashboard>`, `assessments` → `<AssessmentManager>`. (Admin "resident preview" tab dropped — see Trade-offs.)
- [ ] **Render only the active tab's content** (conditional render based on `activeTab` value). Do NOT eager-mount both dashboards — each fires data queries on mount, and rendering both would double the initial query payload.
- [ ] Tab state syncs to `?tab=` query param via `useRouter().push(...)` from `next/navigation` (do NOT use raw `pushState` — use Next's router so the server component re-resolves on shareable links). Pattern matches existing usage in [operations-hub.tsx:46-47](apps/web/src/components/operations/operations-hub.tsx:46).
- [ ] Tabs visible to admins only. **RBAC mechanism:** `<FinanceDashboard>` and `<AssessmentManager>` already enforce their own permissions via the API routes they call (audit existing components — they do `requirePermission('finance', 'read')` / `requirePermission('assessments', 'read')` server-side in their fetch chains). Do NOT add a second gate. Hiding the JSX from non-admins is sufficient as a UX layer; the data layer already refuses unauthorized access.
- [ ] If a resident hits `/payments?tab=finance` directly: the page renders the resident `<PaymentPortal>` view. The `?tab=finance` is silently ignored (no redirect, no error). Rationale: the role gate runs first; query params are admin-only.
- [ ] `/communities/[id]/assessments/page.tsx` is replaced with: `redirect('/communities/[id]/payments?tab=assessments')` using `next/navigation`'s `redirect()`.
- [ ] `/communities/[id]/finance/page.tsx` is replaced with: `redirect('/communities/[id]/payments?tab=overview')`.
- [ ] `apps/web/src/components/layout/nav-config.ts` Payments entry: `children` array is removed; the parent stands alone.
- [ ] All internal links to `/assessments` and `/finance` are updated. **Run this grep first and fix every hit:** `grep -rn "/assessments\b\|/finance\b" apps/web/src/ | grep -v node_modules`. Pay attention to:
  - Help center MDX (`apps/web/src/content/help/finance/`)
  - Email templates (`packages/email/src/`)
  - Dashboard widgets and command palette paths
- [ ] Breadcrumb: single "Payments" crumb, no sub-section crumb (per `design.md` canonical mapping).

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/app/(authenticated)/communities/[id]/payments/page.tsx` | Role gate + tab orchestration |
| `apps/web/src/app/(authenticated)/communities/[id]/assessments/page.tsx` | Replace with `redirect()` |
| `apps/web/src/app/(authenticated)/communities/[id]/finance/page.tsx` | Replace with `redirect()` |
| `apps/web/src/components/layout/nav-config.ts` | Remove `children` from `payments` entry |
| New: `apps/web/src/app/(authenticated)/communities/[id]/payments/_components/AdminPaymentsTabs.tsx` | Tab orchestration |
| `.claude/rules/design.md` | (only if breadcrumb canonical mapping changes) |
| Any link in `apps/web/src/` that hardcodes `/assessments` or `/finance` | Update |

### Patterns to follow

**Tabs:** Use the design-system tab component (Radix Tabs primitive). Reference an existing tabbed page in the repo for the pattern.

**Redirect:** Server component pattern:
```tsx
import { redirect } from 'next/navigation';
export default function Page({ params }) {
  redirect(`/communities/${params.id}/payments?tab=assessments`);
}
```

**Role gate:** Use `requireCommunityMembership()` or whichever helper the existing pages use. Don't reimplement.

**Breadcrumbs (from design.md):**
> Every authenticated detail/new/edit page MUST render `<PageHeader breadcrumb={<Breadcrumbs items={[...]} currentLabel="..." />}>`. Breadcrumb is the only back affordance.

### Security review
- **Critical:** RBAC must be enforced server-side (in the page component or via `requirePermission`), not just by hiding tabs in the UI. A resident who guesses `?tab=finance` and is the entire client doing `requireRole` on the JSX must STILL be unable to fetch finance data.
- Confirm `<FinanceDashboard>` and `<AssessmentManager>` already perform their own permission checks — they should.
- The redirect targets are static, not user-controlled. No open redirect risk.

### Verification
```bash
pnpm typecheck
pnpm lint                            # includes guard:breadcrumbs
pnpm test --filter @propertypro/web -- payments finance assessment
grep -rn "/assessments\|/finance" apps/web/src/ | grep -v node_modules | grep -v "/payments?tab="  # any remaining hard refs?
# Integration if you change any API contract (you shouldn't):
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

### Manual repro steps
1. Login as `owner` → navigate to Payments → see PaymentPortal only. No tabs.
2. Logout. Login as `cam` → navigate to Payments → see tabs (Overview, Assessments, Resident Preview). Default = Overview.
3. Click each tab, confirm URL updates, content matches.
4. Visit `/communities/2/assessments` directly → confirm 307 redirect to `/payments?tab=assessments`.
5. Visit `/communities/2/finance` → confirm redirect to `/payments?tab=overview`.
6. As `owner`, visit `/payments?tab=finance` → confirm resident view renders, NOT finance dashboard.

### Trade-offs / Why this approach
- Single route + role-aware tabs is simpler than three routes sharing a layout (KISS).
- Redirects (vs. delete-old-route) preserve existing bookmarks, emails, and link-out from help articles.
- **Conditional render over eager mount:** trade-off is "tiny re-mount cost when switching tabs" vs. "3x query load on every admin page open." Conditional render wins on perf.
- **Two tabs (Overview, Assessments) over three:** dropping the "Resident Preview" tab. The user said they wanted a unified screen, not parity with the resident view. Admins can already see balances per resident through the existing finance dashboard. YAGNI.

---

## Phase 5a — Violations: flatten route, drop tabs, rename label

**Status:** ☐ Not started · **PR:** _TBD_ · **Independent of 5b and 5c**

### Goal
`/violations` directly renders the inbox content (no redirect). Page title is "Violations" (no "Inbox"). The `<ViolationsInboxTabs>` strip is removed.

### Out of scope
- The "New violation" CTA + new route (Phase 5b)
- ARC Requests promotion to standalone (Phase 5c) — for now, ARC content is hidden from the violations page entirely. ARC functionality goes dark briefly between 5a and 5c shipping; if that's not acceptable, ship 5a + 5c together as a single PR.

### Root cause
- [apps/web/src/app/(authenticated)/violations/page.tsx:11-28](apps/web/src/app/(authenticated)/violations/page.tsx:11) — redirect-only page
- [apps/web/src/app/(authenticated)/violations/inbox/page.tsx:51](apps/web/src/app/(authenticated)/violations/inbox/page.tsx:51) — title "Violations Inbox"
- [apps/web/src/components/violations/ViolationsInboxTabs.tsx](apps/web/src/components/violations/ViolationsInboxTabs.tsx) — Violations / ARC Requests tab strip

### Acceptance criteria (binary)
- [ ] `/violations/page.tsx` directly renders the inbox content (move/inline from `inbox/page.tsx`). **Preserve the existing `?communityId=X` query-param handling** — the current redirect-only page validates this param at lines 11-28; the inlined version must do the same validation up-front before rendering content.
- [ ] `/violations/inbox/page.tsx` is deleted.
- [ ] `<ViolationsInboxTabs>` is deleted.
- [ ] `<ViolationsAdminInbox>` is rendered directly (no tab wrapper). The ARC content currently surfaced through the `arc` tab is **temporarily unreachable** until Phase 5c ships. If that's not acceptable, ship 5a and 5c together.
- [ ] Page title (the `<PageHeader>` title) is "Violations" (no "Inbox").
- [ ] Sidebar nav label in `nav-config.ts` for the violations entry is "Violations" (no "Inbox"). **Update `href` from `/violations/inbox?communityId=...` to `/violations?communityId=...` AND update `matchPrefixes` from `['/violations/inbox']` to `['/violations']`** so the sidebar active state still highlights.
- [ ] Breadcrumb canonical mapping in `.claude/rules/design.md` line for Violations is updated from `'Violations Inbox'` to `'Violations'`.
- [ ] Every internal link to `/violations/inbox` updated. **The list (verified via grep, do all five):**
  - `apps/web/src/components/dashboard/dashboard-violations.tsx:55` (dashboard widget)
  - `apps/web/src/components/command-palette/command-palette-paths.ts:55` (cmd-K palette)
  - `apps/web/src/components/violations/ViolationDetailView.tsx:135` (back-link from detail)
  - `apps/web/src/content/help/violations/reporting-and-managing-violations.mdx:45` (USER-FACING help content — easy to miss)
  - `apps/web/src/components/layout/nav-config.ts:215,218` (nav entry)
- [ ] Run `grep -rn "/violations/inbox\|Violations Inbox\|ViolationsInboxTabs" apps/web/src/ apps/web/src/content/ | grep -v node_modules` after the change. Output must be empty.

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/app/(authenticated)/violations/page.tsx` | Inline inbox content; preserve `?communityId=` validation |
| `apps/web/src/app/(authenticated)/violations/inbox/page.tsx` | Delete |
| `apps/web/src/components/violations/ViolationsInboxTabs.tsx` | Delete |
| `apps/web/src/components/violations/ViolationsAdminInbox.tsx` | Update PageHeader title to "Violations" |
| `apps/web/src/components/layout/nav-config.ts` | Relabel + fix href + fix matchPrefixes |
| `apps/web/src/components/dashboard/dashboard-violations.tsx` | Update link |
| `apps/web/src/components/command-palette/command-palette-paths.ts` | Update link |
| `apps/web/src/components/violations/ViolationDetailView.tsx` | Update back-link |
| `apps/web/src/content/help/violations/reporting-and-managing-violations.mdx` | Update help-content link |
| `.claude/rules/design.md` | Breadcrumb mapping |

### Patterns to follow
- `<PageHeader breadcrumb={<Breadcrumbs items={[...]} currentLabel="Violations" />}>` per design.md.
- Breadcrumb items: just the parent (whatever it currently is, likely Compliance) and `currentLabel="Violations"`.
- Nav-config entry's `matchPrefixes` should include `/violations` so the active state still highlights correctly.

### Security review
- No data-layer changes. Pure UI/routing.

### Verification
```bash
pnpm typecheck
pnpm lint                            # includes guard:breadcrumbs
pnpm test --filter @propertypro/web -- violations
grep -rn "/violations/inbox\|Violations Inbox\|ViolationsInboxTabs" apps/web/src/ | grep -v node_modules  # should be empty
```

### Manual repro steps
1. Login as `cam`. Click Violations in sidebar.
2. URL is `/violations` (not `/violations/inbox`). Page title is "Violations". No tab strip.
3. Visit `/violations/inbox` directly → 404 (or whatever Next produces for a deleted route).
4. Confirm breadcrumb says "Violations".

### Trade-offs / Why this approach
- Inlining vs. keeping the redirect: inlining is cleaner (KISS), but it briefly hides ARC. If ARC must remain accessible, schedule 5c immediately after.
- Keeping `inbox/page.tsx` as a redirect to `/violations` is an alternative; we chose deletion because the user said "no sub-tab needed."

---

## Phase 5b — Violations: surface "New violation" CTA on the inbox

**Status:** ☐ Not started · **PR:** _TBD_ · **Independent of 5a; can ship before or after**

### Goal
A "New violation" button on the `/violations` inbox links to the existing `/violations/report` route, where the form already lives.

### Critical context (verified — major scope reduction from earlier draft)
The form already exists. Reading the codebase:
- [apps/web/src/app/(authenticated)/violations/report/page.tsx](apps/web/src/app/(authenticated)/violations/report/page.tsx) is the existing "Report a Violation" page.
- It renders [`<ViolationReportForm>`](apps/web/src/components/violations/ViolationReportForm.tsx) for residents and [`<StaffViolationReportForm>`](apps/web/src/components/violations/StaffViolationReportForm.tsx) for staff (CAM, PM admin, site manager).
- Both forms support: unit picker, category enum, description, severity, photo evidence (via the [evidence-upload helper](apps/web/src/lib/violations/evidence-upload.ts)).
- The API endpoint at [/api/v1/violations](apps/web/src/app/api/v1/violations/route.ts) accepts: `unitId, category, description, severity, evidenceDocumentIds`. The form already maps to this exact shape.

So the actual work is one button + one link. Don't build a new form.

### Out of scope
- Building a new form (it exists)
- Renaming `/violations/report` to `/violations/new` (churn for no value; the existing route name is fine and matches the page heading "Report a Violation")
- Any API or schema changes
- Hearing-date scheduling, statute citation fields, file-upload UX changes — these are separate features, file as follow-ups if requested

### Acceptance criteria (binary)
- [ ] [`<ViolationsAdminInbox>` PageHeader actions slot](apps/web/src/components/violations/ViolationsAdminInbox.tsx) gains a primary `<Button>` labeled "New violation" that links to `/violations/report?communityId={communityId}`.
- [ ] Per design.md: `breadcrumb=` prop on `<PageHeader>` is placed BEFORE the JSX-valued `actions={...}` prop (the CI breadcrumb guard regex halts at the first `>` between `<PageHeader` and `breadcrumb=`).
- [ ] Button is hidden for non-staff roles (residents/tenants who somehow render this view — though the inbox itself is admin-only).
- [ ] No new files, no new API surface, no new components.
- [ ] Existing tests for `<ViolationsAdminInbox>` still pass.

### Files to touch
| File | Reason |
|------|--------|
| `apps/web/src/components/violations/ViolationsAdminInbox.tsx` | Add CTA in PageHeader actions slot |

### Patterns to follow
- Use the existing `<Button>` from the design system, `variant="primary"` size `md`.
- Use `next/link`'s `<Link href={...}>` wrapping the button (or `useRouter().push` on click — match what other inbox CTAs do).
- The link target preserves `?communityId=...` since the report page validates that param.

### Security review
- The `/violations/report` page already gates access via `requireCommunityMembership` + `hasViolations` feature check + `isResidentRole`/`resolveReportMode` (verify the existing logic). No new security surface introduced.

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm test --filter @propertypro/web -- ViolationsAdminInbox
```

### Manual repro steps
1. Login as `cam`.
2. Navigate to `/violations` (post-5a) or `/violations/inbox` (pre-5a).
3. Confirm "New violation" button visible in the page header actions.
4. Click → routes to `/violations/report?communityId=2`.
5. Confirm the existing form renders (resident or staff variant per role).
6. Submit a violation → confirm it appears in the inbox.

### Trade-offs / Why this approach
- **Reuse over rebuild (DRY/YAGNI):** the existing `/violations/report` route + forms are battle-tested with file uploads, validation, and the two-mode resident/staff split. Building a parallel "/violations/new" wastes effort and creates two routes that drift over time.
- **Keep the route name `/violations/report`:** users picking through Cursor diffs would scope-creep into a rename that touches breadcrumbs, help docs, and analytics. The route name is fine — the heading on that page already reads "Report a Violation," which is clearer than "New violation" anyway.
- **If the user actually wants a different form (statute citation field, hearing scheduler, etc.):** those are feature requests on the existing form, NOT a new route. File separately.

---

## Phase 5c — ARC Requests: extract the existing tab into a standalone page

**Status:** ☐ Not started · **PR:** _TBD_ · **Independent of 5a/5b**

### Goal
`/arc-requests` is a standalone page rendering the existing ARC submissions table (currently embedded as a sub-tab in the violations inbox). A new sidebar entry links to it.

### Critical context (verified — much smaller scope than initially scoped)
The ARC infrastructure is already complete:
- [apps/web/src/components/violations/ArcSubmissionsTab.tsx](apps/web/src/components/violations/ArcSubmissionsTab.tsx) — full DataTable with status badges, quick-filter tabs, slide-over panel for detail
- [apps/web/src/hooks/use-arc.ts](apps/web/src/hooks/use-arc.ts) — TanStack Query hook with full type model and pagination
- `hasARC` feature flag exists in [packages/shared/src/features/community-features.ts:38](packages/shared/src/features/community-features.ts:38) (NOT `hasViolations` — they are separate gates)
- Help center articles already written under `apps/web/src/content/help/violations/arc-acc-submissions.mdx`

Phase 5c is mostly: extract the tab as a page, gate on `hasARC`, add nav, update breadcrumbs.

### Out of scope
- Modifying `<ArcSubmissionsTab>` internals (filters, columns, slide-over) — render it as-is on the new page
- The ARC submission/approval flow (already exists)
- Renaming `<ArcSubmissionsTab>` (keep the component name; the rename adds churn without value — its responsibility is rendering the list, regardless of where it's mounted)

### Acceptance criteria (binary)
- [ ] New route `apps/web/src/app/(authenticated)/arc-requests/page.tsx` renders `<ArcSubmissionsTab>`. Implementation pattern matches the existing `/violations/inbox/page.tsx` (server component, validates `?communityId=`, gates on feature + role, then renders the client component).
- [ ] The page gates on `hasARC` (NOT `hasViolations`). Use the same feature-gate pattern as `/violations/report` (which uses `<FeatureGate feature="hasViolations">`) — write `<FeatureGate feature="hasARC" communityId={communityId}>`.
- [ ] New sidebar entry in `nav-config.ts`:
  - `id: 'arc-requests'`
  - `label: 'ARC Requests'`
  - `href: (cid) => '/arc-requests?communityId=' + cid`
  - `matchPrefixes: ['/arc-requests']`
  - `featureKey: 'hasARC'`
  - `roles: ADMIN_ROLES` (or whichever role set governs ARC review — verify by checking who currently sees the ARC tab in `<ViolationsInboxTabs>`)
- [ ] Page header: `<PageHeader breadcrumb={<Breadcrumbs items={[<parent>]} currentLabel="ARC Requests" />}>`. Confirm parent — likely "Compliance" or just root.
- [ ] Breadcrumb canonical mapping in `.claude/rules/design.md` adds the "ARC Requests" entry.
- [ ] If Phase 5a deletes `<ViolationsInboxTabs>`, the ARC tab is unreachable until 5c ships. **Coordinate ordering:** ship 5c before or alongside 5a, OR ship 5a + 5c in the same PR. Document in PR description.

### Files to touch
| File | Reason |
|------|--------|
| New: `apps/web/src/app/(authenticated)/arc-requests/page.tsx` | New route, mounts existing component |
| `apps/web/src/components/layout/nav-config.ts` | Add sidebar entry |
| `.claude/rules/design.md` | Breadcrumb mapping |

### Patterns to follow
- Server component page that validates `?communityId=`, fetches whatever the existing tab does (if anything is server-side; the existing tab is purely client + TanStack Query, so the page is mostly auth + feature gate + the rendered client component).
- `<FeatureGate>` usage matches `/violations/report/page.tsx` — copy the pattern.

### Security review
- The ARC API endpoints (whichever `use-arc.ts` calls) already enforce tenant + role scoping. No new gate needed.
- Page-level feature gate prevents communities without `hasARC` from rendering the page at all.

### Verification
```bash
pnpm typecheck
pnpm lint                            # guard:breadcrumbs
pnpm test --filter @propertypro/web -- arc-requests
```

### Manual repro steps
1. Login as `cam` on Sunset Condos (verify `hasARC` is true for that community).
2. Confirm "ARC Requests" sidebar entry appears.
3. Click → table renders with existing data, status filters work, slide-over opens on row click.
4. Login as a community without `hasARC` → confirm sidebar entry hidden, direct URL hits feature-gate redirect.

### Trade-offs / Why this approach
- **Mount the existing component without modifying it (DRY/SRP):** the tab component already has list, filters, detail panel. Re-mounting on a new page is a 5-line file. Building a "new" page would duplicate everything.
- **Keep the component name `<ArcSubmissionsTab>`:** semantically a misnomer once it's a page, but renaming touches every import. YAGNI — rename later if it bothers anyone.

---

## Phase 6a — Document viewer: MVP modal (always opens, in-modal error state)

**Status:** ☐ Not started · **PR:** _TBD_

### Goal
Clicking "View Document" anywhere in the app always opens a centered modal. The modal embeds the document via an iframe (signed URL) on success, or shows an in-modal error state on failure. No more inline `text-xs` chip errors.

### Out of scope
- Pagination, zoom, print, "open in new tab" controls (Phase 6b)
- Migration of other doc-viewing surfaces (announcements, residents, etc.) — Phase 6c follow-up
- Fixing the underlying 404 in `library-document-resolver.ts` (separate ticket)

### Why MVP first
The original "full viewer with controls" scope adds `react-pdf` (~1MB+ bundle) and multiple new affordances. The user's core complaint was "open it in a modal, not a 404 page." That's solved by 6a alone. 6b is a separate, opt-in polish PR.

### Root cause
- [apps/web/src/components/compliance/compliance-item-actions.tsx:35-148](apps/web/src/components/compliance/compliance-item-actions.tsx:35) — `handleView()` fetches the URL first; only opens the dialog on success. On 404/403, error renders as a tiny inline chip, not in a modal.

### Pre-implementation investigation (do these BEFORE writing code)
1. **CSP audit.** [apps/web/src/middleware.ts:217](apps/web/src/middleware.ts:217) sets a CSP header via `buildCspHeader({ isPreview })`. Find that helper, read it, and confirm `frame-src` includes the Supabase storage origin (`https://*.supabase.co` or the project-specific subdomain). If it doesn't, the iframe will be blocked. Resolution: add the origin to `frame-src` in `buildCspHeader`. Note this in the PR description.
2. **iOS Safari behavior.** Mobile Safari does NOT inline PDFs in iframes reliably — it shows a blank frame or triggers a download. Apartment site_manager use case is iPad-heavy, so this matters. Resolution: feature-detect (UA sniff is acceptable here) and render an "Open document" button instead of an iframe on iOS.
3. **Existing modal pattern in compliance-item-actions.tsx.** Read the current modal implementation to match its layout / a11y conventions when building the shared component.

### Acceptance criteria (binary)
- [ ] New shared component: `apps/web/src/components/documents/DocumentViewerModal.tsx`. Props: `{ open, onOpenChange, documentId, communityId, fileName?: string }`.
- [ ] Modal opens immediately on click — no "fetch first, open second" sequence.
- [ ] Inside the modal: TanStack Query (`enabled: open`) fetches `/api/v1/documents/{documentId}/download?communityId=...`. While loading, render a skeleton. On success, render the document. On failure, render an in-modal error state with the API message + "Try again" + "Close" buttons.
- [ ] **iOS detection:** when `/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream`, render `<a href={signedUrl} target="_blank" rel="noopener">Open document</a>` instead of an iframe. Comment this with WHY (Safari PDF iframe behavior).
- [ ] Non-iOS: render `<iframe src={signedUrl} sandbox="allow-same-origin">`. Comment the sandbox choice — `allow-same-origin` is required for the browser to render the doc; we omit `allow-scripts/forms/popups` because we're displaying a static doc, not running an app.
- [ ] Modal width: `sm:max-w-[960px]`. Modal height: `h-[80vh]`.
- [ ] Focus trap, ESC-to-close, focus return on close (handled by Dialog primitive).
- [ ] `compliance-item-actions.tsx` "View Document" button uses the new shared modal. Existing inline modal + `text-xs text-status-danger` chip-error logic is deleted.
- [ ] No "Document not found" inline chip remains anywhere in `compliance-item-actions.tsx`.
- [ ] **Audit logging:** if the existing `compliance-item-actions.tsx` flow already logs a "document viewed" event via `logAuditEvent()` or the download endpoint server-side, preserve that behavior. Verify by reading both files before refactoring.

### Files to touch
| File | Reason |
|------|--------|
| New: `apps/web/src/components/documents/DocumentViewerModal.tsx` | Shared modal |
| `apps/web/src/components/compliance/compliance-item-actions.tsx` | Use shared modal; remove inline error chip |
| `apps/web/src/middleware.ts` (or `buildCspHeader` source) | (only if CSP investigation reveals `frame-src` needs Supabase origin added) |

### Patterns to follow
- Use the shared `Dialog` primitive (focus trap, ESC).
- TanStack Query: query key `['document-download', documentId, communityId]`, `enabled: open`, `staleTime: 0` (signed URL is short-lived).
- Don't add `react-pdf` or any PDF library. iframe handles PDFs natively on desktop; iOS gets the link fallback.

### Security review
- **iframe sandbox:** `allow-same-origin` only. We don't need `allow-scripts`, `allow-forms`, or `allow-popups` for a static doc viewer. Tighter sandbox = less attack surface if a malicious doc somehow lands in storage.
- **CSP:** see investigation step. `frame-src` must allow the Supabase storage origin (or the iframe is blocked).
- **Signed URL expiry:** existing endpoint sets 1-hour TTL. Adequate for view sessions; if a user keeps the modal open >1h the iframe will 403 on refresh — that's acceptable.
- **iOS link target:** `rel="noopener"` is mandatory on `target="_blank"` to prevent reverse tabnabbing.
- **No user-controlled URL:** the signed URL is server-generated. Safe.
- **Audit logging:** verify "document viewed" events still fire for §718 compliance trail (see Audit logging in the preamble).

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm test --filter @propertypro/web -- DocumentViewerModal compliance-item-actions
```

### Manual repro steps
1. Login as `cam` on a desktop browser. Navigate to `/communities/2/compliance`.
2. Click "View Document" on any satisfied row → modal opens immediately, loading skeleton, then iframe with the doc.
3. On the known-failing doc 3004 (or simulate a 404 via DevTools): modal shows in-modal error with the API message + Try again + Close.
4. ESC closes; focus returns to the "View Document" button.
5. **Test on iPad/iPhone Safari** (or simulate via DevTools device mode with iPad UA): modal opens, but instead of iframe, an "Open document" link renders. Click → opens in a new tab.

### Trade-offs / Why this approach
- **iframe vs. react-pdf:** iframe is zero-bundle, browser-native, handles PDFs/images/many types out of the box. react-pdf is ~1MB+ for features users haven't asked for (YAGNI).
- **iOS link fallback over investing in PDF.js for mobile:** UA sniffing is normally a smell, but Safari's iframe-PDF behavior is a known browser-level limitation, not a bug we can fix in our code. The fallback is one small branch. Wider mobile PDF support belongs in 6b (deferred).
- **Always-open vs. fetch-first:** always-open feels faster and surfaces errors clearly. The cost is "the modal opens for an instant before showing an error" — acceptable.
- **Single shared component:** prevents the same error-state divergence we have today across multiple surfaces.

---

## Phase 6b — Document viewer: full controls (DEFERRED)

**Status:** ⛔ Deferred — open only after 6a ships and a real user request emerges · **PR:** _Do not open speculatively_

### Why deferred
- 6a solves the reported user pain (modal, not 404).
- Pagination, zoom, print, open-in-new-tab add ~1MB+ bundle (`react-pdf`) for unproven value.
- YAGNI: ship 6a, observe, then decide.

### When to revisit
If users actively complain about the iframe controls being insufficient (zoom, multi-page PDFs not paginating cleanly, print failing). Until then: don't build.

---

## Phase 6c — Migrate other doc-viewing surfaces to shared modal (FOLLOW-UP)

**Status:** ☐ Not started · **PR:** _Open after 6a is in production_

### Goal
Other surfaces that view documents (announcements with attachments, residents with documents, leases) use the shared `<DocumentViewerModal>` from 6a.

### Out of scope
- Building the modal (6a's domain)
- New features on top of the modal (6b's domain)

### Action
- `grep -rn "createPresignedDownloadUrl\|/download.*documentId" apps/web/src/components/`
- For each call site that currently navigates or opens a tab: replace with `<DocumentViewerModal>` open state.
- One PR per surface to keep blast radius small.

---

## Phase 7a — Letter-suffixed units: investigation

**Status:** ☐ Not started · **PR:** _No code; produces a written report_

### Goal
Determine whether the codebase has any implicit numeric-only assumption about unit labels, and produce a written report enumerating: (a) the schema, (b) the search query path, (c) all surfaces that display or accept unit labels, (d) any production communities currently using letter-suffixed units.

### Out of scope
- Any code changes (those are 7b)
- Seed data changes (those are 7b)
- Test additions (those are 7b)

### Action
1. Read `packages/db/src/schema/*.ts` for the `units` table — confirm the label column is `text`/`varchar` (not numeric).
2. Trace `/api/v1/units` GET handler. Read its query. Confirm no `Number(label)`, no `LIKE '[0-9]%'`, no numeric coercion.
3. Trace the unit search used by `<UnitSearchCombobox>` — confirm case-insensitive, trim-tolerant, partial-match-friendly.
4. Grep the codebase for every place that displays or accepts unit labels. Suggested patterns: `\.unitNumber\b`, `\.label\b.*unit`, `Unit\s*\d+`, `\bunit_number\b`.
5. List every surface in the report: file path + 1-line description.
6. (If access available) query production: any community where a `units.label` includes a letter? Capture aggregate counts only — no PII.
7. Output: a Markdown report at `docs/audits/letter-units-2026-04.md` (date adjustable). The report drives Phase 7b's scope.

### Acceptance criteria (binary)
- [ ] Report exists at `docs/audits/letter-units-2026-04.md`.
- [ ] Report covers all 6 action items above.
- [ ] Report ends with a "Recommended scope for 7b" section listing concrete code changes (if any).

### Files to touch
- New: `docs/audits/letter-units-2026-04.md`

### Verification
```bash
ls docs/audits/letter-units-2026-04.md
# Reviewer reads the report
```

---

## Phase 7b — Letter-suffixed units: implementation

**Status:** ☐ Not started · **PR:** _TBD_ · **Depends on:** Phase 7a's report

### Goal
Communities with letter-suffixed unit labels (e.g., "12B", "PH-1", "A101") have a working visitor-registration flow end-to-end, validated by an integration test and a seed update.

### Out of scope
- Anything outside what 7a's report scoped
- An "Add unit on the fly" feature (separate ticket)

### Acceptance criteria (binary, refined by 7a's report)
- [ ] Sunset Ridge Apartments seed includes at least 4 letter-suffixed units (e.g., "101A", "101B", "PH-1", "PH-2") alongside the existing numeric set.
- [ ] (If 7a flags Sunset Condos): condo seed gains letter units too.
- [ ] `<UnitSearchCombobox>` returns letter-suffixed units when typing partials like "A", "PH", "10". Verify case-insensitive (`a` should match `A101`).
- [ ] New integration test: `apps/web/src/app/api/v1/visitors/__tests__/letter-units.integration.test.ts` covers register-visitor → letter-suffixed-unit happy path + listing.
- [ ] Visitor table renders letter-suffixed host labels without truncation or numeric coercion.
- [ ] Any code changes 7a recommended are implemented.

### Files to touch
| File | Reason |
|------|--------|
| `scripts/seed-demo.ts` (or `packages/db/scripts/seed*` per 7a) | Add letter-suffixed units |
| Any code path 7a flagged for change | Per report |
| New: `apps/web/src/app/api/v1/visitors/__tests__/letter-units.integration.test.ts` | Coverage |

### Patterns to follow
- DB seed updates: idempotent inserts with explicit conflict handling (`onConflictDoNothing()`).
- Integration test: use the existing test harness; authenticate as `site_manager`.

### Security review
- Seed data changes only affect dev/demo. No prod impact.
- New integration test must not run against production.

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm seed:demo                       # confirm seed is idempotent and adds letter units
pnpm seed:verify                     # passes
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts -- letter-units
```

### Manual repro steps
1. `pnpm seed:demo` to refresh seed
2. Login as `site_manager` → `/dashboard/visitors`
3. Click "Register Visitor" → type "A" in host unit → confirm "A101" or similar appears
4. Pick → fill the rest → submit → confirm visitor appears with the letter-suffixed unit label intact

### Trade-offs / Why this approach
- Investigation-first (7a) is KISS. We don't write code we don't need. The report defines real scope.
- Adding letter-suffixed seeds catches the regression in dev-time UX; the integration test catches future regressions.

---

## Tracking

| Phase | Title | Status | Depends on | Notes |
|-------|-------|--------|------------|-------|
| 1 | Operations upgrade dialog populates | ☐ | — | |
| 2 | Remove E-Sign coming-soon banner | ☐ | — | |
| 3a | Activity History: Sheet → Dialog | ☐ | — | |
| 3b | Activity History: user picker | ☐ | 3a (or rebase) | |
| 3c | Activity History: design polish | ⛔ | designer review | Deferred |
| 4 | Payments unified screen | ☐ | — | |
| 5a | Violations: route + label + tabs | ☐ | coordinate w/ 5c | ARC unreachable until 5c lands |
| 5b | Violations: surface "New violation" CTA | ☐ | — | One-file change; reuses existing /violations/report |
| 5c | ARC Requests: extract existing tab as standalone page | ☐ | coordinate w/ 5a | |
| 6a | Document viewer: MVP modal | ☐ | — | |
| 6b | Document viewer: full controls | ⛔ | 6a + user demand | Deferred |
| 6c | Migrate other doc-view surfaces | ☐ | 6a | Follow-up |
| 7a | Letter units: investigation | ☐ | — | Report only, no code |
| 7b | Letter units: implementation | ☐ | 7a | |

## Suggested execution order

| Order | Phase | Reason |
|-------|-------|--------|
| 1 | 5b | One-file CTA wire-up; smallest possible scope |
| 2 | 2 | Remove dead code (E-Sign banner) |
| 3 | 1 | Operations upgrade dialog bug fix |
| 4 | 6a | Compliance "View Document" 404 → modal |
| 5 | 5a + 5c (paired) | Violations route flatten + ARC standalone — ship together so ARC stays reachable |
| 6 | 3a | Mechanical refactor (Sheet → Dialog) |
| 7 | 7a | Letter units investigation report |
| 8 | 3b | User picker — needs new endpoint + DB query |
| 9 | 7b | Letter units implementation per 7a's report |
| 10 | 4 | Payments unification — highest blast radius, last |
| 11 | 6c | Follow-up; only after 6a is stable |

Deferred (no work): 3c (designer review), 6b (no demand).

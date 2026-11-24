# Violations Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the Violations nav item for everyone. Behind the design-preview gate, rebuild `/violations/report` as a kit Form page and `/violations` as a kit List page with Review and Mine tabs.

**Architecture:** The nav change is one deleted line and ships alone. The two pages follow the Plan A pilot pattern:
- the server `page.tsx` calls `isDesignPreviewOn(userId)` and renders either a new view component or today's unchanged view, with a `ponytail:` marker at each branch;
- new views live in new files;
- old components are not edited;
- shared constants and the Mine-tab loader are extracted to `lib/violations/` so both views read one source.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind (`cq` container queries), TanStack Query, `@propertypro/ui` kit (`PageLayout`, `Section*`, `RecordRow`, `StatusGlyph`, side panel), Vitest (node + jsdom projects), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-violations-redesign-design.md` (parent: `docs/superpowers/specs/2026-11-21-page-anatomy-design.md`). Read both, plus `apps/web/src/app/(authenticated)/emergency/page.tsx` and `apps/web/src/components/visitors/visitors-staff-page.tsx` as the pattern to copy.

## Global Constraints

- Customers see no change except the flat nav. Every new view renders only when `isDesignPreviewOn(userId)` is true. Without the gate, `/violations` still redirects anyone who fails `canActAsBoard` to `/dashboard?reason=insufficient-permissions`.
- The gate selects a view only, never authorization. Review data (`/api/v1/violations` without a unit scope) is loaded only for viewers who pass `canActAsBoard`.
- Mine-tab rows cross to the client only through the existing `toCardFields` projection (the D1a/D1b privacy boundary).
- The behaviour for board members stays as today: their "On your unit" shows every case on their home, with the reporter named.
- Do not edit `ViolationReportForm.tsx`, `StaffViolationReportForm.tsx`, `ViolationCard.tsx`, `ViolationsAdminInbox.tsx`, or any existing file under `packages/ui/src/components/` (an edit there reaches admin).
- Each branch point carries the marker `// ponytail: two views of this page while the pilot is judged. Trigger: the owner approves or rejects the pilot (plan Task 19), or 30 days after the pilot merges.`
- Fixed copy:
  - Form description (resident): "Tell the board about a problem at a home. Describe what you saw and add photos if you have them. Your name is shown only to you and the board, never to the household you report."
  - Staff description: "File a report on a resident's behalf. Your name is recorded as the reporter."
  - Primary label: "Submit report" (resident) / "File report" (staff).
  - Confirmation: "Report #<id> sent to the board."
- Selected tabs and filters are ink, never coral (`tone="ink"` on `QuickFilterTabs`; Visitors' `LIST_CLASS`/`TRIGGER_CLASS` on tabs).
- Before opening each PR, run full `pnpm lint` and full `pnpm test` (not only the touched folders), and `pnpm typecheck`. Use `pnpm test <path>` with no `--` for single files.
- Three PRs, opened in order and rebased between: **PR 1** = Task 1, **PR 2** = Tasks 2–4, **PR 3** = Tasks 5–9.

## Review Focus

1. **A resident with no unit opens `/violations?tab=mine`** in the preview and expects the "You're not linked to a unit yet" first run, not an empty list or a crash. Pinned in Task 8.
2. **A plain resident hand-types `?tab=review`** and expects Mine, with no Review request made from their browser. Pinned in Tasks 5 and 8.
3. **A submit whose photo upload fails halfway** should leave the form filled in, show the error callout, and not navigate. Pinned in Task 3.
4. **A community with fines off** should never show a "Fined" filter, even with a stray fined row in old data. Its rows still count as open. Pinned in Task 5.
5. **A double-click on Submit** should create one violation, because the button is disabled while submitting. Pinned in Task 3.

---

### Task 1: Flat Violations nav (PR 1, ungated)

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts:224` (delete `children: ['violations-inbox'],`)
- Test: `apps/web/__tests__/layout/nav-config.test.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test** in the `NAV_ITEMS` describe block:

```ts
it('does not nest the violations inbox under Report Violation', () => {
  const report = NAV_ITEMS.find((i) => i.id === 'violations-report');
  expect(report?.children ?? []).not.toContain('violations-inbox');
  expect(NAV_SECTIONS.find((s) => s.label === 'Admin')?.items.map((i) => i.id)).toContain('violations-inbox');
});
```

- [ ] **Step 2: Run it.** `pnpm test apps/web/__tests__/layout/nav-config.test.ts`. Expected: FAIL on the first `expect`.
- [ ] **Step 3: Delete the `children` line** from the `violations-report` item.
- [ ] **Step 4: Run the layout and palette tests.** `pnpm test apps/web/__tests__/layout apps/web/__tests__/command-palette`. Expected: PASS.
- [ ] **Step 5: Check in the browser.** Sign in as `cam` on the agent sandbox (`pnpm agent:live:web`). "Violations" is a flat item under Admin, and "Report Violation" has no chevron. Screenshot for the PR.
- [ ] **Step 6: Commit.** Message: `nav: Violations is its own item, not nested under Report Violation`. Run full lint and test, then open PR 1.

---

### Task 2: Shared violation vocabulary (PR 2)

**Files:**
- Create: `apps/web/src/lib/violations/vocabulary.ts`
- Test: `apps/web/__tests__/violations/vocabulary.test.ts`

**Interfaces:**
- Produces:
  - `VIOLATION_CATEGORIES: readonly { value: string; label: string }[]`, the same nine entries and order as `ViolationReportForm.tsx:28-38`.
  - `categoryLabel(value: string): string`, which falls back to the raw value.
  - `VIOLATION_STATUS_LABELS: Record<ViolationStatus, string>`: Reported, Noticed, Hearing scheduled, Fined, Resolved, Dismissed.
  - `SEVERITY_OPTIONS: readonly { value: ViolationSeverity; label: string }[]`.
  - `OPEN_STATUSES: readonly ViolationStatus[]` = `['reported','noticed','hearing_scheduled','fined']`.
  - `violationGlyph(status: ViolationStatus): StatusGlyphKind`.

- [ ] **Step 1: Write the failing tests.**

```ts
it.each([
  ['reported', 'attention'], ['noticed', 'in-progress'], ['hearing_scheduled', 'in-progress'],
  ['fined', 'overdue'], ['resolved', 'done'], ['dismissed', 'not-started'],
] as const)('%s → %s glyph', (s, g) => expect(violationGlyph(s)).toBe(g));
it('open statuses exclude resolved and dismissed', () =>
  expect([...OPEN_STATUSES].sort()).toEqual(['fined', 'hearing_scheduled', 'noticed', 'reported']));
it('categories match the report form', () =>
  expect(VIOLATION_CATEGORIES.map((c) => c.value)).toEqual(['noise','parking','unauthorized_modification','pet','trash','common_area_misuse','landscaping','property_damage','other']));
it('unknown category falls back to the raw value', () => expect(categoryLabel('xyz')).toBe('xyz'));
```

- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/vocabulary.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `vocabulary.ts`. It must be import-time pure, with no db import (memory: a pure module that imports db fails at load without `DATABASE_URL`). Import the `ViolationStatus` / `ViolationSeverity` types with `import type`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `violations: shared vocabulary for the redesigned views`.

---

### Task 3: Report form view (PR 2)

**Files:**
- Create: `apps/web/src/components/violations/report-violation-page.tsx` (`'use client'`)
- Test: `apps/web/__tests__/violations/report-violation-page.test.tsx` (jsdom)

**Interfaces:**
- Consumes:
  - Task 2's `VIOLATION_CATEGORIES` and `SEVERITY_OPTIONS`;
  - existing `ViolationUnitPicker` and `useViolationUnitOptions` (`./ViolationUnitPicker`), `uploadEvidencePhoto`, and `createViolation(payload): Promise<{ data: ViolationItem }>`.
- Produces: `ReportViolationPage(props: { communityId: number; mode: 'resident' | 'resident_no_unit' | 'staff'; ownUnitIds: number[] })`.

Page shape:
- `PageLayout template="form"`.
- `PageHeader` with title "Report a violation" and icon `<TriangleAlert />`. The description is from Global Constraints. For residents it ends with a `Link` "See your reports" to `/violations?tab=mine&communityId=<id>`.
- `actions` is the Cancel outline `Button asChild`, which goes to `/violations?tab=mine&communityId=` for residents and `/violations?communityId=` for staff.
- Main column: one `Section` holding a `SectionHeader title="What happened"` and the fields (labels as in spec §5.2).
  - Severity is a `fieldset` with a `legend` and three native radio inputs. Minor is the default.
  - Description has a `maxLength` of 4000 and a counter.
  - Photos: at most 3, 10 MB each, `image/jpeg,image/png,image/webp,image/gif`. Upload the same way as today, in order, before `createViolation`.
- Below that, a `SectionFooter` with the one filled primary `Button type="submit"`. It is disabled while submitting, while units are loading, or when there are no units. The loading words are "Uploading photos…" and "Submitting…".
- A server error renders above the footer as a callout: left rule, `TriangleAlert`, the lead word "Couldn't send", and `role="alert"`.
- On success, `router.push('/violations?tab=mine&reported=<id>&communityId=<cid>')` for residents, or `'/violations?reported=<id>&communityId=<cid>'` for staff, where `<id>` is `data.id`.
- In `resident_no_unit` mode, render no form. Show `SectionFirstRun headingLevel={2}` with the title "You're not linked to a unit yet", today's sentence, and an outline "Back to dashboard" link.

- [ ] **Step 1: Write the failing tests.** Mock `@/lib/api/violations`, `@/lib/violations/evidence-upload`, `next/navigation` (`useRouter` → `{ push }`), and `./ViolationUnitPicker` (a `<select>` driven by props).
  - **Resident success:** choose unit 7, category noise and severity major, type a description, submit. Expect `createViolation` called with `{ communityId: 1, unitId: 7, category: 'noise', severity: 'major', description, evidenceDocumentIds: undefined }`, then `push('/violations?tab=mine&reported=42&communityId=1')`.
  - **Staff:** `push('/violations?reported=42&communityId=1')`; the button reads "File report"; there is no "See your reports" link.
  - **Validation:** an empty submit shows "Please select the unit the report is about", "Category is required" and "Description is required", and does not call `createViolation`.
  - **Upload failure (Review Focus 3):** `uploadEvidencePhoto` rejects on the second photo. Expect an alert containing the error, no `push`, and the description still filled in.
  - **Double submit (Review Focus 5):** `createViolation` stays pending; a second click while pending leaves `createViolation` called once.
  - **No unit:** the heading "You're not linked to a unit yet" shows, and there is no `form` element.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/report-violation-page.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the component per the shape above. Validate with the same zod schema as `ViolationReportForm.tsx:48-55`.
- [ ] **Step 4: Run again.** Expected: PASS. Then add an axe check (`jest-axe`, as in `emergency-new-page.test.tsx`) for resident mode, run it, and expect no violations.
- [ ] **Step 5: Revert-check.** Delete the `disabled={submitting || …}` condition, then confirm only the double-submit test goes red. Restore it.
- [ ] **Step 6: Commit.** Message: `violations: report form on the page kit (preview only)`. Record the revert-check in the message body.

---

### Task 4: Gate the report page (PR 2)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/violations/report/page.tsx`
- Create: `apps/web/src/lib/violations/resident-lists.ts`
- Modify: `scripts/page-template-baseline.json` (remove the `violations/report/page.tsx` entry)
- Test: `apps/web/__tests__/violations/violation-pages-reporter.test.tsx` (add `vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: previewMock }))`), plus a new `apps/web/__tests__/violations/report-page-view-selection.test.tsx`

**Interfaces:**
- Consumes: Task 3's `ReportViolationPage`.
- Produces: `loadResidentViolationLists(communityId: number, membership: CommunityMembership, userId: string, residentUnitIds: number[]): Promise<{ onYourUnit: ViolationCardFields[]; yourReports: ViolationCardFields[] }>`, plus the exported `ViolationCardFields` type and `toCardFields`. This is a pure move of the two queries and the projection out of `report/page.tsx`. The old branch calls it too.

- [ ] **Step 1: Write the failing view-selection test.** Copy the shape of `emergency-page-view-selection.test.tsx`. With preview on:
  - a resident with units gets `report-pilot` with `mode: 'resident'`;
  - a manager gets `mode: 'staff'`;
  - a resident with no units gets `mode: 'resident_no_unit'`;
  - none of them call `listViolationsForCommunity`, because the new view shows no lists.

  With preview off, the old components render exactly as today.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/report-page-view-selection.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Extract `loadResidentViolationLists`** into `resident-lists.ts` without changing behaviour. Add the gate branch after `resolveReportMode`. When preview is on, return `<FeatureGate …><ReportViolationPage …/></FeatureGate>` with the ponytail marker, and skip the list queries.
- [ ] **Step 4: Run the violations folder.** `pnpm test apps/web/__tests__/violations`. Expected: all PASS, including the unchanged D1a/D1b assertions in `violation-pages-reporter.test.tsx`.
- [ ] **Step 5: Remove the baseline entry.** Run `pnpm guard:page-template`. Expected: exit 0.
- [ ] **Step 6: Screenshot it.** Use the sandbox with the `pp_design_preview=1` cookie at 1280 and 1440, as `tenant` and `root_sunset` on Sunset Condos. Compare against spec §5.2 and fix any layout defects.
- [ ] **Step 7: Commit, then open PR 2.** Message: `violations: report page renders the kit form behind the preview gate`. Run full `pnpm lint`, `pnpm test` and `pnpm typecheck` first. Attach the screenshots.

---

### Task 5: Tab access and review figures, pure (PR 3)

**Files:**
- Create: `apps/web/src/lib/violations/violations-view.ts`
- Test: `apps/web/__tests__/violations/violations-view.test.ts`

**Interfaces:**
- Consumes: Task 2's `OPEN_STATUSES`.
- Produces:
  - `type ViolationsTab = 'review' | 'mine'`;
  - `violationsTabs(m: { isAdmin: boolean; role: CommunityRole; designation: string | null }): ViolationsTab[]`. Order is review then mine; an empty array means no access;
  - `pickTab(raw: string | undefined, allowed: ViolationsTab[]): ViolationsTab`. Falls back to `allowed[0]`;
  - `reviewFigures(rows: Pick<ViolationItem,'status'>[], finesEnabled: boolean): { counts: Record<ViolationStatus | 'all', number>; open: number; waitingForNotice: number; hearings: number; filters: ViolationStatus[] }`.

  `filters` lists the statuses offered as tabs: all six, minus `'fined'` when fines are off. `open` counts `OPEN_STATUSES` regardless of `finesEnabled`. `waitingForNotice` is the `reported` count, and `hearings` is the `hearing_scheduled` count.

- [ ] **Step 1: Write the failing tests.**
  - Manager (`isAdmin: true`) → `['review']`.
  - Resident with `designation: 'board_member'` → `['review', 'mine']`.
  - Plain resident → `['mine']`.
  - `pickTab('review', ['mine'])` → `'mine'` (Review Focus 2).
  - `pickTab(undefined, ['review','mine'])` → `'review'`.
  - `reviewFigures` on `[reported, reported, noticed, fined, resolved, dismissed]` with fines off → `open: 4`, `waitingForNotice: 2`, `filters` without `'fined'`, `counts.all: 6` (Review Focus 4).
  - With fines on → `filters` contains `'fined'`.

  Inside `violationsTabs`, use `hasBoardDesignation` from `@propertypro/shared` (the same rule `canActAsBoard` applies: `isAdmin || hasBoardDesignation(designation)`), not a string compare.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/violations-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Import only from `@propertypro/shared` and Task 2, never from db, so the module stays pure.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `violations: tab access and review figures`.

---

### Task 6: Review data hook (PR 3)

**Files:**
- Create: `apps/web/src/hooks/use-violations-review.ts`
- Test: `apps/web/__tests__/violations/use-violations-review.test.tsx` (jsdom, with a `QueryClientProvider` wrapper)

**Interfaces:**
- Consumes: the existing `listViolations(communityId, params, signal)`.
- Produces: `useViolationsReview(communityId: number, filters: { unitId?: number; severity?: ViolationSeverity; createdAfter?: string; createdBefore?: string }, enabled: boolean)`, returning a TanStack Query result over `ViolationItem[]`.

  The hook makes one status-agnostic call, `listViolations(communityId, { ...filters, page: 1, limit: 2000 }, signal)`. The query key is `['violations-review', communityId, filters]`. `enabled` is false for viewers without Review, which keeps Review Focus 2's "no request" promise.

- [ ] **Step 1: Write the failing tests.**
  - `enabled: false` → `listViolations` is never called.
  - Filters are passed through, with no `status` param.
  - The `signal` is forwarded.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/use-violations-review.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `violations: review list hook (one status-agnostic walk)`.

---

### Task 7: Violations List view (PR 3)

**Files:**
- Create: `apps/web/src/components/violations/violations-page.tsx` (`'use client'`)
- Test: `apps/web/__tests__/violations/violations-page.test.tsx` (jsdom)

**Interfaces:**
- Consumes:
  - Task 2's `categoryLabel`, `VIOLATION_STATUS_LABELS`, `violationGlyph`;
  - Task 4's `ViolationCardFields`;
  - Task 5's `ViolationsTab`, `pickTab`, `reviewFigures`;
  - Task 6's `useViolationsReview`.
- Produces: `ViolationsPage(props: { communityId: number; tabs: ViolationsTab[]; initialTab: ViolationsTab; canCreate: boolean; finesEnabled: boolean; hasArc: boolean; about?: AccessSentence; initialUnitId?: number; mine: { residentUnitIds: number[]; onYourUnit: ViolationCardFields[]; yourReports: ViolationCardFields[] } | null })`.

**Page frame**
- `PageLayout template="list" records="rows"`.
- `PageHeader` with title "Violations" and `<TriangleAlert />`. The description depends on the tab: "Review, track and close out violation cases." or "Cases on your home and the reports you've filed."
- Actions: "New violation" (a link to `/violations/report?communityId=`) on Review when `canCreate`; "Report a violation" (same link) on Mine.
- Tabs: shadcn `Tabs` with Visitors' classes, drawn only when `tabs.length > 1`. A tab change writes `?tab=` with `router.replace`.
- `?reported=<id>` renders the confirmation line from Global Constraints with a Dismiss button, then strips the param with `router.replace`.

**Review tab**
- **Toolbar:** a `SectionToolbar` holding:
  - `QuickFilterTabs tone="ink"` built from `reviewFigures().filters`, with counts and an "All" tab;
  - on the right, a severity `<select>`, two date inputs with today's aria-labels "Filter violations from date" and "Filter violations until date" (an e2e depends on them), and the "One unit only · Show all units" chip when a unit is set.
- **Rows:** a `RecordList` of `RecordRow`s.
  - The title is a `Link` to `/violations/<id>?communityId=` with the text `categoryLabel · unitLabel`.
  - `preview` is the description's first line.
  - `statusWord` comes from `VIOLATION_STATUS_LABELS`.
  - `meta` is `[capitalised severity, 'Reported <date>']`.
  - `lead` is a `StatusGlyph` from `violationGlyph`.
- **Pages:** 20 rows per page, client-side. The `SectionFooter` shows "Showing N of M" and a "Load more" button that adds 20.
- **States:**
  - loading: skeleton rows and `aria-busy`;
  - error: `SectionError` with Try again (`refetch`);
  - no matches: "Nothing matches these filters" and "Clear filters";
  - no cases at all: `SectionFirstRun` "No violation cases yet".
- **Panel** (`template: 'list'`):
  - At a glance: `PanelGlance` with `figure=open`, unit "open cases", lines `[['Waiting for a notice', n], ['Hearings scheduled', n]]`, `source="violations.status"`.
  - Needs attention: `PanelAttention`. When reported > 0, the lead is "Waiting" and the title is "N reported cases have no notice yet", with an action button that selects the Reported filter. Otherwise `none: "Cases that need a notice will show here."`.
  - Shortcuts: `PanelLinks` with "ARC requests" when `hasArc`.
  - About: the `about` prop.
  - The panel only appears on the Review tab.

**Mine tab**
- Two `Section`s with `SectionHeader`s: "On your unit", and "Your reports" with today's sub-line as its description.
- Rows are built as on Review. A "Your reports" row whose `unitId` is not in `residentUnitIds` renders its title as plain text, not a link.
- "Filed by staff" is appended to `meta` when `reportedByRole === 'staff'`.
- An empty section is omitted. When both are empty, show a `SectionFirstRun` titled "Nothing here yet" with a "Report a violation" action.
- `mine.residentUnitIds.length === 0` shows the "You're not linked to a unit yet" first run.

- [ ] **Step 1: Write the failing tests.** Mock `useViolationsReview`, `next/navigation` and `next/link`.
  - **Tabs:** with `tabs=['review']` there is no tablist, and the panel shows "open cases". With `['review','mine']` there are two tabs, and clicking Mine calls `replace` with `tab=mine`.
  - **Filters:** clicking "Reported" leaves only reported rows, and its count matches the panel's "Waiting for a notice".
  - **Fines (Review Focus 4):** with `finesEnabled: false` there is no "Fined" filter.
  - **Review rows:** a row's link `href` is `/violations/5?communityId=1`.
  - **Mine privacy:** a "Your reports" row for unit 9 with `residentUnitIds=[3]` has no link.
  - **Mine no unit (Review Focus 1):** `mine.residentUnitIds=[]` shows "You're not linked to a unit yet".
  - **Confirmation:** `?reported=42` shows "Report #42 sent to the board.".
  - **Load more:** 25 rows show 20, then 25 after "Load more".
  - **Error:** Try again calls `refetch`.
  - **Axe:** one check per tab.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/violations-page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Revert-check.** Make the "Your reports" row always link, then confirm only the Mine privacy test goes red. Restore it.
- [ ] **Step 6: Commit.** Message: `violations: list page with Review and Mine tabs (preview only)`. Record the revert-check.

---

### Task 8: Gate `/violations` (PR 3)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/violations/page.tsx`
- Modify: `scripts/page-template-baseline.json` (remove the `violations/page.tsx` entry)
- Test: `apps/web/__tests__/violations/violations-page-view-selection.test.tsx`

**Interfaces:**
- Consumes:
  - Task 4's `loadResidentViolationLists`;
  - Task 5's `violationsTabs` and `pickTab`;
  - Task 7's `ViolationsPage`;
  - `describeAccess(membership.communityType, 'violations', 'own')`;
  - `getFeaturesForCommunity(...).hasARC`.

**Order inside the page:**
1. Validate `communityId`, then authenticate and resolve membership, as today.
2. Run the type gate, as today.
3. Resolve `preview`.
4. Without preview, the existing `canActAsBoard` redirect and the old render stay byte-for-byte.
5. With preview:
   - compute `tabs = violationsTabs(membership)`; redirect to `/dashboard?reason=insufficient-permissions` if it is empty;
   - if `tabs` includes `'mine'`, compute `residentUnitIds = await getActorUnitIds(scoped, userId)`, and when it is non-empty, `loadResidentViolationLists(...)`;
   - render `<FeatureGate><ViolationsPage …/></FeatureGate>` with `initialTab = pickTab(params.tab, tabs)`, `canCreate = isAdminRole(membership.role)`, `finesEnabled = membership.violationFinesEnabled`, and `initialUnitId` from `?unitId=`.

- [ ] **Step 1: Write the failing tests.** Follow the `emergency-page-view-selection.test.tsx` pattern.
  - **Preview off:**
    - a plain resident is redirected with `insufficient-permissions`;
    - a manager gets the old inbox.
  - **Preview on:**
    - a manager gets `tabs: ['review']`, `mine: null`, and `loadResidentViolationLists` is not called;
    - a board resident gets `['review','mine']` with lists loaded;
    - a plain resident gets `['mine']` and `initialTab: 'mine'`, even with `?tab=review` (Review Focus 2);
    - a resident with no units gets `mine.residentUnitIds: []` and no list query.
- [ ] **Step 2: Run.** `pnpm test apps/web/__tests__/violations/violations-page-view-selection.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the ponytail marker at the branch.
- [ ] **Step 4: Run the folder.** `pnpm test apps/web/__tests__/violations`. Expected: PASS.
- [ ] **Step 5: Revert-check.** Force `tabs` to `['review','mine']` for every preview viewer, then confirm the plain-resident case goes red. Restore it.
- [ ] **Step 6: Remove the baseline entry.** Run `pnpm guard:page-template`. Expected: exit 0.
- [ ] **Step 7: Commit.** Message: `violations: /violations renders Review/Mine behind the preview gate`.

---

### Task 9: End-to-end proof and PR 3 (PR 3)

**Files:**
- Modify: `apps/web/e2e/design-direction-pilot.spec.ts`
- Modify: `apps/web/e2e/ci-safe-specs.json` (raise `expectedTestCount` by the number of blocks added, and add a dated note in the file's existing style)

**Interfaces:** Consumes `startPilot`, `open`, `WIDTHS` and the overflow assertions from `apps/web/e2e/helpers/design-pilot.ts`.

- [ ] **Step 1: Add four blocks.** Read limits are 100 per minute per user and most specs sign in as `cam`, so use other roles. Assert a real row, not an empty list.
  1. `report form (manager) holds at 1280 and 1440`, as `root_sunset` on `/violations/report`: the header "Report a violation", the "File report" button, no overflow.
  2. `report form (resident) holds and links to Mine`, as `tenant`: "See your reports" goes to `/violations?tab=mine`.
  3. `violations review (manager) holds at 1280 and 1440`, as `root_sunset`: wait for a row link or "No violation cases yet". At 1440 the panel shows "open cases". No overflow.
  4. `violations (board member) shows Review and Mine tabs`, as `board_member`: both tabs are visible, and clicking Mine shows the "On your unit" or "Your reports" heading, or "Nothing here yet".
- [ ] **Step 2: Run against the sandbox.** Use the `test:e2e` flow on the agent sandbox (CLAUDE.md, E2E preconditions). Expected: the four new blocks and the existing pilot blocks pass. Then force `isDesignPreviewOn` to return false and confirm the four new blocks go red. Restore it.
- [ ] **Step 3: Count the tests.** Run `pnpm --filter @propertypro/web exec playwright test -c playwright.ci.config.ts --list | grep -c chromium`, then set `expectedTestCount` to that number.
- [ ] **Step 4: Take screenshots** with `PILOT_SHOTS_DIR` set, at 1280 and 1440, as `root_sunset`, `board_member` and `tenant`. Look at every one before calling it done.
- [ ] **Step 5: Commit and open PR 3.** Message: `e2e: violations redesign pilot blocks`. Run full `pnpm lint`, `pnpm test` and `pnpm typecheck` first. Attach the screenshots. In the PR body, note that the owner's manager account sees only the staff form and the Review tab.

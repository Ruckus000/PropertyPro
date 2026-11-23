# Violations redesign: report form, Review and Mine tabs, flat nav

Date: 2026-11-23
Status: reviewed by a builder check; awaiting owner approval
Parent spec: `2026-11-21-page-anatomy-design.md` (section numbers below, §, refer to it)
Precedent: Plan A pilot (`docs/superpowers/plans/2026-11-21-design-direction-a-foundation-and-pilot.md`):
Packages, Emergency Alerts, Visitors.

> **Update 2026-11-23 (later the same day):** the owner approved the design pilot,
> so the preview gate is gone (#1531 deleted `isDesignPreviewOn`). The redesigned
> Report a violation page and the Violations page (Review / Mine tabs) shipped to
> everyone and the old views were deleted. A plain resident now reaches
> `/violations` with Mine only. The sidebar is ONE "Violations" item, in the
> Management section, for everyone (owner), opening `/violations`; the separate
> "Report Violation" item is removed and reporting is the page's header button.
> The dashboard tile and the command palette's "Report a Violation" still open
> `/violations/report`. Sections below that describe the gate, two flat nav
> items or a manager-only Violations entry are superseded by this note.

Lines marked **(owner)** are the owner's decisions from the 2026-11-23 conversation.
Everything else is the author's call and may be challenged.

## 1. Intent

The owner wants the Report violation page brought into the new design direction,
and the nested nav dropdown removed (**owner**). Today `/violations/report` is a
hand-built card form with two record lists bolted underneath. Managers reach the
review inbox through a chevron under "Report Violation" in the sidebar. Neither
page follows "one page, one shape" (§0.3).

## 2. Goals, non-goals, anti-goals

Goals:

1. The sidebar has no nested Violations item. "Report Violation" and
   "Violations" are flat siblings, as the spec's drawn nav shows (§6). This ships
   to everyone, ungated (**owner**).
2. `/violations/report` becomes a **Form** page (§5.6) on the kit.
3. `/violations` becomes a **List** page with **tabs** (**owner**):
   - **Review**: the case inbox, for anyone who passes `canActAsBoard`.
   - **Mine**: "On your unit" and "Your reports", for any resident.
   - Board members, who are residents, see both. Managers see only Review and
     plain residents only Mine. A page with one tab draws no tab row.
4. Review rows open `/violations/[id]` (**owner**, approach A). The in-place
   expanding action panel is not in the new view.
5. Items 2–3 render only behind the existing preview gate
   (`isDesignPreviewOn`). Customers see today's pages unchanged (**owner**).

Non-goals:

- Redesigning `/violations/[id]`. It keeps its look; it becomes the only place a
  case is acted on in the new view.
- ARC requests, fines, hearing flows, the API, or any data model change.
- Removing the old views. That happens with the pilot's Task 19, once the owner
  rules on the direction.
- The "Leases → Move In/Out" nested nav item. It stays.

Anti-goals (a failure even if it works):

- Any change a customer can see other than the flat nav.
- A resident seeing anything about a neighbour's case beyond what the report
  page shows them today: reporter redaction (D1b) and the D1a filter hold.
- A board member losing sight of a case against their own home.
- Editing an existing shared primitive in `packages/ui` (that reaches admin; §15).

## 3. Constraints

- Gate pattern: the page's server component calls `isDesignPreviewOn(userId)` and
  renders the new view or the old one. Every branch point carries a `ponytail:`
  marker with the Task 19 trigger, as in `emergency/page.tsx`. Old components
  (`ViolationReportForm`, `StaffViolationReportForm`, `ViolationCard`,
  `ViolationsAdminInbox`) are not edited; fixes until Task 19 land in both views.
- Authorization is unchanged. The gate selects a view only. `/violations` today
  redirects anyone who fails `canActAsBoard`. In the new view a plain resident
  is admitted to the Mine tab only; the Review tab and its data stay behind
  `canActAsBoard`. Without the gate, the redirect stays exactly as it is.
- Type gate (`hasViolations`) and `<FeatureGate>` wrap both views, as today.
- Mine-tab data is the report page's current server queries, moved unchanged:
  `listViolationsForCommunity` with `allowedUnitIds` plus
  `residentVisibleViolationsWhere`, and with `reportedByUserId`, both through
  `withUnitLabels` + `hydrateReportedByRole` + `toCardFields`. The projection to
  card fields is a privacy boundary (a neighbour's hearing details and
  resolution notes must not cross to the client) and moves with it.
- Kit parts available: `PageLayout`, `PageHeader` (paints inside `PageLayout`),
  `Section`/`SectionHeader`/`SectionToolbar`/`SectionFooter`/`SectionFirstRun`/
  `SectionError`, `RecordList`/`RecordRow`, `StatusGlyph`, side-panel slots
  (`PanelGlance`, `PanelAttention`, `PanelLinks`), `describeAccess` for "About".
  Tabs follow Visitors: shadcn `Tabs` with Visitors' ink-underline classes,
  selected tab in `?tab=`.
- `scripts/page-template-baseline.json` lists `violations/page.tsx` and
  `violations/report/page.tsx`; both entries are removed in the PR that adds
  their `PageLayout`, or the guard fails on a baselined page that is now
  templated.
- Repo gates: full `pnpm lint` and full `pnpm test` before each PR (memory:
  `guard:responsive-geometry`, the container-query test); `perf-check`;
  `guard:page-template` baseline must not grow.

## 4. Approaches considered

For how a case is worked from the Review tab:

| | Approach | Trade-off |
|---|---|---|
| **A (chosen, owner)** | Rows link to `/violations/[id]`, which already carries every status action (`ViolationDetailView` → `ViolationStatusTransition`) | Matches §5.5 and the mockup; no kit change. One extra click per action; the detail page keeps its old look for now |
| B | Rows expand in place with `ViolationDetailPanel`, as today | Fewer clicks; needs a new expandable-row kit part and is off-spec |

For where residents' own lists go (**owner** chose the first):

| | Approach | Trade-off |
|---|---|---|
| **Tabs on `/violations` (chosen)** | Review + Mine | Board members keep both views in one place; pulls the inbox onto the kit |
| `/violations/mine` | Separate page | Inbox untouched; two places to look |
| Non-board residents only | Board members use the inbox | Board members lose "On your unit" |

## 5. The design

### 5.1 Nav (ungated)

Delete `children: ['violations-inbox']` from the `violations-report` item in
`nav-config.ts`. `violations-inbox` already sits in the Admin section, so it
renders there as a flat item. Update `nav-config.test.ts` /
`nav-config-slim.test.ts` where they pin the nesting.

Sketch (manager view):

```
Management                     Admin
  Packages                       Compliance
  Visitors                       ...
  Report Violation               Violations
  ARC Requests                   Move In/Out
```

### 5.2 Report page `/violations/report` (Form, gated)

```
Violations > Report a violation
[!] Report a violation                                  [Cancel]
    Tell the board about a problem at a home. Describe what you saw
    and add photos if you have them.
    Your name is shown only to you and the board, never to the household
    you report.
+-------------------------------------------------------------------+
| What happened                                                     |
|  Unit the report is about   [ Unit 412 (yours)          v ]       |
|    Any unit in the community. For a shared space or a repair,     |
|    submit a maintenance request instead.                          |
|  Category                   [ Noise                     v ]       |
|  Severity                   ( ) Minor  ( ) Moderate  ( ) Major    |
|  Description                [                                ]    |
|                             [                                ]    |
|                                                       42/4000     |
|  Photos (up to 3)           [ Add photos ]  photo1.jpg  Remove    |
+-------------------------------------------------------------------+
|                                               [ Submit report ]   |
+-------------------------------------------------------------------+
```

- `PageLayout template="form"`, `PageHeader` with `icon` (`TriangleAlert`, the
  Violations nav icon), title "Report a violation", the description above.
  Header actions: **Cancel** only (outline), linking to `/violations?tab=mine`
  for residents and `/violations` for staff.
- The privacy sentence is part of the page description, not a panel "About":
  `describeAccess` reads only the permission matrix and cannot express it, and
  the panel type accepts only generated sentences. No panel is drawn.
- One `Section` "What happened": the unit picker (reuse
  `ViolationUnitPicker` / `useViolationUnitOptions`, unchanged), category
  `<select>`, **severity as a radio group** (Minor default), description with
  counter, photos (same limits: 3 files, 10 MB, JPEG/PNG/WebP/GIF, same
  `uploadEvidencePhoto` flow).
- Footer action bar (a `SectionFooter`) with the one filled primary:
  "Submit report" (resident) / "File report" (staff). Loading words as today.
- Staff mode: unit label "Resident's unit"; the description reads "File a report
  on a resident's behalf. Your name is recorded as the reporter." No separate
  banner.
- Residents (board members included) get a "See your reports" link at the end
  of the description, to `/violations?tab=mine` **(owner)**. In the preview,
  every resident entry point (the sidebar item, the dashboard "Open violations"
  tile, the ⌘K search entry) still goes to this form, and the sidebar's
  Violations item is managers-only (`visibility: 'admin'` cannot express a board
  designation). So this link is how a preview resident reaches Mine. Those entry
  points are repointed when the gate comes off, not in this work.
- Resident with no unit: the same header, and in the main column a
  `SectionFirstRun` "You're not linked to a unit yet" with the current text and a
  "Back to dashboard" outline button. No form.
- Errors: field errors under each field; a server error as the §11.4 callout
  (left rule, icon, leading word, `role="alert"`) above the footer.
- On success: `router.push` to `/violations?tab=mine&reported=<id>`
  (residents) or `/violations?reported=<id>` (staff). No inline success flash on
  the form.

### 5.3 Violations page `/violations` (List with tabs, gated)

Who gets what (server-decided; the client never widens it):

| Viewer | Tabs | Default |
|---|---|---|
| Manager (`isAdmin`) | Review | Review |
| Resident with board designation | Review, Mine | Review |
| Resident, no designation | Mine | Mine |

`?tab=review|mine` selects; a tab the viewer may not have falls back to their
default. Header: title "Violations", icon, description per viewer
("Review, track and close out violation cases." / "Cases on your home and the
reports you've filed."). Header primary: "New violation" on Review for managers
only (as today, `isAdminRole`); "Report a violation" on Mine.

`?reported=<id>` shows one quiet confirmation line at the top of the main
column ("Report #<id> sent to the board.") with a dismiss, then drops the param
with `router.replace`.

**Review tab**

```
Violations                                         [New violation]
Review, track and close out violation cases.
 Review   Mine
--------------------------------------------------------------------
| All 6  Reported 2  Noticed 2  Hearing 1  Resolved 1 | Severity v  | At a glance
|                                          From [  ] to [  ]        |   5
|-------------------------------------------------------------------|   open cases
| (!) Parking · Unit 412                                     Nov 12 |   Waiting for a notice  2
|     Boat trailer in a guest space for three nights.               |   Hearings scheduled    1
|     Reported · Major · Reported Nov 12                            | Needs attention
|-------------------------------------------------------------------|   2 reported cases have
| ...                                                               |   no notice yet. Review
|-------------------------------------------------------------------| Shortcuts
| Showing 20 of 46                                    [Load more]   |   ARC requests
--------------------------------------------------------------------| About
```

- One `Section` of `RecordRow`s inside links to `/violations/[id]?communityId=`.
  Title "Category · Unit"; preview = first line of the description; meta =
  status word, severity, "Reported <date>"; lead = `StatusGlyph`.
- Glyph mapping (author's call): reported → attention; noticed and
  hearing_scheduled → in-progress; fined → overdue; resolved → done;
  dismissed → not-started (dashed, "closed").
- Toolbar: status filters (`QuickFilterTabs` from `@/components/shared`, ink
  selected), each with its count: All, Reported, Noticed, Hearing scheduled,
  Fined (only when `finesEnabled`), Resolved, Dismissed. The sketch's five are
  illustrative. Severity select and the from/to dates on the right.
  *(author's call)* "Open" means reported, noticed, hearing_scheduled or fined;
  resolved and dismissed are closed. "At a glance" counts open cases. The unit
  filter (`?unitId=`, "One unit only · Show all units") is kept.
- Footer: "Showing N of M" and "Load more" in place of Previous/Next.
- Data: today's `listViolations` (`lib/api/violations.ts`) walks every page of
  `/api/v1/violations` and slices, with status, severity, unit and dates
  pushed to the API. Filter counts and the panel figures need every status,
  so they cannot come from a status-filtered call. Requirement: the counts,
  the panel and the list must agree. Suggested (builder's call): one
  status-agnostic walk per unit/severity/date choice, with status filtering
  and counts derived from it in the browser. The walk is already
  client-side and capped at 2000 rows.
- Side panel (`template: 'list'`): At a glance (open cases, waiting for a
  notice, hearings scheduled; meaningful at zero), Needs attention (reported
  cases with no notice, one action that selects the Reported filter; otherwise a
  quiet sentence), Shortcuts (ARC requests, where `hasARC`), About.
- States: loading skeleton rows (`aria-busy`), `SectionError` with Try again,
  no results ("Nothing matches these filters" + "Clear filters"), first run
  (`SectionFirstRun`: "No violation cases yet", with the current explanation).

**Mine tab**

- Two `Section`s: "On your unit" and "Your reports" (the latter with its current
  sub-line about who can open a neighbour's report). Rows as on Review; a "Your
  reports" row about a unit that isn't the viewer's renders without a link (as
  `linkable={false}` does today). "Filed by staff" moves into the meta line.
- Server-rendered from the queries in §3; no panel (§5.8).
- A board member's Mine tab behaves exactly as their lists do on today's report
  page: `residentVisibleViolationsWhere` returns `undefined` for board seats and
  `redactViolationReporter` names the reporter to them, so "On your unit" shows
  every case on their home, including an unreviewed neighbour report, with the
  reporter named. *(author's call: kept unchanged, and pinned by a test as
  intended behaviour, since changing it is a privacy decision outside this
  work.)*
- Both empty: `SectionFirstRun` "Nothing here yet", explaining both lists, with
  "Report a violation". One empty: that section is omitted.
- Resident with no unit: the same first-run as the report page.

## 6. Proof and testing

- Unit: tab-visibility function (manager / board resident / plain resident →
  tabs and default, including a forbidden `?tab=` falling back), glyph mapping,
  report-form validation and the redirect target per mode. A revert-check per
  privacy assertion: the Mine data still passes through the card-field
  projection, and Review data is never loaded for a plain resident.
- Update `violation-pages-reporter.test.tsx` and `report-mode.test.ts` only where
  they pin the old shape, and only in the gated path.
- Axe test for each new view.
- Screenshots at 1280 and 1440, default large text, via the dev preview cookie,
  as managers (`root_sunset`), a board member (`board_member`) and a plain
  resident (`tenant`) on Sunset Condos, attached to the PR.
- Review by the owner: their account is a manager, so on production they see
  the staff report form and the Review tab only. The Mine tab can be reviewed in
  the PR's screenshots, or by adding a resident account's id to
  `DESIGN_PREVIEW_USER_IDS`.

## 7. Left to the builder

- PR split. Suggested: (1) the nav fix alone, ungated, so the owner gets it
  quickly; (2) the report Form page; (3) the `/violations` List with tabs.
- Exact copy within the voice of §11.8, and the Needs-attention wording.
- When the gate is removed (Task 19), point the resident nav item at
  `/violations?tab=mine` and decide its label. Not in this work.

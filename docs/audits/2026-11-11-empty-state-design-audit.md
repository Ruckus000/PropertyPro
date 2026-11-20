# Empty-state design audit — 2026-11-11

Audit of the nine empty-state mockups (directions A Blueprint, B Guided path,
C Labelled example) on the design canvas
<https://claude.ai/artifact/H2DDrAFquaiRAKL6NrNr8N>, and the merged direction
that replaces them. The pattern spec that rolls this out to every other screen
is [`docs/design-system/patterns/empty-states.md`](../design-system/patterns/empty-states.md).

Mockups only. No app code has changed.

## 1. Decisions taken (2026-11-11, product owner)

| Question | Decision |
|---|---|
| How A and B merge | **Steps drive the blueprint.** Illustrated hero + step rail; the current step's blueprint slots are open, later steps collapse to a row with a count; when every step is done the rail shrinks to a chip and the real page takes over. |
| Residents (owners, tenants) | **Calm illustrated state.** Same illustration family, no setup steps or counts, one line on what will appear, plus their one action where they have one. |
| Illustration scope | **Every empty state gets a scene** (~90 surfaces). See §5.1 for how that stays buildable. |
| Features the design may assume | **Only features that ship today.** New features are a separate decision. |
| Direction C (labelled example) | **Retired.** Not chosen, and unsafe on compliance pages (finding C-4). |

## 2. Method

Each board was checked against:

1. **Behavioural goal**: does an empty page make the next action obvious, small, and worth doing (goal-gradient, open-loop/Zeigarnik, endowed progress, Hick's law)?
2. **Truthfulness**: does every number, sentence and control describe the real product, for the community type and role that would see it?
3. **Feasibility**: does every control map to a route that exists in `apps/web/src/app/api/v1/`?
4. **Design system**: `.claude/rules/design.md` and `DESIGN.md`: tokens, radius, elevation, one primary per region, page frame, `PageHeader`.
5. **Accessibility**: WCAG 2.2 AA: contrast (measured, below), non-text contrast, target size, headings, decorative vs informative images.
6. **Legal**: `.claude/rules/florida-compliance.md` and the legal-risk launch gating notes.

Contrast was computed from the token hex values, not eyeballed.

## 3. Findings

Severity: **Critical** = ships something false or legally exposed. **High** = breaks a
design-system rule or fails WCAG AA. **Medium** = inconsistency that will multiply
across ~90 screens. **Low** = polish.

### Critical

**C-1. The Documents blueprint is the wrong list for two of three community types.**
The screenshot that started this work is an **apartment** community (its chips are
the apartment category set from `packages/shared/src/default-document-categories.ts`:
Lease Agreements, Move In/Out Docs, Community Handbook…). Apartments have **no**
statutory checklist: `getComplianceTemplate()` returns `[]` for them. The mockups
draw the condo §718 list (21 items) for everyone, so an apartment manager would be
told Florida requires 21 records it does not require. HOAs have their own 14-item
§720 list.
*Fix:* the blueprint is data-driven: condo → `CONDO_718_CHECKLIST_TEMPLATE` (21),
HOA → `HOA_720_CHECKLIST_TEMPLATE` (14), apartment → the community's own document
categories presented as a **recommended starter set**, with no statute, no
"required", no count against a law.

**C-2. Four controls in the mockups have no feature behind them.**

| Control | Board | Reality |
|---|---|---|
| "Build floor by floor" | A-Units, B-Units | No such builder. Units are added one at a time (`POST /api/v1/units`) or by CSV (`POST /api/v1/import-units`, with dry-run preview). |
| "Try the form / practice report, not saved" | B-Storm | Does not exist. |
| "I have a folder of files", sorted into slots | A-Docs, B-Docs | Matching exists (`record-matching.ts`, `record-auto-link-service.ts`) but is wired to the website records drawer, not to Documents upload. Linking only on exactly one candidate is deliberate; "we sort them for you" overpromises. |
| "Tell residents where to report" (pre-drafted) | A-Storm, B-Storm | Announcements exist; a pre-filled storm draft does not. A plain "New announcement" link is fine. |
| Status track "Reported → Reviewed → Repair scheduled → Closed" | A-Storm, C-Storm | The real statuses are **Logged → Reviewed by management → Archived** (`STORM_DAMAGE_STATUS_LABELS`). There is no repair stage. Reports also carry a category (Roof, Water / flooding, Structural, Exterior / siding, Common area, Other) and a severity (Minor, Moderate, Severe) that the outlines left out. |

*Fix:* the merged boards use CSV import, add one unit, multi-file upload, and a
plain announcement link. Bulk auto-linking on Documents is a candidate feature,
recorded in §7, not drawn as shipped.

**C-3. Storm Damage: the mockups moved legally reviewed notice text.**
A and C collapsed the §626.854 / not-an-insurance-claim notice behind "Read the full
notice" and replaced it with placeholder text. The current copy in
`apps/web/src/lib/constants/storm-disclaimers.ts` is there on purpose (fines,
payments, SMS and notices ship disabled; there is no counsel budget). Collapsing it
is a legal decision, not a design one.
*Fix:* the merged board keeps the **full notice text visible**, unchanged, in a
quiet callout **below** the hero rather than above everything. Only its position
and styling change. Any shortening needs sign-off; recorded in §7.

**C-4. Direction C shows a fake compliance score.**
C-Documents renders "18 of 21 required records posted" as example data. On a
compliance product a screenshot of that is indistinguishable from a real score.
*Fix:* C is retired. Example data is never shown on any page that reports a
compliance status, deadline or count.

### High

**H-1. There is no designed state between "empty" and "full".**
Every board shows zero records. After the **first** upload the page is no longer
empty, the guide vanishes, and the manager lands on the dense library with 20 slots
still unfilled and no path. This is the moment the guide matters most.
*Fix:* the merged pattern defines a **partial** state (§4.3 of the spec): the real
page appears, and the step rail shrinks to a one-line "Continue setup · 4 of 21"
bar that reopens the current step. It disappears only when setup is complete or the
manager dismisses it.

**H-2. Conditional records make "done" unreachable.**
8 of the 21 condo items and 3 of the 14 HOA items are `isConditional` (video
recordings, conflict-of-interest contracts, SIRS for low-rise…). A building that
has no virtual meetings can never reach "21 of 21", which breaks the goal-gradient
the whole design relies on.
*Fix:* conditional slots carry a second action, **"Doesn't apply to us"**, backed by
the existing `compliance_checklist_items.is_applicable` +
`not_applicable_reason` columns. Progress counts *applicable* items. Slots are
labelled "Required" or "If it applies", never by statute paragraph alone.

**H-3. Two filled primary buttons per view region.**
A-Docs shows the toolbar's "Upload Document" and the hero's "Upload the Declaration
first" together; A-Storm shows two primaries in the hero plus one in the header;
B-Storm has a primary on step 1 and another on the footer. `design.md`: one filled
primary per region.
*Fix:* while a page is empty, the toolbar's primary is hidden (the hero owns the
action). One primary per region: the current step's action. Everything else is
`outline` or `link`.

**H-4. Measured contrast failures.**

| Pair | Where | Ratio | AA |
|---|---|---|---|
| gray-500 `#6B7280` on sand-100 `#F6EFE6` | "+" chips, eyebrow labels | 4.24 | fails text |
| gray-500 on coral-50 `#FCF1ED` | small labels in the current step | 4.36 | fails text |
| gray-500 on teal-50 `#ECF6F4` | captions in teal hero | 4.39 | fails text |
| coral-600 `#C2533A` on coral-50 | "Start here" accents | 4.13 | fails text |
| sand-300 `#E3D8C9` dashed border on card | every blueprint slot | 1.40 | fails 1.4.11 if it is the only cue |

Passing pairs used: white on coral-600 4.57, coral-700 on coral-50 5.48, teal-700
on teal-50 7.24, green-700 on green-50 5.21, amber-700 on amber-50 4.84,
gray-600 on sand-100 6.62.
*Fix:* any text on a tinted surface uses `--text-secondary` (gray-600) or the
surface's own `-700` ink, never gray-500. Accent text is coral-700, not coral-600.
The dashed border stays decorative; each slot carries a visible "Add" label so the
control is identified by text (the token layer has no 3:1 chrome neutral; see the
token-layer limitation note).

**H-5. Illustrations use raw hex.**
All scenes are drawn with literal hex fills. In `apps/*/src` that fails
`guard:design-tokens` and can't follow a community's theme.
*Fix:* illustrations become React components in `packages/ui` that paint with
`var(--…)` palette tokens only (§5 of the spec).

**H-6. Sizes are px; the signed-in app is rem with a fluid root.**
Every mockup measurement is px, but the app root scales 16→20px between 1024 and
1856px wide. Illustrations and copy blocks drawn in px will shrink relative to
text on large screens.
*Fix:* implement on the rem scale; illustration art boxes in rem with the SVG
`viewBox` scaling inside.

**H-7. Units: four "Not set up" KPI cards are repeated noise.**
A-Units replaced the lying zeros with four identical "Not set up" cards. Honest,
but it still dedicates a full row to nothing.
*Fix:* hide the KPI row until the first unit exists. Show the four tiles once, as
labelled silhouettes inside the context column's "Your page, once it's running"
preview, with no numbers and no "Not set up" text (revised 2026-11-11, see M-10).

**H-8. Residents have no designed state at all.**
Owners and tenants see Documents, Storm Damage (their own reports only:
`storm-damage/route.ts` filters `reportedBy` for non-admins), Announcements,
Meetings and more. Every board is manager-only.
*Fix:* the resident variant (§4.4 of the spec).

### Medium

**M-1. Inconsistent sizes across the nine boards.** Hero titles 22, 26 and 28px;
card radii 8, 10, 12 and 16px; eyebrows in three colours. `design.md`: cards are
radius md (8px), radius lg (12px) is for modals only. *Fix:* one hero type scale and
radius md everywhere (spec §6).

**M-2. Elevation misuse.** The first A-Units version floated a shadowed card over
the page (an overlay elevation on page content), plus a gradient scrim. *Fix:* flat
cards (E0); no scrims.

**M-3. Copy voice drifts.** "21 records, one drawer. Let's fill it.", "When the
wind dies down…", "Put your building on the map", and legal-register paragraphs
side by side. *Fix:* the title states the outcome, the body says why and what will
appear here, the CTA is verb-first (spec §7). Wit is fine in a title, never in a
legal or deadline line.

**M-4. Storm imagery that worries people.** A-Storm's hero draws a broken window
and rain over the building. For a homeowner after a hurricane that reads as alarm,
not readiness. *Fix:* calm scenes (clear sky, intact building); damage is never
illustrated.

**M-5. Hero scenes announced to screen readers.** Several scenes have
`role="img"` with long labels. They are decorative; the heading and body already
say everything. *Fix:* `aria-hidden="true"` by default; an illustration is labelled
only when it carries information (a progress ring does, and its text sits beside
it).

**M-6. Heading levels.** `PageHeader` renders the page `<h1>` (sr-only). The hero
title must be `<h2>`, step titles `<h3>`. The B boards jump straight to `<h3>`
inside steps in places. *Fix:* fixed in the spec's anatomy.

**M-7. Phone width.** Heroes are side-by-side text + art that stack at 375px with
the art first, pushing the action below the fold. *Fix:* below `md` the art moves
below the text and drops to the Section size; the action stays in the first
viewport.

**M-8. Status shown with colour alone.** C-Units' status pills are colour + text
with no icon. `design.md` requires icon + text + colour. (C is retired; the rule
applies to step states in the merged design: done / current / upcoming each get
an icon.)

**M-9. "No results" is treated like "empty".** Today's Documents screen says
"Nothing matches those filters" when there is simply no data. These are different
states. *Fix:* the spec separates **empty** (nothing exists) from **no results**
(filters hide existing rows) and **all clear** (nothing needs attention, a good
outcome).

**M-10. The first merged boards read as sparse.** (Product-owner review, 2026-11-11.)
A single centred column, a small hero illustration and a two-option step left
large unused areas at 1280px and wider, so the page still looked unfinished. The
cause was a lack of information, not of decoration: the step said "import a
spreadsheet" without showing the spreadsheet.
*Fix:* a two-column body (main ≈2/3, context ≈1/3) and a hero split 60/40 with
larger art. Every added block is real product information: fact chips (defaults,
limits), the real format of what the step needs (the unit CSV's columns and
template rows; the record names; the six report fields), later steps showing
their items, a silhouette of the populated page, who sees what, and links to
existing help articles. Rules in spec §4.1.

**M-11. Spacing off the scale.** (Spacing review, 2026-11-11.) Measured with a
static lint over the merged boards: each used 12–14 distinct padding/margin/gap
values, including 2, 3, 6, 7, 9, 10, 14, 18 and 28, none of which are tokens
(`packages/tokens/src/static.ts`: 4, 8, 12, 16, 20, 24, 32, 48…). Left edges
disagreed too: hero text at 28px, rail markers at 32, main and context at 20.
*Fix:* one 24px inset for every band and a seven-value rhythm where distance
encodes relationship (spec §6.0). Rebuilt boards use exactly 4, 8, 12, 16, 24, 32 (48 on the redlines board).

**M-12. Text drawn at standard size, not the large-text default.** The boards
drew body text at 14–15px and used up to nine sizes per page (10–30px), with
labels at 10 and 11px. Large text is on by default, so `text-sm` renders 16px and
`text-xs` 14px; anything drawn smaller can't exist in the product, and spacing
judged at the smaller size reads tighter in reality. *Fix:* five rendered sizes
(28 / 20 / 18 / 16 / 14), 14 as the floor (spec §6.1).

**M-13. Boxes inside boxes.** The context column was a tinted band inside the
setup card, holding its own cards (three container levels), and every icon tile
carried a different tint. *Fix:* one container level. The context column holds
headed sections and hairline rows; icon tiles are neutral, and colour is kept for
meaning (spec §6.2, "neutral chrome, one accent").

### Accessibility (spacing review, 2026-11-11)

**A-1. The step rail couldn't be operated.** It was a static `<ol>` of text.
*Fix:* `<nav aria-label="Setup steps">` with a `<button>` per step,
`aria-current="step"`, hidden status text, and `aria-disabled` with a reason for a
dependency.

**A-2. Collapsed steps weren't focusable.** They were `<div>`s with a ▸.
*Fix:* disclosure buttons with `aria-expanded` and `aria-controls`.

**A-3. Context headings were styled paragraphs.** Screen-reader heading
navigation skipped "Help", "Who sees what" and the preview. *Fix:* `h3` inside
`<section aria-labelledby>`.

**A-4. Meaning carried by border style alone.** "Dotted chip = only if it
applies" (WCAG 1.3.3). *Fix:* a visible "If it applies:" text label before those
chips; the dashed border is now a secondary cue.

**A-5. A scrolling region keyboard users couldn't reach.** The CSV preview
scrolls sideways and had no focus stop. *Fix:* `role="region"`, `aria-label`,
`tabindex="0"`.

Also fixed in the same pass: slot buttons announced their tag, title and "Add file"
as one run-on name (now `aria-label="Add file: <record>"` with the tag via
`aria-describedby`); decorative SVGs inside buttons weren't `aria-hidden`; buttons
had fixed heights that clip under WCAG 1.4.12 text spacing; no focus state was
designed (now drawn on the redlines board).

### Resident pages: product gaps found while designing them (2026-11-11)

Facts from the code, each verified with a file reference during research. These are bugs or
gaps in shipped behaviour, not design opinions; each needs its own fix.

| # | Gap | Where | Fix |
|---|---|---|---|
| R-1 | Maintenance statuses `acknowledged` and `resolved` render as "Neutral" on web (no `StatusBadge` entry; fallback). Mobile labels them correctly. | `packages/ui/src/constants/status.ts:22-63` | Add both keys |
| R-2 | Category "HVAC" displays as "Hvac". | `components/maintenance/SubmitForm.tsx` | Fix the label |
| R-3 | Packages: a failed load (e.g. 403 for a resident with no unit) shows "No pending packages", which hides the error. | `components/packages/PackageResidentView.tsx:73-101` | Handle `isError` with `AlertBanner` + Retry |
| R-4 | Payments: tenants and owners with no linked unit get "We couldn't load your payment data", an error, for an expected state. The resident path also has no `PageHeader`. | `components/finance/payment-portal.tsx:272-288`; `communities/[id]/payments/page.tsx` | "Not linked to a unit yet" waiting state (board R-Payments); add the header |
| R-5 | ARC is not in the resident sidebar (`visibility: 'admin'`); residents reach it only through ⌘K, although the API lets owners and tenants submit. | `components/layout/nav-config.ts:316-324` | Add a resident nav item for condo/HOA |
| R-6 | `/maintenance/submit` (the dashboard's "Ask for a repair") redirects to Operations without opening the form: `create` is not on the redirect allowlist. | `lib/operations/routes.ts:24` | Pass through and auto-open the sheet |
| R-7 | Package, violation and ARC emails obey the **meeting** email toggle (`emailMeetings`), so turning off meeting emails silently stops package notices. | `lib/services/notification-service.ts:177-184`; `lib/utils/email-preferences.ts:98-108` | Own toggle, or say so in settings |
| R-8 | Dead code: `DashboardViolations` and `DashboardMeetings` are imported nowhere; `no_esign_pending` can never render (card mounts only when > 0); presets `no_maintenance_requests` and the page use of `no_announcements_yet` are unused. | `components/dashboard/*`; `app/(authenticated)/dashboard/page.tsx:328` | Delete or wire up |

**Status (2026-11-20):** R-1 to R-7 are fixed and live, shipped in
[#1465](https://github.com/Ruckus000/PropertyPro/pull/1465) (`2acdd9a16`). R-7 was fixed without
a schema change: resident notices follow email frequency, not a toggle of their own. R-8 is still
open.

### First-run manager pages: product gaps (2026-11-11)

Facts from the code (research cited file:line). Paths are under `apps/web/src/`.

| # | Gap | Where |
|---|---|---|
| F-1 | **Residents before units is a dead end.** The Residents empty state offers "Add resident", but every resident (and household member) needs a unit; with 0 units the unit select shows a disabled "Add a unit before adding residents" with no link. CSV rows fail too. | `components/residents/resident-form.tsx:255-278`; `components/directory/directory-page-client.tsx:900-922` |
| F-2 | Units empty state offers only "Add unit"; CSV import is hidden in the "…" menu. | `directory-page-client.tsx:676-682, 769-790` |
| F-3 | Header primary buttons ("Add resident", "Add unit") disappear when the list is empty, while help says "Add Resident" is at the top right. | `directory-page-client.tsx:600-602`; `content/help/manager/residents/invite-residents.mdx:19` |
| F-4 | The overview strip renders on an empty community ("0 / 0 units occupied", "—"); units with occupancy "Not set" count as occupied. | `directory-page-client.tsx:608-627`; `directory-model.ts:489-497` |
| F-5 | Join requests on a new community say "All join requests have been reviewed." | `components/join-requests/admin-review-list.tsx:57-61` |
| F-6 | Compliance on day zero fires "Requirements are now in effect · N need attention" because board-action records count as attention immediately; KPI cards show 0%. | `components/compliance/compliance-command-center.tsx:211-229`; `lib/utils/compliance-calculator.ts:124-152` |
| F-7 | Compliance "Getting Started" panel: HOA priority keys `720_declaration` / `720_bylaws` don't exist (HOAs get one step); `completedCount` is always 0; dismissal isn't per community. | `components/compliance/compliance-onboarding.tsx:10-86` |
| F-8 | The Compliance page has no "doesn't apply" control (only "Mark applicable"); the reason dialog exists only on the website records surface, and two help articles say to contact support. | `lib/utils/compliance-cta.ts:29-31`; `components/website-home/records/not-applicable-dialog.tsx` |
| F-9 | `review_compliance` onboarding step completes just by loading the page. | `app/api/v1/compliance/route.ts:79-84` |
| F-10 | `compliance_empty` is unreachable for new communities, its copy says categories are "mapped" while showing none, and nothing calls `POST /api/v1/compliance` to generate. | `compliance-command-center.tsx:247-260` |
| F-11 | Meetings calendar shows the set-up nudge ("Schedule and track board meetings") in any empty month, not only on first run. | `components/meetings/meetings-page-shell.tsx:110-114, 201-213` |
| F-12 | Meeting attachments: the API's `attach` action has no UI. | `app/api/v1/meetings/route.ts:97-108`; `components/calendar/meeting-detail-modal.tsx:213-217` |
| F-13 | Announcements offers "Owners only" and "Board members only" to apartments (`hasOwnerRole: false`); emergency alerts offer "Owners only" too. A `?q=` search with no hits says "No announcements yet". | `components/announcements/announcement-composer.tsx:204-216`; `announcement-list.tsx:265-276` |
| F-14 | Emergency alerts have no sidebar entry. | `components/layout/nav-config.ts` (`NAV_SECTIONS`) |
| F-15 | The two community-creation paths disagree: the PM path omits `isSystem` on default categories and sets only `emailFrequency` in notification preferences. | `lib/pm/create-community.ts:75-90` vs `lib/services/provisioning-service.ts:480-524` |

**Status (2026-11-20):** shipped in
[#1466](https://github.com/Ruckus000/PropertyPro/pull/1466) (`48748cd55`) and live:
- Fixed: F-5, F-7, F-9, F-13 and F-15.
- Help articles corrected: the help-text halves of F-3 and F-8.
- Held for the redesign, on purpose: F-6 (the day-zero banner) and F-14 (no Emergency nav item).
- Still open: F-1, F-2, the UI half of F-3, F-4, the in-page control of F-8, F-10, F-11 and F-12.

### Low

- **L-1.** Unit numbers drawn in the building scene (301, 302…) look like data.
  Keep windows unlabelled except the one being added.
- **L-2.** "About a minute" and "ten minutes" are unmeasured claims. Drop them or
  measure them.
- **L-3.** The "Change" link inside the renewal-alerts tab is an inline target under
  24px tall. Give it its own row or a full-size link.
- **L-4.** "§718.111(12)(g)(2)(b)"-style labels on every slot add noise. Show the
  statute once in the hero; slots say Required / If it applies.

## 4. Board scorecard

1 = poor, 5 = strong. Scored against the criteria in §2.

| Board | Next step obvious | Truthful | Feasible | System fit | A11y | Pull |
|---|---|---|---|---|---|---|
| A · Documents | 5 | 2 (C-1) | 3 | 3 | 3 | 5 |
| A · Units | 4 | 4 | 2 (C-2) | 3 | 3 | 5 |
| A · Storm | 4 | 3 (C-3) | 3 | 3 | 3 | 4 |
| B · Documents | 5 | 2 (C-1) | 3 | 4 | 3 | 4 |
| B · Units | 5 | 5 | 2 (C-2) | 4 | 3 | 4 |
| B · Storm | 4 | 3 | 2 (C-2) | 4 | 3 | 4 |
| C · Documents | 3 | 1 (C-4) | 4 | 3 | 3 | 3 |
| C · Units | 3 | 3 | 4 | 3 | 3 | 3 |
| C · Storm | 3 | 3 | 4 | 3 | 3 | 3 |

What A does best: the slots *are* the requirement, so the page explains itself.
What B does best: one action at a time, and pre-done work counted as progress.
The merge keeps both and fixes the shared failures (C-1, C-2, H-1 to H-4).

## 5. The merged direction: "Guided blueprint"

Defined in full in the pattern spec. In one paragraph: an empty page opens on an
illustrated hero that names the outcome and shows progress; under it a step rail
of at most five steps, where steps the system already completed are checked; the
current step is expanded into its blueprint slots (each slot a real add action);
later steps are collapsed rows with counts; controls that act on data are hidden
until data exists. After the first item the page becomes the real page with a slim
"Continue setup" bar, until setup is done or dismissed. Residents get the same
illustration family in a calm state with no steps.

### 5.1 Making "a scene on every empty state" buildable

Ninety bespoke drawings would drift and rot. Instead:

- **One kit, many compositions.** A fixed set of parts (ground band, sun, clouds,
  palm, low-rise building, door, window, and a prop shelf: folder, drawer,
  clipboard, camera, calendar, coins, megaphone, key, bell, shield, wrench, pool
  ladder, package…) composed per screen. A new screen is a new arrangement of
  existing parts plus at most one new prop.
- **Three sizes, one scene.** Each composition renders at Hero (page), Section
  (tab or panel) or Compact (card, widget, table body). Compact keeps the prop and
  drops the landscape. A 300px dashboard widget still gets its scene, at the size
  it can hold.
- **Illustrations live only in empty and all-clear states.** `README.md` describes
  PropertyPro as "a production compliance system, not a marketing site", with clear
  hierarchy and no visual noise. Restricting scenes to states with no data keeps
  that true of every working screen.

### 5.2 The merged boards, and what is still new UI

Seven boards in the canvas row "Merged · Guided blueprint": Documents for a condo
(setup), the same page after step 1 (partial), Documents for an apartment (starter
set), Leases & units, Storm damage for a manager, Storm damage for a resident, and a
system sheet (states, sizes, kit, colour roles). They use only shipped *features*.
These pieces are new *interface* over existing data, and must be built:

| Piece | Board | Built on |
|---|---|---|
| Step rail, slots, "Continue setup" bar | all setup boards | checklist items (`compliance_checklist_items`), document categories, units |
| "Fills" column linking a file to its checklist record | Documents partial | existing record links from `record-auto-link-service` |
| "Doesn't apply to us" on conditional slots | Documents condo/HOA | `is_applicable` + `not_applicable_reason` |
| Choosing a slot per file when several are uploaded together | Documents condo | existing upload queue (`document-upload-queue.tsx`) |
| "8 folders ready" shown as a completed step | Documents apartment | categories provisioned at community creation |

The merged mockups are still drawn in px with literal hex (canvas limitation).
H-5 and H-6 apply at implementation, not to the mockups.

## 6. Accessibility checklist for the merged boards

- [ ] Hero art `aria-hidden`; hero title `<h2>`; step titles `<h3>`
- [ ] Step state = icon + text + colour (done ✓ / current ● / upcoming ○)
- [ ] Step rail is an ordered list; the current step has `aria-current="step"`
- [ ] Every slot is a real `<button>` (or a file `<label>`), named "Add Bylaws & Amendments"
- [ ] Conditional slots expose "Doesn't apply to us" as a second button, not a hidden menu
- [ ] Text on tinted surfaces uses `-700` inks or `--text-secondary` (H-4)
- [ ] Targets 44px below `md`, 32px floor above
- [ ] Progress ring has adjacent text ("4 of 21 posted"), so the ring itself can be `aria-hidden`
- [ ] Any future motion respects `prefers-reduced-motion`

## 7. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| O-1 | Any shortening of the storm-damage notice | Product + whoever signs off legal copy | Only the shortening; the merged design keeps it whole |
| O-2 | Bulk upload that auto-links to checklist slots on Documents | Product | Nothing; drawn as normal multi-file upload |
| O-3 | Illustration kit build (~25 parts, ~90 compositions) | Design/eng | Rollout pace, not the pattern |
| O-4 | Whether "Doesn't apply to us" needs a reason prompt on the empty page (the column allows NULL) | Product | Nothing |
| O-5 | Floor-by-floor unit builder | Product | Nothing; not drawn |

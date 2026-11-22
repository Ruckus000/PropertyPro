# Page anatomy: one shape for every signed-in page

Date: 2026-11-21
Status: awaiting approval. **Section 13 (study rulings) supersedes any earlier section it conflicts with.** Sections 1 to 12 are the record of how the design was reached and contain superseded statements.
Scope: `apps/web`. The signed-in app, its shell, overlays, first-run screens, the help center, and the routes outside the shell listed in 5.21. See 13.2 for the workstreams.
Mockups, both in this folder (open in a browser):
- `2026-11-21-page-anatomy-mockups.html`: the three directions; the tabs "B revised · Alerts" and "B revised · Packages" are the approved direction.
- `2026-11-21-page-anatomy-every-page.html`: all 96 signed-in routes drawn in that shape from the real code, with a "Refined look / Structure only" switch (section 6) and an honest note on each page that fits badly.

Lines marked **(owner)** are decisions the product owner made in conversation.
Lines marked **(call)** are the author's choices and can be overruled.

## 0. The design direction

**(owner)** asked for a specific design direction for the platform, so that
this problem does not come back, and for no part of the app to sit outside it.

**A calm record book where time is always visible.** The signed-in app is
mostly quiet: sand, ink and hairlines. Four things are allowed to stand out
(section 6.2), each with a rule for where it may appear. Six rules decide
everything else:

1. **Time is the product.** If a record has a deadline, show the time-left
   chip. Never a bare date.
2. **Quiet until it matters.** Coral means one thing: the action to take.
   Other colour is for status and time only.
3. **One page, one shape.** Header, main column, context. Every page picks a
   template. There are no exceptions.
4. **Say something true first.** Every page opens with a figure or fact that is
   useful before the first record exists.
5. **Fewer boxes.** Type and hairlines carry the hierarchy. Never a card inside
   a card.
6. **Icons name, glyphs tell.** An icon says what kind of thing this is. A
   glyph says what state it is in.

The first page of the every-page mockup ("Design direction") shows these with
live specimens, the icon registry, and a seven-question check for any new page.
When built, this section becomes the opening of `DESIGN.md` and
`.claude/rules/design.md`, replacing guidance it contradicts.

## 1. Intent

The owner's complaint, in their words: pages "feel weak", Emergency Alerts and
Packages "look like empty husks", Settings "feels dull", the design "doesn't feel
cohesive and modern", and "I don't want future pages to suffer from the same
issue". They want the feel of Stripe, Atlassian, Geist and Apple.

The cause is structural. The tokens already follow Geist values. What is missing
is a shared idea of what a page is made of:

- Pages paint no title or description (hidden since 2026-09-02), so a page opens
  straight onto a table.
- A page is only its one piece of data. Packages uses the shared filter tabs and
  data table and still looks empty, because those are the whole page.
- Most sections are hand-built. Measured 2026-11-21 in `apps/web/src`: 34 files
  import `Card`; about 540 lines build a bordered box by hand; `h2`/`h3` carry 59
  distinct class strings; five radii and four paddings are in regular use;
  26 files hand-build a table against 7 that use `DataTable`; 9 files use `PageBody`.
- The one well-structured kit (`components/settings/settings-layout.tsx`:
  section, card, row, footer) is private to Settings.

## 2. Goals, non-goals, anti-goals

Goals

1. Every signed-in page is built from one of four templates, so pages look and
   behave alike.
2. A page has shape and something useful to say before its first record exists.
3. A new page cannot ship without a template. A guard enforces it.
4. Sections come from one kit, so radius, padding, headings and borders stop
   drifting.

Non-goals

- Admin console, `/mobile`, the public association site, marketing pages, emails.
- New colours, a dark theme, or changes to token values.
- Replacing the existing first-run "guided blueprint" empty states
  (`EmptyState` sizes `hero`/`section`/`compact`, `components/shared/setup-guide`).
  They stay and sit inside the new layout.
- Changing what the bespoke surfaces *do*. **(owner)** No page is exempt from
  the design: the dashboards, compliance centre, calendar, document editor,
  reports, website overview, community picker, welcome and outcome pages are
  all drawn in it (section 5.15). Their behaviour is unchanged.

Anti-goals (a result that technically works but fails)

- A side panel filled with filler so that it is never empty. Every item in it
  must be true and useful, or the slot is left out.
- Each feature inventing its own side panel content. That recreates the
  inconsistency in a new place.
- A big-bang rewrite that touches 96 pages in one change.

## 3. Constraints

- Design rules in `.claude/rules/design.md` hold: semantic tokens only, flat
  cards, one filled primary button per region, 44px controls below `md`, status
  shown as icon + text + colour.
- The page gutter stays single-sourced in `PageContainer`. Templates add no
  horizontal padding.
- The signed-in app scales with the screen (fluid root). All new sizes are on
  the rem scale; no arbitrary pixel values.
- `packages/ui` must stay import-time pure and has no `next` dependency.
- `perf-check` is a required check. No migrated route may exceed its existing
  budget. Kit parts are imported by file path, not through the package barrel
  (the barrel is what pushed `/settings` over budget before).
- Guards follow the shape in `.claude/rules/verification.md` (tri-state exit,
  non-zero population, shrink-only baseline).
- Existing guards keep working: `guard:page-header`, `guard:breadcrumbs`,
  `guard:page-padding`, `guard:design-tokens`, `guard:class-resolution`.

## 4. Approaches considered

All three were mocked on Emergency Alerts with filled and empty states.

| | A · Structured | B · Workspace | C · Open |
|---|---|---|---|
| Shape | Title, summary band, one section with toolbar and footer | Title, records in a main column, a standing side panel | Large title, figures on the page, hairline rows, few boxes |
| Empty pages | Fixed by header and band | Fixed by the side panel | Only partly fixed |
| Cost | Lowest; easiest to guard | Most content per page; width pressure on laptops | Hardest to keep consistent; weak for dense tables |

**(owner)** B was chosen as closest to what they want. The author recommended A.
**(owner)** B was then audited and the revised version approved. The revision
fixed eight weaknesses: no description; filters missing and search misplaced;
four equal-weight boxes; free-form panel content; the key exception buried;
severity shown twice and a loud figure on every row; a bare empty state; the
panel buried under the list on phones.

## 5. The design

### 5.1 Anatomy of a page

Every templated page has the same three regions in the same order.

```
Breadcrumb trail (shell, unchanged)
+--------------------------------------------------------------+
| Title                                        [Secondary] [Primary] |
| One-line description                                          |
+----------------------------------------+---------------------+
| MAIN                                   | SIDE PANEL          |
| Section                                | At a glance         |
|   toolbar: filters ........ search     | Needs attention     |
|   records (rows or table)              | Shortcuts           |
|   footer: count, note                  | About               |
+----------------------------------------+---------------------+
```

1. **Header.** A visible title and a one-line description, with actions at the
   right: at most one filled primary and one outline secondary.
2. **Main column.** One or more sections from the section kit.
3. **Side panel.** One panel, hairline-divided groups, fixed slots.

### 5.2 Page titles are painted again

**(owner, via approving revised B)** `PageHeader` paints its `<h1>` and its
`description`. This reverses the 2026-09-02 decision.

- `PageHeader` stays the only owner of the `<h1>`, so the logic of
  `guard:page-header` and `guard:breadcrumbs` does not change. Their written
  rationale does: the docblocks in `scripts/verify-page-header-usage.ts` and
  `page-header.tsx` describe an unpainted title and are rewritten, and the two
  standing exemptions (`payments/success`, `select-community`) are re-justified.
- `PageHeader` keeps its current API (`children` as a left slot, `actions` at
  the right). The phase 1 repaint only makes the title and description visible.
  Filters move from the header into `SectionToolbar` when a page is migrated,
  not before. A non-button item such as a status badge sits beside the title.
- The existing header Help button stays where it is.
- **(call)** Title size `text-xl font-semibold`; description `text-sm
  text-content-secondary`, one sentence, at most about 90 characters.
- **(call)** The breadcrumb trail is left exactly as it is, as shown in the
  approved mockup ("Sunset Condos / Emergency Alerts" above the title). The
  page name therefore appears twice, small in the trail and large in the
  header. Trimming the trail is a possible later change, not part of this work.
- `description` becomes required for templated pages. Many call sites pass none
  today, so each migrated page needs one written.
- `.claude/rules/design.md` ("PageHeader does not paint its title") and its
  `CLAUDE.md` mention are updated in the same change.

### 5.3 Side panel slots

Four slots, always in this order. A page may omit a slot. It may not add a
fifth, reorder them, or rename them.

| Slot | Holds | Rule |
|---|---|---|
| At a glance | One headline figure with its unit, then up to three label/value lines | Required on list pages. The figure must be meaningful with zero records (for example "142 of 147 residents reachable"). |
| Needs attention | Exceptions the viewer can act on, each with one action link | Warning style with icon. When there are none, one quiet sentence saying what would appear here. Never invented. |
| Shortcuts | Up to four plain links to related actions or templates | No buttons, no boxes. The page's primary action is never repeated here. |
| About | One or two sentences on who can do what | Static text only. **(call)** The "How this works" link in the mockup is dropped: the header Help button already does that job, and a per-page article lookup does not exist on the server. |

- **(call)** Panel width 17.5rem (280px at a 16px root).
- **(call)** The panel is role-aware. A viewer who would get no slot content
  (for example a resident on "My Packages") gets no panel, and the main column
  takes `PageBody width="content"`.
- **(call)** Panel content comes from wherever the page already gets its
  records. `SidePanel` and its slots take plain data and do no fetching.
  - A server-rendered page (for example `emergency/page.tsx`) queries on the
    server and wraps the slots in `Suspense` with a skeleton.
  - A page that already loads in the browser with React Query (for example
    `PackageStaffView`, `emergency/[id]`) feeds the panel from the same query
    or a sibling hook on the same query key family, so the figures cannot
    disagree with the list after a mutation. Such pages are not converted to
    server components as part of this work.
  - Either way the main column never waits on the panel, and no generic
    "panel API" is introduced.

### 5.4 Responsive behaviour

Layout follows the width of the content box, not the screen, using the existing
`cq` container-query vocabulary (`cq-lg` = 960px of the box).

- Content box 960px or wider: main and panel side by side.
- Narrower: "At a glance" and "Needs attention" render above the main column;
  "Shortcuts" and "About" render below it.
- Touch heights stay on the viewport `md:` breakpoint, as today.

### 5.5 Section kit

The Settings kit is promoted to the shared kit and Settings is moved onto it.

| Part | From | Purpose |
|---|---|---|
| `Section` | `SettingsCard` | Bordered container, `rounded-md`, flat, `overflow-hidden` |
| `SectionGroup` | `SettingsSection` | A titled group of several sections on one page (Settings is the main user) |
| `SectionHeader` | `SettingsCardHeader` | Title, optional description, optional action |
| `SectionToolbar` | new | Filters on the left, search on the right; wraps |
| `SectionRow` / `SectionLinkRow` | `SettingsRow` / `SettingsLinkRow` | Label, description, control |
| `SectionFooter` | `SettingsCardFooter` | Count or note on the left, actions on the right |
| `RecordRow` | new | Rich row: status icon tile, title, one-line preview, meta line, right-hand outcome |
| `SidePanel` / `SidePanelSlot` | new | The panel in 5.3; `slot` is a closed union of the four names |
| `PageLayout` | new | Places header, main and panel; owns the 5.4 behaviour |

- **(call)** The kit lives in `packages/ui/src/components/shared/`, with web
  re-export shims in `apps/web/src/components/shared/`, matching how
  `EmptyState` and `KpiCard` were lifted. Admin may adopt it later; that is not
  part of this work.
- **(call)** Section inner padding is 16px horizontal throughout (the Settings
  kit uses 20px today; it moves to 16 to match `Card`).
- `SectionLinkRow` needs `next/link`, which `packages/ui` does not have, so it
  gets a thin web wrapper the way `KpiCard` does.
- Rows that switch layout by width do so on `cq-*`, not the viewport
  (`SettingsRow` uses `lg:` today and changes when it is lifted).
- Heading styles reduce to four, used everywhere inside templates:
  page title (`text-xl font-semibold`), group title (`text-lg font-semibold`,
  only where a page groups several sections), section title (`text-base
  font-semibold`), label (`text-xs font-medium text-content-tertiary`).
- No shadow on anything at rest.

### 5.6 Rows or table

One rule per page, decided by the records:

- **Rich rows** (`RecordRow`) for narrative records, where each item is mostly
  a title and text: alerts, announcements, violations, maintenance requests,
  forum threads.
- **Table** (`DataTable` inside a `Section`) for tabular records, where each
  item is mostly columns: packages, ledger, residents, units, visitors.

Either way the toolbar, footer and panel are identical. Hand-built `<table>`
markup moves to `DataTable` when its page is migrated.

Row emphasis rule: an outcome stands out only when something went wrong
("5 not reached" in warning style). A fully successful outcome is quiet text
with a check icon.

### 5.7 Empty states

- Header and side panel render exactly as they do with data.
- Where a first-run "guided blueprint" hero already exists for the page, it is
  the main column's content, unchanged.
- Elsewhere the main section shows: a short title, one sentence, the primary
  action, and beneath it one **example record** in a dashed frame labelled
  "Example of a …", rendered with the real row or table component.
- Filtered-to-nothing is different from first-run: it shows "No results" with a
  "Clear filters" action and no example.

### 5.8 The four templates

| Template | Routes | Main column | Side panel |
|---|---|---|---|
| List | section landing pages | One section: toolbar, records, footer | 5.3 slots |
| Detail | `**/[param]/page.tsx` | The record's content in sections | Details (key/value properties: status, dates, people), Needs attention, Related, About |
| Form | `**/new`, `**/[param]/edit` | Form sections at `form` width, with a footer action bar | A live summary or preview where one exists (for example the SMS preview and audience reach on a new alert), then About |
| Settings | `settings/**` | Existing left nav plus sections from the shared kit | None by default; the left nav is the side column |

- **(call)** The detail panel uses "Details" and "Related" in place of
  "At a glance" and "Shortcuts". Same positions, same rules; the names fit a
  single record better.
- **(call)** Settings keeps its two-column nav layout. Its "dull" look is
  addressed by the painted header, the shared kit and the heading scale. If the
  owner still finds it dull after the pilot, Settings gets its own mockup round
  before more is built.

### 5.9 Fit test, and what it added

**(owner)** asked whether the plan was comprehensive enough and for a mockup
of every page. All 96 routes were described from the real code and drawn.

| | Count |
|---|---|
| Routes | 96 |
| Redirect only | 29 |
| Bespoke, keep their own layout | 12 |
| Drawn in the shape | 55 (27 list, 9 detail, 11 form, 8 settings) |
| List pages with a true headline figure | 20 of 27 |
| List pages with a real attention item | 14 of 27 |

The shape as first written held for simple pages and broke in five places.
Sections 5.10 to 5.14 close them. **(owner)** approved extending the design
with these.

### 5.10 Page tabs

Nine routes are tabbed today (Operations, Directory, Visitors, Payments,
E-sign, the three Board pages, Documents).

- Tabs sit directly under the header, above the main column and side panel.
  Underline style; the selected tab carries the accent underline; a tab may
  show a count.
- Each tab supplies its own main sections and its own primary action. The
  header's primary button changes with the tab.
- The side panel belongs to the page, not the tab, unless a tab has its own
  true headline figure; then "At a glance" may change per tab.
- The selected tab is in the URL (as the pages do today), so it survives reload
  and can be linked.
- Tabs are for peer sets of records. A different *view* of the same records
  (Documents: List, Board, Timeline) is a view switch at the right of the
  section toolbar, not page tabs. **(call)**

### 5.11 Step flows

The form template gains a steps variant for the e-sign send and template
builders and the resident import.

- A numbered step strip under the header (the order is real, so numbers are
  justified): done, current, upcoming.
- One step's sections in the main column at a time. Back and Next in the
  footer action bar; the header carries only Cancel.
- A step that is a canvas (placing fields on a PDF) takes the full main
  column. The side panel then holds the field palette or, if nothing true
  belongs there, is omitted for that step.

### 5.12 Card records

A third record presentation beside rows and tables, for records that carry
their own controls or a progress state: polls, elections, move-in checklists,
storm-damage reports, reserve components.

- A grid of cards inside a section, same toolbar and footer as any list.
- Card anatomy, fixed: status badge, title, up to two lines of text, a meta
  line, then a footer with the outcome on the left and the action on the
  right.
- Use only when a row cannot hold the control. Default remains rows or table.

### 5.13 Preview beside details

An e-sign submission is a document preview next to signer cards. This is the
detail template: the preview is the main column, and signers, status and
timeline are the side panel's Details and Related. No new template.

### 5.14 One route, two audiences

Payments, architectural requests, visitors and violations draw a different
page for residents than for managers. Each audience's page is designed and
migrated as its own page, chooses its own template, and may have no side
panel. The guard checks the file, so both branches must use `PageLayout`.

### 5.15 No exemptions: the canvas and focus templates

**(owner)** "I don't want any sections to detract from the design." The twelve
pages first set aside as bespoke are now in the system, through two more
templates and eight section kinds. All twelve are drawn in the mockup.

| Template | For | Shape |
|---|---|---|
| Canvas | Dashboards, the compliance centre, reports, the website overview, meetings | Header, optional tabs, a full-width key-figure band, then sections in two balanced columns. Full-width for calendars, charts and wide tables. Side panel optional. |
| Focus | Community picker, welcome, payment and Stripe outcomes | One centred column, no side panel. An outcome page's headline is its title. |

New section kinds, each one component in the kit: key-figure band, chart
(bars or line, teal, last value labelled), month calendar, document editor
surface, checklist (glyph, label, time-left chip, action), picker cards,
outcome, and preview frame. A section on a canvas carries an icon beside its
title because canvas sections are different kinds of thing.

The document authoring editor is the detail template with the editor surface
as its main column. The only pages outside a template are routes that redirect.

What the mockup does not draw, and each page still needs designed when built:
the compliance centre's Manager/Board switch and record detail panel; the
other four report tabs; the website overview's Records, Versions and Settings
tabs; the meetings Schedule and Minutes views and the meeting dialog; the
dashboard's setup rail.

### 5.16 The navigation shell

**(owner)** asked for the navigation to be drawn. It keeps today's structure
(`nav-config.ts`: Dashboard, then Community, Management and Admin groups; a
search-led top bar with help, notifications and profile) and takes the design:

- **Sidebar.** Community switcher at the top with the community name in the
  display face. Items are a bare icon and a label; a count sits at the right in
  mono where the app already has one. The selected item gets the place mark
  (6.7): a solid ink tile behind its icon, on a muted row.
- **Rail.** When the app frame is narrower than about 1300px the sidebar
  collapses to a 56px icon rail, so the side panel keeps its place beside the
  list on a 1280px laptop. This settles the laptop-width risk: at 1280 and 1440
  wide, every table in the mockup fits without sideways scrolling except the
  import preview.
- **Top bar.** Search with its shortcut, then a standing "Next deadline" with
  the time-left chip linking to Compliance, then help, notifications and
  profile. The next-deadline chip puts rule 1 on every screen.
- **Running head.** The breadcrumb line carries an "As of" stamp at the right
  (date and time the page's data was read).
- **Phone.** No sidebar; a menu button opens it as a drawer. The top bar keeps
  search, notifications and profile.

### 5.17 States

Every templated page has the same five states, drawn in the mockup's State
switch:

| State | What shows |
|---|---|
| With data | The page |
| Empty (first run) | 5.7 |
| Loading | Header and section titles are real; toolbars, rows, cells and the side panel's figures are skeletons that mirror the final layout. Skeletons pulse gently and are still under reduced motion. |
| Error | Header and side panel stay. The main section shows what failed, that nothing was lost, a "Try again" button and a reference stamp. A left rule in the danger colour, no tinted box. |
| No results | Toolbar stays with the search text and zero counts. The section says what did not match and offers "Clear search". No example record. |

On phones: tables become stacked records (first column as the title, the rest
as label and value pairs), a calendar shows marks only with the agenda list
below it, the key-figure band is two-up, and controls are 44px.

### 5.18 First-run (onboarding) screens

**(owner)** asked for the onboarding feature just shipped to be restructured
into the direction. That feature is the "guided blueprint" empty-state series
merged on 2026-11-20 (#1470 to #1488): `SetupGuide`, record slots, the context
column, the Continue-setup bar, resident waiting states, first-run heroes and
the scene illustrations. Its content, steps, records and behaviour are kept.
Only where each piece sits changes. Thirteen screens plus two partial-state
examples are drawn in the mockup's "Onboarding" group.

**(owner)** chose: fold the guide into the page shape, and keep the scenes
but quieter.

| Today | In the direction |
|---|---|
| One self-contained card with its own eyebrow, title and description | The page header. The page name is the title; the guide's outcome sentence is the description. No second heading. |
| Progress ring and count in the hero | The side panel's "At a glance" figure ("0 of 13 required records posted") with its proportion bar. The ring component is retired. |
| Fact chips | Plain lines under that figure |
| Context column (`ContextSection` blocks) | The side panel's existing slots: anything time-bound goes to "Needs attention" with the time-left chip, who-sees-what and where-it-shows go to "About", help links go to "Shortcuts". No new slot. |
| Step rail | The standard step strip under the header (5.11). Any step still opens; a blocked step says why. A step the system completed shows a check and no number. |
| Open step: heading, count, slots | One section. Each slot is a row: status glyph, record name, a "Required" or "If it applies" tag, then its action. A conditional record keeps "Doesn't apply". |
| Later steps as rows with chips | A second section, "Later steps", in the same form |
| Scene on a teal sky panel | The scene drawn in ink line with sand fills and one teal accent, set on the section surface beside the step or hero text, about 150px wide, hidden on phones. No tinted panel. |
| First-run hero (Announcements, Contracts, Assessments) | Header, then one section with the headline in the display face, one action, what a record has, and an example record from 5.7 |
| Resident waiting state | Header, then one section with the display-face headline and sentence. "How you'll hear" becomes "About". |
| Continue-setup bar (a bordered row with a ring) | One hairline row between header and content: an in-progress glyph, "Continue setup: 3 of 13 required posted · Next: …", an outline button, and "Hide setup for now" |

Rules that come out of it:

- The step's primary action lives in the page header. The next slot to fill is
  marked with an ink outline, not a second coral button.
- When every record in a step shares one deadline (the 30-day posting window on
  Compliance), the time-left chip appears once beside the step heading, not on
  every row.
- The top bar's "Next deadline" reflects the community's real state: on a new
  community it shows the posting window, not an overdue item.
- Legal copy that must appear in full (the storm-damage notice) is rendered in
  full under the step, never moved to the side panel or shortened.

Not drawn, and still to be designed when built: the Directory steps' CSV
format tables; the "Upload several" row and "Close setup" on Documents; the
HOA and apartment record sets; the non-manager Compliance view; the board-
approval note on Assessments. The scenes in the mockup are stand-ins: the six
real scenes need redrawing in the quieter style. `/welcome` and the getting-
started checklist predate this series and were drawn in 5.15.

**(call)** The illustrations stay as a deliberate, limited exception to the
"house illustration styles date" finding in 6.8: first-run screens only, line
and paper only.

### 5.19 The help center

**(owner)** asked for the help center. It lives in its own route group
(`app/(help)/help`: home, topic, article, search) with its own shell, which is
why the first inventory of signed-in routes missed it. Four pages are drawn.

- **Shell.** A reading shell, not the app shell: "Back to" link, the "Help
  center" wordmark in the display face, and the community-type switch
  (Condominium, Homeowners association, Apartment community). No sidebar.
- **Home.** Display-face heading, one large search field, then topics as
  de-layered groups in two columns: a firmer rule under each topic name with
  its icon and count, hairlines between article links. No cards.
- **Topic and search.** One group of article rows: title, one-line summary,
  and a mono meta at the right.
- **Article.** A 680px reading column at 16px, numbered steps, callouts as a
  left rule (teal for information, amber for a statute or deadline note, no
  tinted box), screenshots in a hairline frame. The margin holds "On this
  page" and "Related". Feedback and the legal disclaimer close the page; the
  disclaimer is rendered in full.

Not drawn: the left topic sidebar and "Contact support" footer on the home
page, Previous/Next cards and the comment box on articles, the community-FAQ
block on search, and `/help/statutes/[statute]`'s chips on articles.

### 5.20 Overlays

**(owner)** asked for the notifications dropdown. It is one of a family of
things that open over a page, none of which had been designed. Ten are drawn
(group "Overlays"), each over its real page.

Rules for every overlay:

- **Elevation lives here and nowhere else.** Popovers and menus use E2, dialogs
  and the command palette E3, on the card surface with a 12px radius. A sheet
  is a full-height panel with a left hairline. Dialogs, sheets and the palette
  dim the page; popovers and menus do not.
- **No display face.** Overlay titles are sans, 14px semibold (16px in a
  dialog). The display face stays on page titles.
- **Rows** are a bare icon, a title, an optional one-line preview, and a mono
  meta at the right. Unread is a bolder title plus an ink dot, never colour
  alone. An urgent row gets the danger icon, not red text.
- **Actions.** A header text action is a link ("Mark all read"). Footer
  buttons sit at the right: outline secondary, then the one primary. A
  destructive confirm is the only filled danger button in the app.
- **States.** Every list overlay has an empty and an error state with the
  code's wording.

| Overlay | Form | Notes |
|---|---|---|
| Notifications | Popover from the bell | Header with "Mark all read", rows, "View all notifications" footer; "You're all caught up" when empty |
| Help | Dialog, opened from the top bar and from each page header | Opens on the article for the current page; search and "Help for this page". **(owner)** "Let's retire the panel": the side panel (`help-widget.tsx`) and the `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` flag are removed, and this modal is the only in-app help surface |
| Profile menu | Menu | Settings, Help Center, Switch Community, Add Community, Data Export, Log out. Log out is not styled destructive, as in the code |
| Command palette | Palette | Large search row, grouped results with a kind label, keyboard hints in the footer |
| Community switcher | Popover from the sidebar | Current community marked with a check and the word "Current" |
| Delete confirmation | Dialog | Says what happens and that it can be undone where true |
| Detail panel | Sheet | Label and value pairs, then the decision form; actions in a sticky footer |
| Form dialog | Dialog | Same field styles as form pages; one primary |
| Toast | Bottom-right | Status glyph and one sentence; an "Undo" link where the code offers one |

Not drawn: the add-community modal and its checkout, the idle-timeout dialog,
the lease unit panel, the create sheets under Operations, the help media
lightbox, the support banner, and the site editor's publish sheet. They follow
the rules above. On phones a popover, menu, dialog or palette spans the width
with 12px margins, and a sheet is full width.

### 5.21 Pages outside the app shell

**(owner)** "I want to have maximum design consistency." Thirty-two more
routes are drawn (groups "Sign in and sign up", "E-signing", "Website
editor", "Public pages", "Print", "Demo", "Phone app"). They share the
direction's type, rules, colour meaning, glyphs and time-left chip; only the
frame differs.

| Frame | Routes | Shape |
|---|---|---|
| Auth | `/auth/login`, `/signup` (seven steps), forgot and reset password, verify email, accept invite, checkout return | No app chrome. A 420px column: wordmark, display-face title, one sentence, fields at 40px, one full-width primary, text links, legal line. Where the page has a side column it becomes a margin of plain lines behind a hairline, not a photo panel. Errors are a left rule in the danger colour with the server's wording. Multi-step flows use the standard step strip. |
| Signing | `/sign/[submissionExternalId]/[slug]` | A slim bar, then the document as a white page with its fields marked (dashed ink outline to do, green solid when done) beside a margin: who asked, progress, the field list with status glyphs, the consent text in full, then Finish and Decline. |
| Editor | `/pm/website-editor` | Its own top bar: back, site name, Simple and Advanced, the saved stamp in mono, Preview and the one primary, Publish. Three panes: section list, canvas, properties. The selected section uses the place mark. |
| Bare | The public transparency page, the branded not-found that notices and unavailable resolve to, demo pages | A brand bar with the community name in the display face, then the ordinary header and sections in a 920px column. |
| Print | `/audit-trail/print` | White paper, a mono running head and stamp over an ink rule, the title, tables with an ink rule under the header and hairlines between rows. No buttons, no colour except status glyphs. |
| Phone app | `/mobile/**` (11 screens; three help routes only redirect) | The code has no tab bar: it is a home list with back buttons, and it is drawn that way. Display-face screen title, sections as on the phone layout of any page, 44px controls. The earlier owner rules hold: no emojis, no greeting header. |

Still out of scope: the themed association home page (`(public)/[subdomain]`),
which carries each community's own branding, and the marketing site.

Not drawn: signup steps two to seven, the signature dialog (draw, type,
upload) and the signing page's eight result states, the editor's Simple mode
and its publish sheet, and the other states of the invite, reset and demo
pages. The phone app is outside the earlier design-token migration, so
bringing it into this direction is its own piece of work.

**(call)** The login page's photo-and-brand side panel becomes a text margin.
That is the one place this section removes something visible from a page the
owner did not single out; say if the photo should stay.

## 6. Visual language

**(owner)** found the first refined look "still too bland" and asked for
research into how large companies keep design consistent and memorable, and
for the broken components in the mockup to be corrected. This section is the
result. In the every-page mockup it is the "Signature" look; "Refined" and
"Structure only" remain for comparison.

### 6.1 What the research says

Primary sources read: Stripe (accessible colour systems, Stripe Apps style and
patterns), Linear (UI redesign, "invisible details"), Apple HIG design
principles, Atlassian token naming, Vercel Geist and its design guidelines,
Shopify's admin redesign, Carbon (2x grid, data table, empty states), Material
theming, Primer empty states, and Karri Saarinen on Airbnb's DLS. Not verified
from a primary source: anything about Stripe's internal system, Polaris
density pages, and inline charts in tables (that one is our inference).

Five practices recur, and each maps to a decision here:

| Practice | Who | Decision in this design |
|---|---|---|
| A few signature elements, rationed, on a mostly neutral product | Linear, Vercel, Shopify, Primer | 6.2: three signatures, each with a rule for where it may appear |
| Put the character in the data, where people spend their time | Vercel, Carbon, Stripe | 6.3: time-left chip, progress bars, tabular numbers, status glyphs |
| De-layer: remove containers and let type and keylines carry hierarchy | Shopify, Linear | 6.4: unboxed side panel, no card inside a card |
| Named page patterns, not only components | Stripe, Carbon, Primer, Polaris | Section 5 templates and the guard |
| Make the wrong thing hard to write | Stripe, Atlassian, Airbnb | Closed slot names, token-only styling, guards (section 7) |

Apple's caution applies throughout: delight is not decoration. Every item
below has to tell the user something.

### 6.2 The four signatures

**(owner)** "I really like signature." Everything else stays neutral so these
stay recognisable. The fourth, the place mark, is defined in 6.7.

1. **Display face.** Fraunces, the brand serif already used on the marketing
   site and in the admin console's page titles. Allowed in exactly three
   places: the page title, headline figures ("At a glance" and the key-figure
   band on a canvas), and the headline of a first-run or outcome state. Nowhere else: not section titles, not cards, not
   tables. This also brings web and admin titles into line.
2. **Time-left chip.** The product is about statutory deadlines, so time is
   the one thing only this app shows this way. One component everywhere a
   record has a deadline: four pips, a count ("9d left", "2d overdue") and the
   date or action. Four levels using the existing compliance escalation
   (calm over 30 days, aware 8 to 30, urgent 1 to 7, critical overdue). The
   level is carried by the pip count and the words, not colour alone.
3. **Status glyphs.** One drawn family of five ring glyphs replaces generic
   icons wherever status appears (rows, badges, timelines): dashed ring (not
   started or closed), half-filled (in progress), ring with mark (needs
   attention), solid with mark (overdue or severe), solid with check (done).
   A row shows the bare glyph, with no tile behind it.

### 6.3 Character in the data

- **Statute chip.** A statute or bill reference in text (§718.111(12)(g),
  HB 1203) renders as a small mono chip that links to its plain-language guide.
- **Progress in cells.** "6 of 9 signed" renders with a thin bar; complete is
  green, partial is teal.
- **People** get a neutral initials avatar. **Numbers** are tabular and
  right-aligned, except in the first column.
- **Row actions** in an Actions column are links or small buttons, never plain
  text.
- **Timelines.** Activity, history and reply lists on detail pages render as a
  connected timeline using the status glyphs.
- **Keyboard.** The search field shows its shortcut key. The existing command
  palette is surfaced the same way.

### 6.4 De-layering and surfaces

- Sand page, white sections, hairline borders, no shadows at rest.
- The side panel has no box: one hairline at its left edge. "Needs attention"
  is a single left rule in the warning colour, not a tinted box.
- No card inside a card: a section that holds card records loses its own
  border and background.
- The header is separated from the body by one hairline, or by the tab strip.

### 6.5 Type, colour, motion

- Geist for interface text; Geist Mono for counts in chips and statute
  references; Fraunces per 6.2. Page title 30px, headline figure 42px.
  Record titles are medium weight; only page and section titles are heavy.
- The accent (coral) appears on the one primary button and on links. Selected
  tabs and filters use ink. Status colours are for status only.
- 120ms colour transitions on hover; a 1px press on buttons; nothing moves on
  load; all off under `prefers-reduced-motion`.

### 6.6 Component corrections made in the mockup

Found by rendering all 55 templated pages and reading them, plus automated
checks for overflow, over-wide tables and duplicated controls.

| Problem | Correction, now a rule |
|---|---|
| Dropdown fields drew a giant arrow | Select has a fixed 14px chevron |
| Option pickers collapsed into tiny underlined text | Radio options are their own bordered control, not filter chips |
| Page tabs repeated as filters, and again as shortcuts | Tabs appear once; counts sit on the tab |
| Filter bars wrapped to a second line; search squeezed | Filters scroll sideways; search keeps a fixed width |
| "Save" actions in section footers shown as plain text | Footer actions are buttons |
| Row actions shown as plain text | Links or small buttons |
| First table column wrapped into a tall stack | First column has a minimum width; tables over five columns drop their lowest-priority column |
| Two steps of a flow drawn at once | One step at a time |
| "About" text described the interface or the plan | About says who can do what, nothing else |
| Card footer link "Open" beside a status badge "Open" | Card action is "View" |

### 6.8 Timelessness: research and what changed

**(owner)** asked for more character and for research into how large firms
achieve timeless design.

Sources read include Vitsoe on Rams, Apple's iOS 7 and 2025 design
announcements, Material's print-based foundations, NN/g on flat design and low
contrast, Linear's redesign, Stripe's colour system, Butterick on tables of
numbers, and the Fraunces source. Not verified from a primary source: IBM and
Paul Rand, the NYC subway standards, Bloomberg's amber, and Apple's type
history beyond the Bold Text fixes.

What lasts: structure over effects; a typeface chosen for the job and kept;
one owned colour with a functional meaning; legibility as a floor; density
tuned to the task; small details done correctly. What dates: gloss, gradients,
long shadows and glass; ultra-thin type; low-contrast grey; house illustration
styles; decorative motion.

Changes made because of it:

| Change | Why |
|---|---|
| Coral means only "the action to take" (primary button and links). The selected tab is ink. | One owned colour with one meaning, as the FT's pink. |
| Three weights of rule: hairline between rows, a firmer rule under headers, a double rule under the summary figures. | Ledger convention; hierarchy from rules, not boxes or effects. |
| Running head with an "As of" stamp; statute chips are real citations. | Record-book furniture is kept only where it carries information, which is what stops it being costume. |
| Icons are bare and monochrome. The soft-filled tiles are gone; one solid ink tile marks the current place. | Soft rounded icon tiles were judged the highest dating risk in the direction. |
| Fraunces with its soft and wonky axes set to 0, moderate weight. | Those axes are the early-2020s look; the plain cut is a conventional old-style serif. |
| A numeric voice: tabular figures everywhere, amounts right-aligned, one date format ("Nov 21, 2026"), mono for citations, counts in chips and stamps. | Correct number setting reads as quality in any decade. |
| A registrar's writing voice: plain and exact ("Posted Nov 18. Due in 9 days."). | Voice survives any reskin. |

Remaining judgement calls: the warm paper background is fashionable now but
has long print precedent, so it stays near-neutral with strong contrast; Geist
is low risk.

### 6.7 Icons

**(owner)** asked for an icon library used as a theme, and for research into
how Uber uses icons.

What Uber does (primary source: Uber Design, "When to evolve a design system";
Uber's guideline sites did not load, so sizes, grid and label rules are not
verified): icons are drawn from the typeface so type and icons read as one
alphabet; one stroke weight; outline and fill are a defined pair; a selected
state is never colour alone; icons are monochrome and follow the text colour;
one library with one naming and sizing system, synced to code. The lesson is
that the theme comes from rules, not from which library is used.

Decisions:

- **Stay on Lucide.** 234 files import it today. Switching library means a
  name-mapping table and a re-review of every screen for a different outline
  style. **(call)** Phosphor (MIT) is the fallback only if a needed glyph is
  missing: Lucide has no elevator or hurricane icon.
- **One wrapper.** Icons are imported only through a local `Icon` component. A
  guard bans direct `lucide-react` imports and hand-set `size` or
  `strokeWidth` (today the app mixes five sizes and four stroke widths).
- **One weight, three sizes.** 1.6 stroke to sit with Geist. 16 in rows and
  tables, 20 in controls and navigation, 24 in tiles and empty states.
- **Monochrome.** Icons take the text colour.
- **Icons name, glyphs tell.** An icon says what kind of thing something is. A
  status glyph (6.2) says what state it is in. A row shows one or the other:
  a kind icon when the list mixes kinds (notifications, audit trail, dashboard
  feeds), a status glyph when every row is the same kind.
- **The place mark, the fourth signature.** Icons are bare. One solid ink tile
  with an inverse icon marks the current place: the selected navigation item,
  repeated beside the page title. Nothing else gets a tile. (An earlier draft
  used soft-filled tiles widely; the timeless-design research in 6.8 judged
  those the most likely part of the direction to date.)
- **Labels by default.** Icon-only buttons are limited to close, search, more,
  back and expand.
- **One concept, one icon.** A registry maps each part of the app to one icon
  (24 entries in the mockup's Design direction page). It is the only source;
  navigation, headers and shortcuts read from it. Today `FileText`, `Users`,
  `Paintbrush`, `ClipboardCheck` and `AlertTriangle` each stand for two or
  three different nav items.

**(call)** The signatures in 6.2 and the items in 6.3 are the author's
proposal from the research, for the owner to judge in the mockup. Sizes are at
a 16px root and are written on the rem scale in code. Fraunces must be added
to the web app's fonts (`next/font/local`, as admin does), which has a small
font-loading cost on every signed-in page.

## 7. Enforcement

A new guard, `pnpm guard:page-template`, added to `scripts/run-lint-guards.mjs`.

1. Every `app/(authenticated)/**/page.tsx` must render `PageLayout` in one of
   the six templates (list, detail, form, settings, canvas, focus) (directly,
   or through a client component named in a top-of-file delegation comment, the
   same mechanism `guard:breadcrumbs` uses), or carry
   `// page-template:exempt — <reason>`.
   The check is per file: the page must render `PageLayout` on its main path.
   Early-return branches (a missing `communityId` message, a bare loading or
   error return) are not policed.
2. Existing pages are frozen in a shrink-only baseline
   (`scripts/page-template-baseline.json`). New pages must comply. A migrated
   page leaves the baseline in the same PR; a stale entry fails the guard.
3. Second rule, same guard, per-file shrink-only counts: hand-built section
   boxes (a class string combining a `rounded-*`, `border` and a `bg-surface-*`)
   outside the kit. New files must have none.

The guard prints its denominators (pages scanned, compliant, baselined,
exempt) and refuses to pass if it scanned nothing.

`DESIGN.md`, `.claude/rules/design.md` and `docs/design-system/` gain a "Page
templates" section so the rule is written where page authors look.

## 8. Rollout

Each phase is its own PR or small set of PRs with disjoint files.

| Phase | Contents | Done when |
|---|---|---|
| 0 | Kit in `packages/ui` (including tabs, steps, card records, the canvas and focus kinds, the `Icon` wrapper and registry, and the section 6 visual rules), `PageLayout`, guard with seeded baseline, docs. No page changes. | Guard green; kit unit and axe tests pass |
| 1 | Pilot: Emergency Alerts (list, detail, new), Packages (staff and resident), and one tabbed page (Visitors, two tabs) so tabs are proven before phase 3. `PageHeader` paints title and description app-wide; breadcrumb leaf rule. | Owner reviews the four pages in the running app and approves the look |
| 2 | The community dashboard on the canvas template (it is the first screen people see), then Settings moved onto the shared kit | Settings pages unchanged in behaviour; private kit deleted |
| 3+ | Remaining pages in batches by navigation group, list pages first | Baseline reaches only the named exemptions |

**(owner)** set a final task, to start only when the last phase above has
merged: update the example content, and rewrite every help article under
`apps/web/src/content/help/` (31 files) against the redesigned screens, with
fresh screenshots and GIFs throughout. It is not part of the build and must
not be started during it, because every screenshot taken before the last
phase would be stale.

Phase 1 is a real checkpoint. Nothing in phase 3 starts until the owner has
seen the pilot live, because a mockup cannot settle laptop-width behaviour.

The pilot pages hand-build their width today (`mx-auto max-w-4xl`); they move
onto `PageLayout` and `PageBody` widths as part of the pilot.

Painting titles app-wide in phase 1 touches unmigrated pages too. Each
`<PageHeader` occurrence (93 across 77 files, fallback branches included) is
checked for a page that already shows its own
visible heading text, so no page ends up with two.

## 9. Exemptions

None. Redirect-only routes carry the redirect comment and draw nothing. The
`// page-template:exempt` escape hatch exists for a future emergency and needs
a reason; the baseline starts with zero uses of it.

## 10. Testing

- Unit tests for each kit part; an axe test per template with a rendered,
  non-empty tree.
- A test that `SidePanelSlot` rejects an unknown slot name at the type level and
  renders slots in the fixed order regardless of JSX order.
- `e2e/responsive-overflow.spec.ts` extended to the pilot pages at 375px.
- Guard tests in three directions: passes on the repo, fails on an injected
  non-template page, fails on an injected hand-built box. Fixtures are built
  under `os.tmpdir()`.
- `perf-check` budgets unchanged for the pilot routes.

## 11. Left to the builder

- Exact prop names and file split inside the kit.
- Which summary figures each phase 3 page shows, guided by 5.3. Each page's
  figures are listed in its PR description for the owner to check.
- The wording of each page's description, following the UX-writing rules.
- Batch boundaries in phase 3.
- Skeleton shapes for the panel slots.

## 12. Open risks

- **Laptop width.** With the sidebar open at about 1280px the content box may
  fall under 960px, so the panel moves above the list. That is the designed
  behaviour, but it has only been approximated in the mockup.
- **Content cost.** Every list page needs a headline figure and an attention
  condition. The fit test found a true figure for 20 of 27 list pages and a
  real attention item for 14; the rest ship without that slot. Several figures
  in the mockup are examples the app does not compute today (Announcements,
  Move-in/out, Reserves) and need a small query or are dropped.
- **Mockup accuracy.** The every-page mockup was written by cheaper agents from
  the code. Three values are guesses (the 60-day windows on Leases and
  Contracts, the 2,000-row import cap) and one page's action buttons were not
  verified (wind-mitigation report). Each page is re-read when it is migrated.
- **Two looks during rollout.** Until phase 3 finishes, migrated and unmigrated
  pages sit side by side. Painted titles in phase 1 narrow the gap.

## 13. Study rulings

**(owner)** asked for a Talmudic study before the plan is locked. Six readers
each raised difficulties from one angle (the text against itself, the design
against the code, accessibility, roles and data and states, rollout, and the
people who use it). Two disputants then cross-examined: a defender ruled on all
sixty findings and re-verified nine key facts in the code, and a prosecutor
pressed the most dangerous ones and looked for what all six missed. The
consolidated round-one findings are in `2026-11-21-page-anatomy-study-findings.md`.
The defender upheld about forty-five, found four true of today's app and not
caused by this design, and rejected none. The rulings below are the author's.

### 13.1 Corrections of fact

| Earlier statement | Fact |
|---|---|
| 6.7: Fraunces "must be added to the web app's fonts… small font-loading cost" | False. Web already loads and preloads it (`apps/web/src/app/layout.tsx:53-58`) and a global `h1` rule already applies it (`globals.css:32-34`). The vendored file has only `opsz` and `wght` axes, so the "soft" and "wonky" settings do not exist to turn off; the plain cut is what renders. Painting titles makes them serif with no further work. |
| 5.16: "every table in the mockup fits without sideways scrolling" at 1280 and 1440 | False at the app's real text size. The mockup was drawn at 14px rows on a 16px root. The app has large text on by default and a fluid root (18px at 1440), so text renders about 29% larger. Measured with the mockup's new "App text size" switch: every table page scrolls sideways with the panel beside it, at both widths. Row pages fit. |
| 5.3: "a per-page article lookup does not exist on the server" | False. `getContextualArticles(pathname, …)` exists (`help-article-service.ts:530-541`). It matches the path only, so all tabs of one page share an article. |
| 8: "every help article… (31 files)" | The corpus is 103 MDX files with 95 screenshot-capture manifests under `scripts/help-capture/manifests`. |
| 5.16: sidebar collapses to a rail by width; phones use a drawer | The sidebar's open or collapsed state is the user's, saved in the browser (`sidebar-context.tsx`). #1458 (2026-11-11) gave phones the tab row with no menu button, and #1460 removed the rail from portfolio pages. See owner decision 4. |
| 6.5 and the mockup: coral is the action colour | In the signed-in app the action colour is each community's brand colour (`--interactive-primary: var(--theme-primary, …)`, set in `(authenticated)/layout.tsx`). Presets include a red equal to the danger colour and a teal equal to the information colour. See owner decision 1. |

### 13.2 Rulings the author settled

Structure and text

- **Scope, as workstreams.** (1) kit, `Icon`, guards; (2) signed-in pages on
  six templates; (3) shell; (4) overlays and the single help dialog;
  (5) first-run screens, folded in per page; (6) help center; (7) auth,
  signing, editor, public, print, demo frames. **The phone app (`/mobile`) is
  its own later programme** and is not in this build: it sits outside the
  earlier token migration and holds 15 of the 27 frozen token-baseline files.
  Admin is untouched.
- **Six templates, no bespoke pages.** 5.8 and 5.9's "four" and "twelve
  bespoke" are superseded. Phase "lists, details, forms" ends when the
  baseline is empty.
- **Side-panel slots are four positions with a closed name set per template**,
  not one fixed set of four names:

  | Position | List, canvas | Detail | Form and steps | Help article |
  |---|---|---|---|---|
  | 1 | At a glance | Details | Preview or summary | On this page |
  | 2 | Needs attention | Needs attention | Needs attention | none |
  | 3 | Shortcuts | Related | none | Related |
  | 4 | About | About | About | none |

  "At a glance" appears only where a true figure exists. A panel that would
  hold only "About", or under two lines in total, is not drawn: its sentence
  goes under the page description and the main column takes the width.
- **The display face is allowed in exactly these places:** the page or screen
  title; headline figures ("At a glance" and the key-figure band); the headline
  of a first-run, waiting or outcome state; and the community or product name
  in the sidebar switcher, brand bar and help wordmark.
- **Sizes come from the existing type scale, nothing smaller than `xs`.** Page
  title and headline figures use `3xl` (there is no 42px step). The time-left
  count, row meta and table cells are `sm`. Labels and stamps are `xs`, which
  is 14px in the default large-text mode. The mockup's 10 to 13px text is not
  buildable and is superseded.
- **Selected tabs and filters are ink.** 5.10's "accent underline" is superseded.
- **"Tile" means only the place mark:** the selected navigation item, the mark
  beside the page title, and the selected section in the editor. `RecordRow`
  has a bare glyph or a bare icon.
- **Where the primary action sits:** list, detail and canvas pages in the
  header; forms in a footer action bar with only Cancel in the header; step
  flows Back and Next in the footer; a first-run setup page (a list page in its
  first-run state) in the header.
- **Geist Mono is kept out of first-paint chrome.** It is not preloaded and the
  font budget is tight. Stamps, counts and the running head use Geist with
  tabular figures; mono is for statute chips and keyboard hints only.
- **No new colours.** The look is restated in existing tokens: hairline
  `--border-default`, firmer and double rules `--border-strong`, ink
  `--text-primary`, the dimming layer black alpha. Chip pips use the three
  existing status colours with the level carried by pip count and words.
  `packages/ui/src/tokens/compliance.ts` maps "aware" to the brand colour
  today; that mapping changes, because the action colour must not also mean a
  deadline level.

The time-left chip

- **One shared `daysLeft` formatter** replaces the three rounding rules in the
  code today (`Math.ceil`, `Math.floor`, calendar-day difference). It never
  rounds remaining time up, switches to hours under 48 hours, and takes its
  level from the owning domain module's status, never from its own arithmetic.
- **A closed set of chip states:** time left; due today; overdue; met late
  (fixed, does not keep counting); out of its window; no clock applies; does
  not apply. A deadline with no date shows the state in words, not a chip.
- **Community time everywhere.** Dates, "today" and the "As of" stamp use the
  community's timezone and say so when the viewer's differs.
- The wording and reach of the chip are owner decisions 2 and 3.

Accessibility

- **Status is always a glyph plus a word.** 6.2's "a row shows the bare glyph"
  is superseded: the word sits in the row's meta line, and is visually hidden
  only where a status column already says it. Minimum glyph size 16px.
- **The chip says its level in words.** "9 days left" in full outside tables;
  in tables the accessible name is "Due in 9 days, Dec 3, urgent". Pips are
  redundant decoration and are hidden from assistive tech.
- **Attention, error and callout blocks keep an icon and a leading word.** A
  coloured left rule alone is not enough. Errors use `role="alert"`.
- **Phone tables are a real list, not a reflowed table.** `DataTable` renders
  label and value pairs as a definition list below the phone breakpoint.
  Calendar days carry an accessible name with their event count.
- **The split side panel is two labelled regions in reading order**, never a
  CSS reorder. Heading levels: h1 page title, h2 sections and panel slots.
- **The collapsed rail keeps every name** as an accessible name and a tooltip
  on hover and focus.
- **Targets.** Standalone links and icon buttons get the 44px floor on phones
  and at least 24px on desktop; close buttons are 36px.
- **Overlays use the existing Dialog, Sheet, Popover and Command primitives**
  for focus trap, return and Escape. A toast with "Undo" stays until
  dismissed. The idle-timeout dialog gets designed.
- **(call) One new token is recommended despite "no new colours":** a
  control-edge neutral at 3:1 for input, select, radio and toggle borders.
  Today's borders are 1.40:1 on cards. This is true of the app today and not
  caused by this design, but the design should not ship without fixing it.

States and data

- **Four more states**, added to 5.17: plan-locked and lapsed (today's
  `locked-feature-screen` and `lapsed-feature-screen`, redrawn inside the page
  shape with the header intact); denied or not found (the dashboard reads the
  `reason` it is already sent and says why the person landed there, which is
  silent today); read-only (the primary action is disabled and says why);
  and "figures unavailable" for a panel whose data failed while the list
  loaded.
- **One banner slot** above the header with a priority order (support session,
  billing, trial, continue-setup), one at a time.
- **Counts.** A footer says "Showing N" with "Load more". "of M", and counts on
  filters, appear only where a count is already computed. Cursor pagination
  returns no total.
- **Panel figures obey the page's permission and feature gates.** A figure for
  a switched-off channel (SMS) or a gated feature (fines) is not shown, and a
  role sees only what it may read. Each figure names the existing summary
  function it comes from; no figure gets its own new population.
- **"About" is generated, not written.** One `describeAccess(resource,
  features)` module reads the permission matrix and feature gates. A guard bans
  hand-written role claims ("Managers can…", "Owners see…", "can be undone")
  in panel content, following `guard:page-state-copy`.
- **Residents get their own page on every shared route.** Documents, Meetings
  and Operations join 5.14's list. A resident's page opens on the newest
  records, has no statute chips or posting columns, and offers "Report a
  problem" directly.
- **First-run reassurance leads.** The description of a first-run page carries
  the standing and the next step ("Nothing is late. Start with the
  declaration."), as the shipped Compliance first run does.
- **The dashboard keeps its status sentence** (`buildStatusSentence`) as the
  page description. No greeting in the title.
- **The section toolbar gains a slot for selection, bulk actions and export.**
  A table over its column budget drops columns in a declared priority order.
- **Two voices.** A registrar's voice for records and stamps; the warm voice
  `design.md` already requires for empty, waiting and error states and for
  anything said to a resident.
- **Print.** A print stylesheet hides the sidebar, top bar and side panel;
  chips print as text.
- **Links survive.** `?tab=` values in emailed links keep working; renaming a
  tab or turning tabs into a view switch needs a redirect.
- **Emails are not restyled in this build**, but they must read the same level
  from the same domain module, so the app and its emails never grade one item
  differently.

Layout at real sizes

- **Table pages cannot hold the side panel beside the table on a laptop at the
  default text size.** Ruling: on a table page the panel sits beside the table
  only when the content box is at least 1280px wide. Below that, positions 1
  and 2 become one compact strip above the table and positions 3 and 4 follow
  it. Row pages keep the panel beside the list from 960px. The pilot is where
  these two numbers get confirmed, at large text, at 1280 and 1440.

Rollout, replacing section 8

1. **Fix this document** into one consistent text (the plan is written from
   section 13 and the sections it does not supersede).
2. **Kit, `Icon` wrapper and guards, additive only.** New files beside the
   existing ones. No shared primitive changes, so nothing reaches admin. The
   icon guard covers class-name sizing as well as props, with a shrink-only
   baseline, and names its roots. Performance delta measured in CI here: the
   shell has about 31 KiB of headroom against a required check.
3. **Preview gate.** A per-user preference (`user_preferences`, no migration)
   turns the new look on for the owner only, in production. Titles and
   descriptions paint only inside `PageLayout`, never app-wide in one step:
   `PageHeader`'s `description` prop is deprecated today and 93 call sites
   carry unreviewed text.
4. **Pilot** on Sunset Condos (the review path must pin that community,
   because most demo personas land on a plan where these pages are locked):
   Emergency Alerts, Packages, Visitors. The owner reviews in the real app
   behind the gate.
5. **Shell**, after owner decision 4.
6. **Dashboard, then Settings.**
7. **Lists, details and forms** by navigation group, each page with its
   first-run state, its resident page and its help-capture manifest updated in
   the same PR.
8. **Overlays and the help dialog.** Primitive edits in their own PRs, each
   with an admin check (`guard:admin-semantic-css` needs a build).
9. **Help center, then auth, signing, editor, public, print, demo.**
10. **After the last merge:** the owner's content task (103 help articles,
    95 capture manifests, example data).

Proof for each page: a "direction" manifest set in `scripts/help-capture`
shoots it at 1280 and 1440 in default large text and the contact sheet is
attached to the PR; `e2e/responsive-overflow.spec.ts` gains the page and a
"panel beside or strip above" assertion. End-to-end tests are treated as
required for this programme even though the repository does not require them.
Expected size: 45 to 70 pull requests. `components/layout` and `nav-config`
change often, so shell work ships as one short series, rebased daily.

### 13.3 Not changing

- **Tertiary text contrast (4.24:1 on muted) and placeholder contrast.** True
  of today's tokens, not caused by this design; recorded for a separate token
  decision. Text under 14px or on a muted surface uses the secondary colour.
- **"Quiet until it matters."** A critical item is not made louder across the
  page; the statutory-overdue state uses the danger glyph and word.
- **The name "About".** Kept; its content is now generated.
- **Login photo.** Still the owner's call (5.21).

### 13.4 Owner decisions

Pending. See the message that accompanies this commit.

# PropertyPro design direction and page anatomy

Date: 2026-11-21
Status: consolidated after the study; approved by the owner for planning
Scope: `apps/web`. The signed-in app, its shell, overlays, first-run screens,
the help center, and the routes outside the shell named in section 10.

This is the single text to plan and build from. How it was reached, including
every superseded idea, is in `2026-11-21-page-anatomy-design-history.md`. The
study's findings are in `2026-11-21-page-anatomy-study-findings.md`.

Mockups (open in a browser, same folder):

- `2026-11-21-page-anatomy-every-page.html`: every screen. Use its "App text
  size" switch: the mockup was drawn about 29% smaller than the app renders.
- `2026-11-21-page-anatomy-mockups.html`: the three early directions.

Where a mockup and this text disagree, this text wins. The mockup's known
differences are listed in section 20.

Lines marked **(owner)** are the product owner's decisions. Everything else is
the author's design and may be challenged in review.

---

## 0. The direction

**A calm record book where time is always visible.** The app is mostly quiet:
paper, ink and hairlines. Four things are allowed to stand out (section 11.1).
Six rules decide the rest.

1. **Time is the product.** A record with a deadline shows the time-left chip,
   never a bare date.
2. **Quiet until it matters.** Coral means one thing: the action to take
   (the primary button and links). Other colour is for status and time only.
3. **One page, one shape.** Header, main column, context. Every page uses a
   template. There are no exceptions.
4. **Say something true first.** Every page opens with a figure or fact that is
   useful before the first record exists.
5. **Fewer boxes.** Type and rules carry the hierarchy. Never a card inside a
   card.
6. **Icons name, glyphs tell.** An icon says what kind of thing this is. A
   glyph says what state it is in.

When built, this section opens `DESIGN.md` and `.claude/rules/design.md`,
replacing guidance it contradicts.

## 1. Why

**(owner)** Pages "feel weak"; Emergency Alerts and Packages "look like empty
husks"; Settings "feels dull"; the design "doesn't feel cohesive and modern";
"I don't want future pages to suffer from the same issue"; "I want to have
maximum design consistency."

The cause is structural, not a matter of token values. Measured 2026-11-21 in
`apps/web/src`: 34 files import `Card` while about 540 lines hand-build a
bordered box; `h2`/`h3` carry 59 distinct class strings; five radii and four
paddings are in regular use; 26 files hand-build a table against 7 using
`DataTable`. Pages paint no title or description. A page is only its one piece
of data. The one structured kit (`components/settings/settings-layout.tsx`) is
private to Settings.

## 2. Goals, non-goals, anti-goals

Goals

1. Every page is built from one of six templates (section 5.6).
2. A page has shape and something true to say before its first record exists.
3. A new page cannot ship without a template; guards enforce it (section 16).
4. Sections, icons, status and deadlines each come from one component.
5. The look is recognisable and does not date (section 11).

Non-goals

- The admin console. Nothing in this work may change an admin screen.
- The phone-only routes under `/mobile`. They are drawn in the mockup for
  reference and become their own later programme (section 19).
- Email templates, the marketing site, and each association's themed public
  home page.
- A dark theme.
- Changing what any feature does. Only where things sit and how they look.

Anti-goals

- A side panel filled with filler. Every item is true and useful, or absent.
- Features inventing their own panel content, icons, status marks or deadline
  wording.
- A big-bang rewrite. The work ships in small pull requests behind a preview
  gate.

## 3. Constraints from the repository

- `.claude/rules/design.md` holds: semantic tokens only, no shadows at rest,
  one filled primary per region, 44px controls below `md`, status as icon plus
  text plus colour.
- The page gutter stays single-sourced in `PageContainer`.
- **Type renders larger than the mockup.** The signed-in root is fluid
  (`clamp(100%, 69.23% + 0.4808vw, 125%)`: about 17.2px at a 1280 window, 18px
  at 1440) and large text is on by default, so `text-xs` renders about 15.75px
  and `text-sm` 18px at 1440. All sizes are written on the existing rem scale.
- `guard:design-tokens` bans raw hex and slash-opacity on semantic tokens;
  `guard:class-resolution` requires every colour class to exist in the
  Tailwind config.
- `packages/ui` is shared with admin and must stay import-time pure with no
  `next` dependency.
- `perf-check` is a required check. Hard route budget 1160 KiB with the shell
  near 1017; aggregate 1435 with about 31 KiB of headroom.
- Fraunces (display), Geist and Geist Mono are already loaded in web
  (`apps/web/src/app/layout.tsx`). Fraunces is preloaded and a global `h1`
  rule already applies it. Its file has only `opsz` and `wght` axes. Geist
  Mono is not preloaded.
- The sidebar's open or collapsed state is the user's, saved in the browser
  (`sidebar-context.tsx`). A second desktop shell exists behind
  `NEXT_PUBLIC_TOP_NAV_ENABLED`.
- Cursor pagination returns `hasMore`, not a total.
- The product does not give legal advice. `compliance_audit_log` and existing
  copy guards (`guard:page-state-copy`) exist because claims drifted before.
- Guards follow `.claude/rules/verification.md`: tri-state exit, non-zero
  population, shrink-only baselines.

## 4. Decisions

| # | Decision | Whose |
|---|---|---|
| 1 | Direction B (workspace: main column plus a standing side panel), revised | owner |
| 2 | The "Signature" look | owner |
| 3 | No page is exempt from the design | owner |
| 4 | First-run guides fold into the page shape; scenes are kept but quieter | owner |
| 5 | The help side panel is retired; the help dialog is the only in-app help surface | owner |
| 6 | After the build: refresh example content and all help articles with new screenshots and GIFs | owner |
| 7 | The action colour is fixed coral in the signed-in app; brand colour lives on the public site | owner |
| 8 | The time-left chip distinguishes four kinds of date | owner |
| 9 | "Next deadline" in the top bar is for managers and board only | owner |
| 10 | The navigation as drawn replaces the 2026-11-11 shell decisions (#1458, #1460) | owner |
| 11 | Page titles and descriptions are painted (reverses the 2026-09-02 decision) | owner, by approving B |
| 12 | Login photo panel: kept or replaced by a text margin | **open, owner** |
| 13 | One new border token for control edges at 3:1 contrast | **open, owner**; recommended |

## 5. Page anatomy

### 5.1 The three regions

```
Running head: breadcrumb trail ..................... As of <date, time>
+----------------------------------------------------------------------+
| [place mark] Title                             [Secondary] [Primary]  |
|              One-sentence description                                 |
| (tabs, or a step strip, when the page has them)                       |
+------------------------------------------+---------------------------+
| MAIN                                     | SIDE PANEL                |
| Section                                  | position 1                |
|   toolbar: filters ......... search      | position 2                |
|   records                                | position 3                |
|   footer                                 | position 4                |
+------------------------------------------+---------------------------+
```

### 5.2 Header

- `PageHeader` paints the `<h1>` title and a one-sentence description. It
  remains the only owner of the `<h1>`, so `guard:page-header` and
  `guard:breadcrumbs` keep their logic; their docblocks and standing
  exemptions are rewritten.
- Painting happens **only inside `PageLayout`**, never app-wide in one step.
  `PageHeader`'s `description` prop is deprecated and unrendered today and 93
  call sites carry unreviewed text.
- The place mark (section 11.1) sits beside the title.
- At most one filled primary and one outline secondary. Where the primary
  sits depends on the template (section 5.6).
- A status badge on a detail page sits beside the title.
- The breadcrumb trail is unchanged. The existing header Help button stays.

### 5.3 Side panel

Four positions, with a closed set of names per template. A page may omit a
position. It may not add, reorder or rename.

| Position | List, canvas | Detail | Form and steps | Help article |
|---|---|---|---|---|
| 1 | At a glance | Details | Preview or summary | On this page |
| 2 | Needs attention | Needs attention | Needs attention | none |
| 3 | Shortcuts | Related | none | Related |
| 4 | About | About | About | none |

- **At a glance:** one headline figure with its unit, up to three label and
  value lines, and a proportion bar when the figure is a ratio. Only where a
  true figure exists; it must be meaningful with zero records.
- **Needs attention:** exceptions the viewer can act on, each with an icon, a
  leading word, and one action link. When there are none, one quiet sentence
  saying what would appear here.
- **Shortcuts:** up to four plain links. Never the page's primary action.
- **About:** who can do what, generated (section 14.2). One or two sentences.
- Panel width 17.5rem.
- A panel that would hold only "About", or under two lines in total, is not
  drawn. Its sentence goes under the page description and the main column
  takes the width.
- The panel is role-aware and gate-aware (section 14.1). A viewer with no
  panel content gets none.
- The panel never blocks the main column: on a server-rendered page its slots
  stream inside `Suspense`; on a page that already loads in the browser it
  reads the same query as the list so figures cannot disagree.

### 5.4 Layout at real sizes

Layout follows the width of the content box (the `cq` container-query
vocabulary), not the screen.

- **Row pages:** the panel sits beside the list when the content box is at
  least 960px.
- **Table pages:** the panel sits beside the table only when the content box
  is at least 1280px. Below that, positions 1 and 2 become one compact strip
  above the table and positions 3 and 4 follow it. Measured at the app's real
  text size, a five-column table does not fit beside the panel on a laptop.
- These two thresholds are confirmed in the pilot at default large text, at
  1280 and 1440 wide, and adjusted there if wrong.
- When the panel is split, it is **two labelled regions in reading order** in
  the document, never a CSS reorder.
- Phones (below `md`): tables render as a list of label and value pairs
  (a real definition list from `DataTable`, not a reflowed table); a calendar
  shows marks with an accessible event count and the agenda list below; the
  key-figure band is two-up; controls are 44px.

### 5.5 Sections and records

One rule per page for how records are shown:

- **Rows** (`RecordRow`) for narrative records: alerts, announcements,
  violations, requests, threads. A row is a status glyph or a kind icon, a
  title, one line of preview, a meta line that includes the status word, and
  an outcome at the right.
- **Table** (`DataTable` in a `Section`) for tabular records: packages,
  ledger, residents, units, visitors. People get a neutral initials avatar.
  Numbers are tabular and right-aligned except in the first column. Row
  actions are links or small buttons. A table over its column budget drops
  columns in a declared priority order.
- **Cards** for records that carry their own controls or progress: polls,
  elections, move-in checklists, storm-damage reports, reserve components. A
  section that holds cards has no border or background of its own.

An outcome stands out only when something went wrong. Success is quiet text
with a glyph and word.

The section toolbar holds filters on the left (scrolling sideways, never
wrapping), search on the right with its shortcut key, and a slot for
selection, bulk actions and export. A footer says "Showing N" with "Load
more". "of M", and counts on filters, appear only where a count is already
computed.

### 5.6 The six templates

| Template | For | Main column | Primary action |
|---|---|---|---|
| List | Section landing pages | One section: toolbar, records, footer | Header |
| Detail | `[param]` pages, the document editor, an e-sign submission | The record's content in sections; a preview or editor surface where there is one | Header |
| Form | `new`, `edit`, submit, import | Form sections at `form` width | Footer action bar; header has Cancel only |
| Settings | `settings/**` | Left nav plus grouped sections of rows | Section footer |
| Canvas | Dashboards, compliance centre, reports, website overview, meetings | A full-width key-figure band, then sections in two balanced columns; full width for calendars, charts and wide tables | Header |
| Focus | Community picker, welcome, payment and Stripe outcomes | One centred column, no side panel | In the column |

Additions that any template may carry:

- **Tabs** for peer sets of records, directly under the header. Each tab
  brings its own records and primary action. The selected tab is in the URL.
  Existing `?tab=` values keep working; a renamed tab needs a redirect. A
  different view of the same records (Documents: List, Board, Timeline) is a
  view switch in the toolbar, not tabs.
- **Step strip** for multi-step flows: done, current, upcoming, numbered.
  Back and Next sit in the footer. A canvas step (placing fields on a PDF)
  takes the full main column.

Canvas section kinds, each one component: key-figure band, chart (bars or
line, last value labelled), month calendar, editor surface, checklist,
picker cards, outcome, preview frame. A section on a canvas carries an icon
beside its title because canvas sections are different kinds of thing.

The only routes outside a template are routes that redirect.

### 5.7 States

Every templated page has these states.

| State | What shows |
|---|---|
| With data | The page |
| First run | Section 7 |
| Loading | Real header and section titles; skeletons that mirror the final layout; `aria-busy` |
| Error | Header and panel stay. The section says what failed and that nothing was lost, with "Try again" and a reference stamp; icon, leading word, `role="alert"` |
| No results | Toolbar stays with the search text. "Nothing matches…" and "Clear search". No example record |
| Plan-locked | The page shape with its header; what the feature does and "Upgrade now" (owners "Request upgrade"). Replaces today's standalone `locked-feature-screen` |
| Lapsed | As plan-locked, for an ended subscription |
| Denied or not found | The dashboard reads the `reason` it is already sent and says why the person landed there. Silent today |
| Read-only | The primary action is disabled and says why (demo grace, lapsed manager) |
| Figures unavailable | One line in the panel when its data failed and the list loaded |

One banner slot sits above the header with a priority order (support session,
billing, trial, continue-setup), one at a time.

### 5.8 Residents

A resident gets their own page on every shared route (Documents, Meetings,
Operations, Payments, ARC, Visitors, Violations, Announcements, Storm
Damage). It opens on the newest records, has no statute chips, posting
columns or management figures, usually has no side panel, and offers "Report
a problem" directly. Each audience's page picks its own template.

## 6. Shell

**(owner)** The navigation as drawn replaces the 2026-11-11 decisions.

- **Sidebar.** Community switcher at the top with the community name in the
  display face. Items are a bare icon and a label, with a count at the right
  where the app already computes one. The selected item carries the place
  mark.
- **Rail.** On narrower windows the sidebar collapses to an icon rail so the
  side panel keeps its place. The collapse is CSS-only below the breakpoint;
  the user's saved choice applies above it, so nothing flickers on load. The
  rail keeps every name as an accessible name and a tooltip on hover and
  focus. The breakpoint is set in the pilot at the app's real text size.
- **Phones.** A menu button opens the sidebar as a drawer. This replaces the
  tab row from #1458.
- **Portfolio pages** get the rail with their own item list, since no single
  community is in scope. This replaces #1460.
- **One shell.** The second desktop shell behind `NEXT_PUBLIC_TOP_NAV_ENABLED`
  is deleted first.
- **Top bar.** Search with its shortcut, then "Next deadline", help,
  notifications, profile.
- **"Next deadline".** **(owner)** Shown only to people who can open
  Compliance, for statutory deadlines only, naming the item. With nothing due
  it reads "Nothing due this week". Tenants, apartment communities,
  associations below the statutory size and portfolio pages never see it. It
  is fed by one cached query, not one per navigation, and reads the same
  summary function as the dashboard and the Compliance page so all three
  agree.
- **Running head.** The breadcrumb line carries an "As of" stamp at the right,
  supplied by the page through context. If a page cannot supply one, the
  stamp is absent.

## 7. First-run screens

The "guided blueprint" series (#1470 to #1488) keeps its content, steps,
records and behaviour. Only where each piece sits changes.

| Today | In the direction |
|---|---|
| A self-contained card with eyebrow, title, description | The page header. The description carries the standing and the next step ("Nothing is late. Start with the declaration.") |
| Progress ring and count | "At a glance" with a proportion bar. The ring component is retired |
| Fact chips | Plain lines under that figure |
| Context column | The panel's positions: time-bound items in "Needs attention", who-sees-what in "About", help links in "Shortcuts" |
| Step rail | The step strip. Any step opens; a blocked step says why; a system-completed step shows a check and no number |
| Open step and its slots | One section. Each slot is a row: glyph and status word, record name, "Required" or "If it applies", its action. Conditional records keep "Doesn't apply" |
| Later steps | A second section in the same form |
| Scene on a teal panel | The scene in ink line with paper fills and one teal accent, beside the text, hidden on phones. No tinted panel |
| First-run hero | Header, then one section: display-face headline, one action, what a record has, an example record |
| Resident waiting state | Header, then one section with a display-face headline and a sentence |
| Continue-setup bar | The banner slot: an in-progress glyph and word, "Continue setup: 3 of 13 required posted · Next: …", an outline button, "Hide setup for now" |

Rules: the step's primary action is in the header and the next slot to fill
has an ink outline, not a second coral button. A deadline shared by every
record in a step shows once beside the step heading. Legal copy that must
appear in full (the storm-damage notice) is rendered in full under the step.
Elsewhere, a first-run list shows a short title, one sentence, the primary
action, and one example record in a dashed frame.

The six real scenes are redrawn in the quieter style. They are a deliberate,
limited exception to "house illustration styles date": first-run screens
only, line and paper only.

## 8. Overlays

Elevation is used here and nowhere else.

- Popovers and menus use E2; dialogs and the command palette E3; a sheet is a
  full-height panel with a left hairline. Dialogs, sheets and the palette dim
  the page with black alpha.
- All are built on the existing Dialog, Sheet, Popover and Command primitives
  for focus trap, focus return and Escape.
- Titles are sans. The display face stays on pages.
- A row is a bare icon, a title, an optional preview, and meta at the right.
  Unread is a bolder title plus an ink dot plus the word for assistive tech.
  An urgent row gets the danger icon and word, not red text.
- A header text action is a link. Footer buttons sit at the right: outline
  secondary, then one primary. A destructive confirm is the only filled
  danger button in the app.
- Every list overlay has an empty and an error state with the code's wording.
- A toast with "Undo" stays until dismissed. Toasts use `role="status"`.
- Overlays load with `next/dynamic` so they stay out of the shell's bundle.
- On phones a popover, menu, dialog or palette spans the width with margins,
  and a sheet is full width.

| Overlay | Form |
|---|---|
| Notifications | Popover from the bell: "Mark all read", rows, "View all notifications" |
| Help | Dialog from the top bar and each page header, opening on the article for the current path (`getContextualArticles`). **(owner)** The side panel (`help-widget.tsx`) and `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` are removed |
| Profile menu | Menu |
| Command palette | Palette with grouped results and keyboard hints |
| Community switcher | Popover from the sidebar; the current one has a check and the word "Current" |
| Confirmation | Dialog saying what happens and whether it can be undone |
| Detail panel | Sheet: label and value pairs, then the form; actions in a sticky footer |
| Form dialog | Dialog with the same field styles as form pages |
| Toast | Bottom-right: glyph, word, one sentence |
| Idle timeout | Dialog; to be designed in the build |

## 9. Help center

`app/(help)/help`: home, topic, article, search. A reading shell, not the app
shell: a "Back to" link, the "Help center" wordmark, and the community-type
switch.

- **Home:** display-face heading, one large search field, topics as groups
  in two columns with a firmer rule under each topic name and hairlines
  between article links. No cards.
- **Topic and search:** one group of article rows.
- **Article:** a reading column at body size, numbered steps, callouts with
  an icon, a leading word and a left rule (no tinted box), screenshots in a
  hairline frame. "On this page" and "Related" in the margin. Feedback, then
  the legal disclaimer in full.

## 10. Frames outside the shell

They share the type, rules, colour meaning, glyphs and chip. Only the frame
differs.

| Frame | Routes | Shape |
|---|---|---|
| Auth | `/auth/login`, `/signup`, forgot and reset password, verify email, accept invite, checkout return | A narrow column: wordmark, display-face title, one sentence, fields, one full-width primary, text links, legal line. Errors carry an icon, the word and the server's wording. Multi-step flows use the step strip |
| Signing | `/sign/[submissionExternalId]/[slug]` | The document as a white page with its fields marked, beside a margin: who asked, progress, the field list with glyph and word, the consent text in full, Finish and Decline |
| Editor | `/pm/website-editor` | Its own top bar (back, site name, Simple and Advanced, saved stamp, Preview, Publish). Section list, canvas, properties |
| Bare | Public transparency page, the branded not-found, demo pages | A brand bar with the community name, then ordinary sections in a centred column |
| Print | `/audit-trail/print`, and a print stylesheet for every page | White paper, a running head and stamp over an ink rule, tables with an ink rule under the header. The print stylesheet hides sidebar, top bar and panel; chips print as text |

## 11. Visual language

### 11.1 The four signatures

**(owner)** "I really like signature." Everything else stays neutral so
these stay recognisable.

1. **Display face (Fraunces).** Allowed in exactly these places: the page or
   screen title; headline figures ("At a glance" and the key-figure band);
   the headline of a first-run, waiting or outcome state; and the community
   or product name in the sidebar switcher, brand bar and help wordmark.
2. **Time-left chip.** Section 12.
3. **Status glyphs.** One family of five ring glyphs: dashed ring (not
   started or closed), half-filled (in progress), ring with mark (needs
   attention), solid with mark (overdue or severe), solid with check (done).
   Always with a word. Minimum 16px.
4. **Place mark.** One solid ink tile with an inverse icon marks where you
   are: the selected navigation item, repeated beside the page title, and the
   selected section in the editor. Nothing else gets a tile.

### 11.2 Type

- Geist for interface text. Geist Mono only for statute chips and keyboard
  hints, because it is not preloaded. Stamps, counts and the running head use
  Geist with tabular figures.
- Sizes come from the existing scale; nothing smaller than `xs`. Page title
  and headline figures `3xl`. Section titles `base` semibold. Rows, table
  cells, row meta and the time-left count `sm`. Labels and stamps `xs`.
- Record titles are medium weight. Only page and section titles are heavy.
- Heading levels: `h1` page title; `h2` sections and panel positions.

### 11.3 Colour

- **(owner)** Coral is fixed in the signed-in app and means only the action
  to take: the one primary button and links. `--interactive-primary` and
  `--status-brand` stop reading `--theme-primary` inside the signed-in app.
  The per-community theme keeps applying to the public site. Communities with
  a custom colour will see their in-app buttons become coral.
- Selected tabs, filters and navigation use ink.
- Status colours are for status only, always with a glyph and a word.
- No new colours except decision 13. Ink is `--text-primary`. The chip's
  levels use the three existing status colours. `compliance.ts` maps "aware"
  to the brand colour today; that mapping changes.
- Text under 14px or on a muted surface uses the secondary colour, not the
  tertiary, which has no contrast margin there.

### 11.4 Rules and surfaces

- Paper page, white sections, no shadows at rest.
- Three weights of rule: a hairline (`--border-default`) between rows; a
  firmer rule (`--border-strong`) under headers and table heads; a double
  rule (`--border-strong`) under the key-figure band.
- The side panel has no box: one rule at its left edge (at its top when
  split).
- "Needs attention", errors and callouts are a left rule plus an icon and a
  leading word. No tinted boxes.

### 11.5 Character in the data

- A statute or bill reference in text renders as a small mono chip linking to
  its plain-language guide.
- "6 of 9 signed" renders with a thin bar.
- Activity, history and reply lists on detail pages render as a connected
  timeline using the status glyphs.
- The running head and "As of" stamp, statute citations, and record numbers
  are real information, never decoration.

### 11.6 Icons

Uber's rebuilt icon system (one source read: Uber Design, "When to evolve a
design system") shows that a theme comes from rules, not from the library.

- **Stay on Lucide.** A local `Icon` wrapper is the only way to import an
  icon. It takes a registry key or a component and a size from a closed set.
- **One weight, three sizes** on the rem scale: small in rows and tables,
  medium in controls and navigation, large in the place mark and empty
  states.
- **Monochrome.** Icons take the text colour.
- **Icons name, glyphs tell.** A row shows a kind icon when the list mixes
  kinds, and a status glyph when every row is the same kind.
- **Labels by default.** Icon-only buttons are limited to close, search,
  more, back and expand, each with an accessible name.
- **One concept, one icon.** A registry maps each part of the app to one
  icon. Navigation, headers and shortcuts read from it.
- Lucide has no elevator or hurricane glyph; Phosphor (MIT) is the fallback
  for a missing glyph only.

### 11.7 Motion

120ms colour transitions on hover; a 1px press on buttons; a gentle skeleton
pulse. Nothing moves on load. All of it is off under
`prefers-reduced-motion`.

### 11.8 Voice

A registrar's voice for records and stamps: plain and exact ("Posted Nov 18.
Due in 9 days."). The warm voice `design.md` already requires for empty,
waiting and error states and for anything said to a resident.

### 11.9 What keeps it from dating

Structure, not effects: no gradients, glass, glow or long shadows. One
colour with one meaning. A typeface chosen for the job and kept. Numbers set
properly. Furniture that is information. Legibility as a floor. (Sources:
Vitsoe on Rams, Apple's design announcements, Material's print foundations,
NN/g on flat design and low contrast, Linear's redesign, Stripe's colour
system, Butterick on tables of numbers.)

## 12. The time-left chip

The product is about statutory deadlines, so time is the one thing only this
app shows this way. It is also the place where the design could mislead.

**(owner)** Every chip takes a required **basis**:

| Basis | Examples | Wording | Levels |
|---|---|---|---|
| `statute` | Posting windows, meeting notices | "9 days left", "2 days overdue"; citation chip mandatory | All four |
| `governing-docs` | Hearing notice periods set by bylaws | As statute, without a statute chip | All four |
| `contract` | Lease end, contract expiry, e-sign expiry | "Ends in 24 days", "Ended Oct 25" | Calm, aware, urgent; never "overdue" |
| `event` | A meeting, an inspection visit | "In 12 days" | None; no pips |

- **One shared `daysLeft` formatter** replaces the three rounding rules in the
  code today (`Math.ceil`, `Math.floor`, calendar-day difference). It never
  rounds remaining time up and switches to hours under 48 hours.
- **The level comes from the owning feature's module**, never from the chip's
  own arithmetic. Wind mitigation, reserves and lease alert windows keep their
  own bands.
- **A closed set of states:** time left; due today; overdue; met late (fixed,
  does not keep counting); out of its window; no clock applies; does not
  apply. A deadline with no date shows its state in words.
- **Form:** four pips, the count in words, then the date or action. The level
  is carried by the pip count and the words, not colour alone. Pips are
  hidden from assistive tech.
- **Words:** "9 days left" in full outside tables. In tables the short form
  is allowed with an accessible name such as "Due in 9 days, Dec 3, urgent".
- **Time zone:** the community's, labelled when the viewer's differs.
- Emails are not restyled in this build but must read the same level from the
  same module, so the app and its emails never grade one item differently.

## 13. Accessibility requirements

- Status is a glyph plus a word everywhere. The word may be visually hidden
  only where a status column already says it.
- Attention, error and callout blocks carry an icon and a leading word.
- Control edges (input, select, radio, toggle) need 3:1 against their
  surface. Today's `--border-strong` is 1.40:1 on cards. See decision 13.
- Standalone links and icon buttons get the 44px floor on phones and at
  least 24px on desktop. Close buttons are 36px.
- The collapsed rail keeps every name. The step strip, tabs and filters are
  keyboard-operable and expose their selected state.
- Phone tables are real lists. The split panel is two regions in reading
  order. Calendar days have accessible names.
- Reflow holds at 320px and 400% zoom; sticky footers and the top bar must
  not cover the focused element.
- Each kit part has an axe test over a rendered, non-empty tree.

## 14. Data and claims

### 14.1 Figures

- Panel figures obey the page's permission and feature gates. A figure for a
  switched-off channel (SMS) or a gated feature (fines) is not shown, and a
  role sees only what it may read.
- Each figure names the existing summary function it comes from. No figure
  gets a new population of its own.
- A list page needs a description, and where true, one headline figure and
  one attention condition. A page with nothing true to say ships without that
  position. The fit test found a true figure for 20 of 27 list pages.

### 14.2 "About" is generated

One `describeAccess(resource, features)` module reads the permission matrix
and feature gates and produces the sentence. A guard bans hand-written role
claims ("Managers can…", "Owners see…", "can be undone") in panel content,
following `guard:page-state-copy`.

### 14.3 Copy

Page descriptions are written per page, reviewed by the owner in batches, and
must not state a legal conclusion.

## 15. The kit

New parts live in `packages/ui/src/components/shared/` beside the existing
ones, with web wrappers where `next/link` is needed. Parts are imported by
file path, not through the package barrel.

| Part | Notes |
|---|---|
| `PageLayout` | Places header, tabs or steps, main, panel; owns section 5.4 |
| `SidePanel`, `SidePanelPosition` | Position names are a closed union per template |
| `Section`, `SectionGroup`, `SectionHeader`, `SectionToolbar`, `SectionRow`, `SectionLinkRow`, `SectionFooter` | From the Settings kit, which then moves onto them |
| `RecordRow`, `RecordCard` | Section 5.5 |
| `TimeLeft` and `daysLeft` | Section 12 |
| `StatusGlyph` | Five glyphs, each with a required word |
| `Icon` and the icon registry | Section 11.6 |
| `StepStrip`, `PageTabs` | Section 5.6 |
| Canvas kinds | Key-figure band, chart, calendar, editor surface, checklist, picker, outcome, preview |
| `StatuteChip` | Links to its guide |
| `describeAccess` | Section 14.2 |

Existing parts that are replaced over the rollout: the Settings kit,
`ProgressRing`, hand-built tables, `locked-feature-screen` and
`lapsed-feature-screen` as standalone screens, `help-widget`.

**Existing shared primitives are not edited in place** during the additive
phase. Any later edit to a primitive that admin also imports (Button, Badge,
Card, EmptyState, AlertBanner, KpiCard, QuickFilterTabs, Dialog, status
config) is its own pull request with an admin check.

## 16. Enforcement

All guards follow the repository's guard shape and print their denominators.

1. **`guard:page-template`.** Every page under the roots in scope renders
   `PageLayout` in one of the six templates on its main path, or a named frame
   from section 10, or only redirects. Existing pages are frozen in a
   shrink-only baseline that ends empty. Roots: `app/(authenticated)`,
   `app/(help)`, `app/auth`, `app/(auth)`, `app/sign`, `app/(print)`,
   `app/(site-editor)`, and the public transparency and demo routes. `/mobile`
   is excluded by name with the reason.
2. **Hand-built boxes.** Per-file shrink-only counts of a class string that
   combines a radius, a border and a surface background outside the kit.
3. **`guard:icons`.** No direct `lucide-react` import outside the wrapper, and
   no hand-set icon size by prop or by class name. Roots `apps/web/src` and
   the new kit directory; shrink-only baseline; admin excluded by name.
4. **Panel copy.** The role-claim guard from 14.2.

`DESIGN.md`, `.claude/rules/design.md` and `docs/design-system/` are updated
in the same work so the rules are written where page authors look.

## 17. Rollout

Each line is a workstream of small pull requests with disjoint files.
Expected size 45 to 70 pull requests.

| # | Workstream | Done when |
|---|---|---|
| 1 | **Kit, `Icon` and guards, additive only.** New files. No shared primitive changes, so nothing reaches admin. Bundle delta measured in CI | Guards green with seeded baselines; kit unit and axe tests pass; `perf-check` green |
| 2 | **Preview gate.** A per-user preference (`user_preferences`, no migration) turns the new look on for the owner only, in production. Titles paint only inside `PageLayout` | The owner can switch it on and off |
| 3 | **Pilot** on Sunset Condos: Emergency Alerts (list, detail, new), Packages (staff and resident), Visitors (two tabs). The review path pins that community, because most demo personas land on a plan where these pages are locked | The owner reviews in the real app and approves, including the two thresholds in 5.4 |
| 4 | **Shell.** Delete the second shell; sidebar, rail, drawer, top bar, "Next deadline", running head | One shell; no flicker on load; `perf-check` green |
| 5 | **Dashboard, then Settings** | Settings' private kit deleted |
| 6 | **Lists, details and forms** by navigation group. Each page ships with its first-run state, its resident page, its extra states, and its help-capture manifest updated | The page-template baseline is empty |
| 7 | **Overlays and the help dialog.** Retire the help panel and its flag | One help surface; each primitive edit has an admin check |
| 8 | **Help center; then auth, signing, editor, public, print, demo** | Their roots are clean in the guard |
| 9 | **(owner) After the last merge:** refresh example content and all 103 help articles and 95 capture manifests with new screenshots and GIFs | Not part of the build; not started during it |

Nothing after the pilot starts until the owner has approved it in the real
app.

Proof for every page: a "direction" manifest set in `scripts/help-capture`
shoots it at 1280 and 1440 in default large text and the contact sheet is
attached to the pull request; `e2e/responsive-overflow.spec.ts` gains the
page and an assertion that the panel is beside the list or a strip above it.
End-to-end tests are treated as required for this programme even though the
repository does not require them. `components/layout` and `nav-config` change
often, so the shell ships as one short series, rebased daily.

## 18. Testing

- Unit tests for each kit part; an axe test per template.
- `daysLeft`: boundaries at 48 hours, 23 hours, zero, one hour past, a
  daylight-saving change, and the community versus viewer time zone. A
  revert-check per boundary.
- `SidePanelPosition` rejects a name outside its template's set at the type
  level and renders in fixed order regardless of JSX order.
- `describeAccess`: a property test against the permission matrix.
- Guard tests in three directions each; fixtures under `os.tmpdir()`.
- Existing tests that pin the old behaviour are updated in the pull request
  that changes it: `page-header.test.tsx` (pins `sr-only`), 53 unit files and
  41 end-to-end lines that query headings, 18 files that reference the help
  panel or its flag.

## 19. Later, separately

- **The phone app (`/mobile`).** Eleven screens are drawn. The code has no
  tab bar: it is a home list with back buttons. Bringing it into the
  direction is its own programme because it sits outside the earlier token
  migration.
- **Emails,** restyled to match.
- **Admin,** adopting the kit.
- **Tertiary and placeholder text contrast,** a token decision.

## 20. Where the mockup differs from this text

- Text is drawn about 29% smaller than the app renders. Use the "App text
  size" switch, and trust the pilot over the mockup for fit.
- Sizes below `xs`, and mono in stamps and counts.
- Status shown by glyph alone in rows and checklists.
- The chip on every kind of date with one wording.
- "Next deadline" shown to every viewer.
- "Needs attention" without its icon.
- Phone tables as a reflowed table.
- A sidebar width, a rail breakpoint and a panel threshold set in mockup
  pixels.
- A tab bar is not drawn for the phone app because the code has none.
- Example figures and rows written by agents from the code; three values were
  guesses (the 60-day windows on Leases and Contracts, an import row cap).

Not drawn, and designed when built: plan-locked, lapsed, denied and read-only
states; the idle-timeout dialog; resident pages with data; signup steps two
to seven; the signature dialog and the signing page's result states; the
editor's Simple mode and publish sheet; the compliance centre's Manager and
Board switch and record detail panel; four of five report tabs; the website
overview's other tabs; the meetings Schedule and Minutes views; the
dashboard's setup rail; the Directory steps' spreadsheet tables.

## 21. Risks

- **Fit.** The two thresholds in 5.4 and the rail breakpoint are estimates
  until the pilot.
- **Performance.** The shell has little headroom and is on every route.
- **Churn.** Shell files change often; onboarding merged the day before this
  design and is reworked by it.
- **Two looks during rollout.** The preview gate covers the pilot and the
  shell, where old and new can cheaply coexist. After the owner approves the
  pilot, the gate is opened to everyone and later pages ship to customers as
  they merge, so migrated and unmigrated pages sit side by side until
  workstream 6 finishes. Keeping two implementations of every page behind a
  gate for the whole rollout would double the work.
- **Copy.** About 55 descriptions need writing and review.
- **Fixed coral** is a visible change for communities with a custom colour.

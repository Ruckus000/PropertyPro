# Page anatomy: one shape for every signed-in page

Date: 2026-11-21
Status: awaiting approval
Scope: `apps/web` signed-in app (`app/(authenticated)`)
Mockups: `2026-11-21-page-anatomy-mockups.html` in this folder (open in a browser; the tabs "B revised · Alerts" and "B revised · Packages" are the approved direction)

Lines marked **(owner)** are decisions the product owner made in conversation.
Lines marked **(call)** are the author's choices and can be overruled.

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
- Redesigning bespoke surfaces: the dashboard, the website editor, the document
  viewer, the calendar grid. They are exempted by name (section 8).

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

## 6. Enforcement

A new guard, `pnpm guard:page-template`, added to `scripts/run-lint-guards.mjs`.

1. Every `app/(authenticated)/**/page.tsx` must render `PageLayout` (directly,
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

## 7. Rollout

Each phase is its own PR or small set of PRs with disjoint files.

| Phase | Contents | Done when |
|---|---|---|
| 0 | Kit in `packages/ui`, `PageLayout`, guard with seeded baseline, docs. No page changes. | Guard green; kit unit and axe tests pass |
| 1 | Pilot: Emergency Alerts (list, detail, new) and Packages (staff and resident). `PageHeader` paints title and description app-wide; breadcrumb leaf rule. | Owner reviews the four pages in the running app and approves the look |
| 2 | Settings moved onto the shared kit | Settings pages unchanged in behaviour; private kit deleted |
| 3+ | Remaining pages in batches by navigation group, list pages first | Baseline reaches only the named exemptions |

Phase 1 is a real checkpoint. Nothing in phase 3 starts until the owner has
seen the pilot live, because a mockup cannot settle laptop-width behaviour.

The pilot pages hand-build their width today (`mx-auto max-w-4xl`); they move
onto `PageLayout` and `PageBody` widths as part of the pilot.

Painting titles app-wide in phase 1 touches unmigrated pages too. Each
`<PageHeader` occurrence (93 across 77 files, fallback branches included) is
checked for a page that already shows its own
visible heading text, so no page ends up with two.

## 8. Exemptions named now

The dashboard, the website editor and overview, the document viewer, the
calendar grid, `select-community`, `payments/success`, and redirect-only pages.
Each carries the exemption comment with its reason.

## 9. Testing

- Unit tests for each kit part; an axe test per template with a rendered,
  non-empty tree.
- A test that `SidePanelSlot` rejects an unknown slot name at the type level and
  renders slots in the fixed order regardless of JSX order.
- `e2e/responsive-overflow.spec.ts` extended to the pilot pages at 375px.
- Guard tests in three directions: passes on the repo, fails on an injected
  non-template page, fails on an injected hand-built box. Fixtures are built
  under `os.tmpdir()`.
- `perf-check` budgets unchanged for the pilot routes.

## 10. Left to the builder

- Exact prop names and file split inside the kit.
- Which summary figures each phase 3 page shows, guided by 5.3. Each page's
  figures are listed in its PR description for the owner to check.
- The wording of each page's description, following the UX-writing rules.
- Batch boundaries in phase 3.
- Skeleton shapes for the panel slots.

## 11. Open risks

- **Laptop width.** With the sidebar open at about 1280px the content box may
  fall under 960px, so the panel moves above the list. That is the designed
  behaviour, but it has only been approximated in the mockup.
- **Content cost.** Every list page needs a headline figure and an attention
  condition. Some will need a small new query. A page with nothing true to say
  ships without that slot.
- **Two looks during rollout.** Until phase 3 finishes, migrated and unmigrated
  pages sit side by side. Painted titles in phase 1 narrow the gap.

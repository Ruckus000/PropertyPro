# Empty states: the "guided blueprint" pattern

Status: **approved direction, not yet implemented** (2026-11-11).
Why it looks like this: [`docs/audits/2026-11-11-empty-state-design-audit.md`](../../audits/2026-11-11-empty-state-design-audit.md).
Mockups: <https://claude.ai/artifact/H2DDrAFquaiRAKL6NrNr8N> (row "Merged · Guided blueprint").

This file is the rulebook for every empty state in `apps/web`. The current
implementation is `packages/ui/src/components/shared/empty-state.tsx` with copy in
`apps/web/src/lib/constants/empty-states.ts`; both change when this lands.

---

## 1. Rules

1. **Show the finished shape.** An empty page draws the real outline of what will
   fill it: the actual required records, the actual unit list, the actual report
   fields. Never a generic icon with "No data".
2. **Make it countable, and only count what applies.** "4 of 13 posted". Conditional
   items can be marked "Doesn't apply to us" and leave the count.
3. **Count what is already done.** Defaults the system set (renewal alerts, default
   categories) appear as completed steps.
4. **One smallest next step.** One filled primary per region, and it's the current
   step's action.
5. **Hide what can't act.** Filters, view switchers, search, sort, export and KPI
   rows appear when there is data for them.
6. **Honest zeros.** No "0.0%", no reassuring sentence that is untrue, no example
   data on any page that reports compliance.
7. **Calm, never alarming.** Illustrations show intact buildings and clear skies.
   Legal and deadline lines are plain and complete.
8. **Truthful per community type and role.** The outline comes from data
   (`getComplianceTemplate`, the community's categories), never from a hard-coded
   condo list.

## 2. Which state is this?

Pick exactly one. Getting this wrong is the most common empty-state bug
(today's Documents page says "Nothing matches those filters" with no filter on).

| State | When | Looks like |
|---|---|---|
| **Setup** | Nothing exists yet, and the viewer can create it | Hero + step rail + blueprint (§4.1) |
| **Partial** | Setup started, not finished | Real page + "Continue setup" bar (§4.3) |
| **Waiting** | Nothing exists, and the viewer can't create it (resident) | Calm scene + one line + their one action if any (§4.4) |
| **All clear** | The list is empty because nothing needs attention (no violations, nothing to sign) | Celebratory scene, no CTA, or a link to history |
| **No results** | Rows exist but search or filters hide them | No scene. One line naming the filter + "Clear filters" |
| **Error** | The load failed | `AlertBanner` danger with Retry. Never an illustration |
| **Loading** | In flight | `Skeleton`. Never an illustration |

## 3. Sizes

"Every empty state gets a scene." The scene is sized to its container:

| Size | Container | Art box | Text | Steps? |
|---|---|---|---|---|
| **Hero** | A whole page's content (`PageBody` root) | 18–22rem wide, beside text ≥ `md`, below text on phones | `<h2>` text-2xl, body text-base, ≤ 60ch | Yes, for Setup |
| **Section** | A tab, panel or card that fills a column | 10rem | `<h3>` text-lg, body text-sm | Optional, max 3 |
| **Compact** | Dashboard widget, dropdown, table body, small card | 4.5–6rem vignette (prop only, no landscape) | One line, text-sm, optional link | No |

Below `md` a Hero renders at Section size, with the art under the text so the
action stays in the first viewport.

## 4. Anatomy

### 4.1 Setup (manager, whole page)

```
┌ Hero (7/12 text on the card surface │ 5/12 art on a teal-50 panel) ──────┐
│ EYEBROW                                        │                           │
│ h2  Outcome-shaped title                       │      scene art            │
│ p   Why it matters + what will appear here     │      (decorative,         │
│ ◔ 0 of 13   [fact chip] [fact chip]            │       bleeds to bottom)   │
├ Step rail (ol) ────────────────────────────────────────── 1 of 3 done ────┤
│ ✓ Renewal alerts ─── ● 1 Add units ─── ○ 2 Residents & leases           │
├ Main column (≈2/3) ─────────────────────────┬ Context column (≈1/3) ─────┤
│ h3  Current step               [Primary]    │ Your page, once it's running │
│ [Slot ✚] [Slot ✚] [Slot ✚]   (blueprint)    │   (silhouette preview)       │
│ What it needs: the real format              │ Who sees what                │
│   (CSV columns, record names, fields)       │ Help (2–3 real articles)     │
│ ○ 2 Later step · its items as chips  0 of 2 │                              │
│ ○ 3 Later step · its items as chips  0 of 3 │                              │
└─────────────────────────────────────────────┴──────────────────────────────┘
```

**Fill with information, never with filler.** An empty page feels empty when the
eye has nowhere to go. Every block added to fill it must be something true the
user would otherwise have to find out the hard way. In priority order:

1. **Fact chips in the hero** (2–3): defaults already on, limits, what happens to
   their data. "Up to 2,000 units per file", "Preview before anything is saved".
2. **The real format of what the step needs**: the CSV's actual columns with the
   template's rows, the actual record names, the actual report fields.
3. **Later steps show their contents** as chips, not just a title and a count.
4. **A destination preview** in the context column: a silhouette of the
   populated page (labelled tiles, ghost rows, the real column names), with no
   numbers and no example values. It shows the payoff without faking data (rule 6).
5. **Who sees what**: which roles see this page's contents.
6. **Help**: 2–3 links to articles that exist under `apps/web/src/content/help/`.

The context column stacks under the main column below `md`. Fact chips wrap. The
hero art drops below the text at Section size (§3).

- **Max 5 steps of work**, plus any steps the system already completed (shown first,
  checked). Longer lists group (condo: Governing, Money, Meetings, Board &
  contracts, Building & insurance).
- **Step state** = icon + text + colour: done ✓ green-700, current ● coral,
  upcoming ○ `--text-secondary`, plus visually hidden status text. Markup in §6.3.
- **Any step can be opened**; the rail suggests an order, it doesn't enforce one.
  A dependency ("Residents unlock after units") is the only reason to disable a step,
  and the row says why.
- **Slots** are real `<button>`s (or file `<label>`s) named "Add <record>". The dashed
  border is decorative; the "Add" text identifies the control. Conditional slots add
  a second button, "Doesn't apply to us".
- **Toolbar while empty:** the page's own primary ("Upload Document", "New lease") is
  hidden; the hero owns the action. Secondary toolbar items that make sense with no
  data (Help, "Author a document") stay as `outline`/`ghost`.

**First-run manager pages designed (2026-11-11, canvas row "First run · manager"):**

| Page | Steps | Notes |
|---|---|---|
| Directory (units + residents) | Units → Residents → Invitations | One page, one flow. A resident always needs a unit, so Residents stays disabled (with the reason) until a unit exists. Resident import sends no email, which is why Invitations is its own step. |
| Compliance (condo / HOA) | none | **Never empty**: the checklist exists from day one, with deadlines 30 days after creation. Its first run is a calm countdown ("Your 30-day posting window has started"), grouped by *Due on date* / *Keep current, rolling 12 months* / *Only if they apply*. No 0% score, no "requirements are now in effect" alarm on day zero. Compliance shows **when**; Documents is **where files go**. Don't duplicate the slot grid. |
| Meetings | Schedule → Post the notice → Minutes | Meeting types are the slots, grouped by notice period (48 hours: Board, Committee; 14 days: Annual, Special, Budget). The app warns inside the window and never blocks. |
| Announcements | none | A single action, so no step row. Shows the composer's real fields, three suggested first posts (copy only, no prefill), and points urgent news to Emergency alerts. |

**Single-action pages omit the step row.** A rail with one step is decoration.

### 4.2 Blueprint content by community type

| Page | condo_718 | hoa_720 | apartment |
|---|---|---|---|
| Documents | 21 records from `CONDO_718_CHECKLIST_TEMPLATE` (13 required, 8 if-applies), 5 steps | 14 records from `HOA_720_CHECKLIST_TEMPLATE` (11 required, 3 if-applies), 4 steps | The community's categories as a **recommended starter set**. No statute, no "required", no count against a law. |
| Units / leases | n/a (feature is apartment-only) | n/a | Units → leases → renewal alerts (pre-done) |

### 4.3 Partial

The moment the first item exists, the real page renders. Above it:

```
◔ Continue setup · 4 of 13 posted · Next: Annual Budget   [Continue]  ✕
```

- One line in a neutral `Card` (radius md), not sticky. Its heading is the page's `h2`.
- "Continue setup" is an `outline` button: the page's own "Upload document" is now
  the region's one primary, and two coral buttons a row apart compete.
- "Continue setup" reopens the setup view on the current step.
- ✕ dismisses for this user (preference); setup stays reachable from the page's
  overflow menu. It disappears for good when every applicable item is done.

### 4.4 Waiting (residents)

```
        [scene art, Section size]
   h2  Documents your association posts appear here
   p   You'll get a notification when something new is shared.
       [ Report damage ]   ← only if the resident has an action
```

No steps, no counts, no compliance language. Same illustration family as the
manager view, so the product feels like one place.

On a whole page the waiting state is two columns too: the scene card (≈2/3) and
a context column (≈1/3) with what a good submission includes, what happens after
it is sent (the real status names), any safety line already in the product's copy,
and one help link. Legal notices stay full width beneath both.

**Resident pages designed (2026-11-11, canvas rows "Resident views"):**

| Page | State | Resident action | Types · plan | Context column |
|---|---|---|---|---|
| Documents | Waiting | none | all | What owners vs tenants can open; email on post |
| Announcements | Waiting | none | all | Audience labels; per-post email or digest |
| Meetings | Waiting | none | all | What Calendar / Schedule / Minutes will hold; notice email |
| Packages | All clear | none | condo, apartment · not essentials | Received → Notified → Picked up |
| Maintenance | Waiting + action | Submit a request | all · not essentials | Submitted → Acknowledged → In progress → Resolved → Closed |
| ARC | Waiting + action | Start a request | condo, HOA · not essentials | Submitted → Under review → Approved / Denied; denial states reason + rule |
| Report a problem | Waiting + action | Report a problem | condo, HOA · not essentials | Reported → Noticed → Resolved / Dismissed; "Your reports" placeholder |
| Payments (owners) | All clear | none | condo, HOA · not essentials | Charge statuses; pay-now vs contact-management; **unit-not-linked variant** |
| E-Sign | — | — | — | **No empty state, deliberately.** Residents have no E-Sign page; the dashboard card appears only when something is waiting. An always-on "nothing to sign" card would be noise. |

Rules that came out of these: resident pages never show counts or steps; a status
track lists the real status names in order; "How you'll hear" names the actual
channel (email, digest, in-app) and links to notification settings; nothing
mentions fines or online payment availability unless the resident has something
to pay.

## 5. Illustration system

### 5.1 Where it lives

`packages/ui/src/illustrations/`. One React component per **part** and one per
**composition** (`DocumentsSetupScene`, `StormCalmScene`…). Each composition takes
`size: 'hero' | 'section' | 'compact'`. Rules:

- Paint only with `var(--…)` palette tokens. No hex (`guard:design-tokens`) and no
  slash-opacity on semantic tokens.
- `aria-hidden="true"` by default. Never `role="img"` with a label for decoration.
- Import-time pure (`packages/ui` declares `sideEffects: ["**/*.css"]`): no
  registries, no global setup.
- Each composition under ~6 KB of SVG. No raster images, no external fetches.

### 5.2 Visual language

| Property | Value |
|---|---|
| Palette | sand 0/100/200/300 (structure), coral 50/100/600/700 (the thing to add), teal 50/200/700 (sky, ground, calm), amber 100/200/700 (sun, money, warnings), green 50/700 (done) |
| Stroke | 2–3 units at the Hero viewBox scale, round caps and joins |
| Light | Flat fills, no gradients, no shadows, no textures |
| Setting | Florida low-rise: sun, a palm or two, teal ground band, intact building |
| The empty thing | Dashed outline in sand-300 on sand-100; the *next* one is filled coral with a white ✚ |
| Done | A green-700 disc with a white check |
| People | None for now (faces date fast and raise representation questions); hands holding a phone or clipboard are fine |
| Never | Damage, storms in progress, alarm colours as decoration, emoji, gradients, sparkle confetti |

### 5.3 The kit (build these first)

**Landscape:** ground band, sun, cloud (2 sizes), palm (2 poses), building
(low-rise, 1–3 floors, window grid), door.
**Props:** filing drawer, folder, document, sealed deed, coin stack, bar chart,
calendar, clock, clipboard, megaphone, bell, key, shield, wrench, package,
pool ladder, envelope, phone, gavel, people-seat (chair), checklist.
**Marks:** ✚ coral disc, ✓ green disc, progress ring.

A new screen composes existing parts plus at most one new prop. If a screen needs
two new props, the screen is probably two states.

## 6. Layout, spacing and type

Redlines for all of this are on the canvas board "System · Redlines". Sizes below
are **rendered values with large text on**, which is the product default
(`.large-text`, `packages/ui/src/styles/tokens.css`). Drawing at standard size
understates every text block by one step.

### 6.0 Spacing

**One inset.** Every band inside the setup card (hero text, rail, main, context)
starts 24px (`space-6`) from the card edge, 16px (`space-4`) below `md`. The rail's
first marker has no padding of its own, so it lines up with the hero title.

**Distance means relationship.** Only these values, from `packages/tokens/src/static.ts`:

| Value | Token | Use |
|---|---|---|
| 4 | `space-1` | Tight: eyebrow→title, label→value, title→meta |
| 8 | `space-2` | Related: title→body, icon→label, chips in a row, button groups |
| 12 | `space-3` | Siblings in a grid (slot cards); rail vertical padding |
| 16 | `space-4` | Blocks inside a section; card and slot padding |
| 24 | `space-6` | New group or section; page and band inset; main/context padding |
| 32 | `space-8` | Hero vertical padding; between context-column sections |
| 48 | `space-12` | Page-level regions only |

No 6, 10, 14, 18 or 28. The 2026-11-11 boards used 14 distinct values; the system uses 7.

### 6.1 Type

Five sizes per view:

| Rendered | Token | Use |
|---|---|---|
| 28 / 1.2 | `text-2xl` semibold, `-0.01em` | Hero title (`h2`) |
| 20 / 1.3 | `text-lg` semibold | Step title (`h3`) |
| 18 / 1.55 | `text-base` | Hero lead, max 60ch |
| 16 / 1.5 | `text-sm` | UI body, buttons, slot titles, context headings |
| 14 / 1.5 | `text-xs` | Meta, eyebrows, captions. **The floor**; nothing smaller. |

Eyebrows are sentence case, `text-xs` medium, `--text-secondary` (tracked uppercase
at 14px reads as shouting). Counts use `tabular-nums`. Legal text is `text-sm`,
max 75ch.

### 6.2 Components and colour

| Thing | Value |
|---|---|
| Setup card | `Card`: radius md, 1px `--border-default`, E0. Hero grid 7/5; body grid 8/4 split by a 1px divider. One container level: the context column holds sections and rows, never cards. |
| Hero | Text on `--surface-card`; art on a teal-50 panel that bleeds to the card's right and bottom edges. Below `md` the art drops under the text at Section size. |
| Fact chip | min-height 32, padding 0 12, radius full, 1px border, neutral |
| Static chip | min-height 24, padding 0 8, radius full, 1px border. Conditional items sit after a text label "If it applies:" and use a dashed border. |
| Rail step | `<button>` min-height 32 (44 below `md`), 24px marker, 8px gap, 24px hairline between steps |
| Slot | min-height 72, padding 16, radius md, 1px dashed `--border-strong`; 40px icon tile radius sm on `--surface-muted`. Next slot: 1px coral border, coral tile with white ✚. |
| Rows (later steps, help, who sees what) | min-height 56, padding 12 0, 1px `--border-default` between |
| Buttons | `Button` primitive. 32px from `md`, 44px below. Never a fixed height. One coral `default` per region. |
| Radius | md (8) for cards, slots, panels; sm (6) for icon tiles and inputs; full for chips and markers. Nothing else. |

**Neutral chrome, one accent** (decided 2026-11-11):

| Colour | Only for |
|---|---|
| coral-600 | The primary button, the current-step marker, the next slot's tile and border |
| coral-700 | Links and accent text |
| green-700 | Done markers and "fills" ticks |
| amber-50 / amber-200 | The legal callout |
| teal-50 | The illustration panel |
| coral-500 | Focus ring: 2px, 2px offset, `:focus-visible` only (3.57–3.93:1 on sand surfaces) |

Everything else is sand surfaces with gray-900 / gray-600 text. Icon tiles are
neutral. gray-500 is never used on a tinted surface (fails AA on sand-100, coral-50
and teal-50).

### 6.3 Accessibility semantics

| Element | Markup |
|---|---|
| Hero | `<section aria-labelledby>` with the `h2`; scene `aria-hidden="true"` |
| Progress | Text ("0 of 13 required posted") beside a decorative ring |
| Step rail | `<nav aria-label="Setup steps"><ol>`; each step a `<button>`; current has `aria-current="step"`; each carries visually hidden status text ("Completed:", "Current step:", "Not started:"). A dependency uses `aria-disabled="true"` plus hidden text saying why, so it stays focusable and explains itself. |
| Current step | `h3` |
| Slots | `<ul aria-label>` of `<li>`; one `<button aria-label="Add file: <record>" aria-describedby="<tag id>">`. The accessible name contains the visible title (WCAG 2.5.3). Conditional slots add a second button "Doesn't apply to us: <record>". |
| Later steps | `<button aria-expanded="false" aria-controls>` disclosure per step, title + chips + count inside |
| Context sections | `<section aria-labelledby>` with an `h3` (not a styled `<p>`) |
| Scrolling previews (CSV, tables) | `role="region" aria-label tabindex="0"` so keyboard users can scroll them; `<th scope="col">` |
| Legal notice | `role="note"`, not `alert` |
| Uploads | `aria-live="polite"`: "Declaration posted. 1 of 13 required." |
| Targets | 44px below `md`, 32px above; rows 56px |
| Text spacing | min-height only, never a fixed height on anything holding text (WCAG 1.4.12) |
| Reflow | No horizontal page scroll at 320px; only the named scroll regions scroll |

Tab order follows the visual order: rail, main column top to bottom, then the
context column. Chips, previews and illustrations take no focus.

## 7. Copy

| Slot | Rule | Example |
|---|---|---|
| Eyebrow | What the page is | Owner portal records |
| Title | The outcome, not the absence | Post the records owners can see |
| Body | Why it matters + what will appear here | Florida asks condo associations with 25+ units to post these. Add a file to any slot and it's filed and counted. |
| Progress | Applicable items only | 4 of 13 posted |
| Step title | Verb + object | Upload your governing documents |
| CTA | Verb-first, specific | Upload the Declaration |
| Waiting title | What will appear, and who puts it there | Documents your association posts appear here |
| All clear | Good news, plain | Nothing needs a signature |
| No results | Name the filter | No documents in Financials match "budget". Clear filters |

Never: "No data", "Nothing here", "Oops", exclamation marks on compliance pages,
unmeasured time claims ("takes a minute").

## 8. Rollout inventory

Measured 2026-11-11: 44 files render `<EmptyState>`, 33 presets in
`empty-states.ts`, 8 tables pass `emptyMessage`, and 40+ ad-hoc "No … yet" strings.

| Size | Surfaces (first pass) |
|---|---|
| **Hero · Setup** | Documents, Leases & units, Residents, Meetings, Announcements, Compliance, E-sign (requests, templates), Storm Damage, Insurance (master policy, wind mitigation), Amenities, Vendors, Assessments, PM Communities |
| **Hero · Waiting** | The resident side of each page above that residents can open |
| **Section** | Board polls / forum / elections, meeting minutes, ARC requests, join requests, operations hub, directory, reserves transparency, audit trail |
| **Compact** | Dashboard widgets (meetings, announcements, violations, e-sign pending, overview activity/events), notification dropdown, upload queue, every `DataTable` `emptyMessage` |
| **All clear** | No violations, no e-sign pending/waiting, action-required clear, no open maintenance |

Order of work: kit parts → `EmptyState` gains `size` + `illustration` + `state` →
`SetupGuide` (rail + steps + slots + partial bar) → Documents (all three types) →
Leases & units → Storm Damage → the remaining Hero pages → Section → Compact sweep
of ad-hoc strings.

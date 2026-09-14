# Responsive and text-overflow audit — apps/web

**Date:** 2026-09-14 · **Branch:** `claude/web-responsiveness-text-overflow-f3rlhl` ·
**Predecessor:** #1129 (`17e5772`), which fixed three screens and named the cause.

## The one-paragraph version

The app has a single structural defect and everything below is a symptom of it. The
authenticated sidebar is a static flex sibling that **pushes** (`app-shell.tsx:180`,
`NavRail w-[260px]`), and it appears at `lg:` — so at exactly 1024px the content column drops
from ~959px to 684px **while every `lg:` layout in the app switches on**. `lg:` is the most
dangerous breakpoint in this codebase and it is used 33 times to *widen* a grid. Below that,
nothing had ever been measured at all: the gate floored at 768px, and all three Playwright
configs run one project at 1280×720.

Nine measured defects are fixed here, one latent hazard was closed with them, and seven
findings are left open with their numbers. The floor is now 375px.

## What was measured, and what was not

| Tier | Method | Coverage | Confidence |
|---|---|---|---|
| **A** | Real production build on `:3100`, real Chromium, 6 viewports | **18 routes × 6 widths = 108 measurements**, 0 errors | Full |
| **B** | Real component DOM (rendered through the jsdom test project with worst-case fixtures) measured in Chromium against the build's own CSS, inside a replica of the shell's geometry | **9 surfaces × 6 widths** | CSS geometry only — see caveat |
| **C** | Static enumeration | The remainder | Candidates, not defects |

Viewports: **375 / 414 / 768 / 1024 / 1280 / 1440**. Phone widths run with
`isMobile`/`hasTouch`. The resulting content column, which is the number that actually
matters, is **327 / 366 / 704 / 684 / 940 / 1100** — note that 1024 is *narrower* than 768.

**Tier B caveat:** static markup does not hydrate, so `useMediaQuery` returns its SSR default
and JS-driven responsive behaviour is not exercised. Tier B proves CSS geometry. It also
cannot show the `Table` primitive's conditional tab stop, which is set by an effect that
measures real layout.

**Not measured, and why.** 95 authenticated pages and 24 admin pages cannot be rendered in
this container: no Docker daemon, no Supabase CLI, no `.env.local`. Tier B substitutes for
nine of them. The rest are listed in *Unmeasured register* below. `/mobile/**` is out of
scope per `.claude/rules/design.md:86-89`.

**Two measurement traps, recorded because each one produced a confidently wrong answer before
it was caught.** Without a `<meta name="viewport">`, Chromium's mobile emulation falls back to
a **980px** layout viewport — the first Tier B run therefore reported a 916px content column
at a 375px viewport and found nothing. And `pkill -f 'next start'` does not kill the server:
the process renames itself to `next-server`, so the verification run after the rebuild was
answered by the *old* server, which served a manifest whose CSS files the rebuild had
replaced. It returned **400 for two of its own stylesheets**, the marketing theme never
applied, images rendered at intrinsic size, and the run reported bleeds going 19 → 46 — a
spectacular regression that did not exist. `curl` returning 200 was what made it look fine.
Every number here is from after both were fixed.

## Fixed in this PR

Each was measured before and after. The "before" measurement is the revert-check: the defect
is present with the original line and absent with the new one, at the widths named.

| # | Surface | Measured defect | Fix |
|---|---|---|---|
| 1 | `(marketing)/transparency/page.tsx` | **The page scrolls sideways on every phone** — `documentElement.scrollWidth` 470 against a 375 viewport. Two independent causes: a `display:grid` with no explicit track (the implicit `auto` column floors at the card's min-content, 434px) and a 45-character hostname in an `inline-flex` pill with no cap. | `gridTemplateColumns: minmax(0, 1fr)` + `maxWidth: 100%` / `overflowWrap: anywhere`. **470 → 320/375/414 exactly, at all three widths.** |
| 2 | `finance/recent-payments.tsx` | 490px table in a 325px box, wrapper is `overflow-hidden`, **no scroller** — 165px of an owner-facing payments table clipped with no scrollbar and no tab stop. | Route through `@/components/ui/table`. 1 → 0 unscrolled bleeds. |
| 3 | `emergency/BroadcastHistoryTable.tsx` | Same shape, 518px in 325px — **193px unreachable** on the screen most likely to be opened on a phone. | Same. 1 → 0. |
| 4 | `contracts/BidTracker.tsx` | 437px table with **no wrapper at all**; bleeds 110px out of its card. | Same. 2 → 0. |
| 5 | `contracts/ContractTable.tsx` | 1552px table at *every* viewport. It has a scroller, but `tabIndex` is -1, so seven `whitespace-nowrap` columns of vendor and contract data are **unreachable by keyboard** (WCAG 2.1.1). | Same — the primitive's tab stop is conditional and re-measured every render. The now-dead hand-rolled scroller was removed. |
| 6 | `emergency/DeliveryReport.tsx` | Unprefixed `grid-cols-4`: each stat box is 68px at 375px and the count inside needs 60px in a 44px slot. 6 overflowing boxes. | `grid-cols-2 sm:grid-cols-4`. 6 → 0. |
| 7 | `packages/ui/.../quick-filter-tabs.tsx` | `flex` with no wrap and no scroller: five tabs measure 529px in a 327px column — **202px of filters off-screen with no way to reach them**. Shared by five screens. | `flex-wrap`. 1 → 0. Chosen over a scroller because a scroller would need its own tab stop and wrapping needs nothing. |
| 8 | `(marketing)/marketing-theme.css` `.mk-srow` | Monospace statute citations spill out of a 73px grid column on the home page — 7 overflowing boxes at 375px. | `overflow-wrap: anywhere` on `small`/`b`. 7 → 0. |
| 9 | `finance/finance-kpi-row.tsx` | **The cliff, in its purest form.** `sm:grid-cols-2 lg:grid-cols-4` with currency values: at 1024px each card is 159px while the value needs 173px — 6 overflowing boxes; at 1152px, 4; at 1280px, 0. The row breaks *only* in the 1024–1279 band, which is where `lg:` fires. | `xl:grid-cols-4`. Measured 0 at every width, and identical to `lg:` from 1280px up — it costs nothing above the band it fixes. |
| 10 | `units/units-page-client.tsx` | Latent, not demonstrated: the table fits at 325px today because all three columns wrap, but the `overflow-hidden` wrapper means any added column or `nowrap` cell clips silently. | Routed through the primitive with the rest. |

## End-to-end verification

Tier A was re-run against a **fresh production build** of the fixed source (`pnpm build`,
5m14s, exit 0), on a clean server, cache disabled:

| | before | after |
|---|---|---|
| Public pages that scroll horizontally | 2 | **0** |
| Element bleeds across 108 measurements | 19 | **6** |

The six that remain are both known and both on the home page: `.mk-reck > .mk-mark` (finding
5 below — `width: max-content` inside a `max-width: 24ch` block, overflowing into empty space,
+56px at every width ≥768) and `.mk-sec-l` at 1024px only (+22 and +15) — the sticky section
column, pre-existing and unchanged by this work.

Unit suite: **1190 files, 14142 tests, 0 failures** (454s). `pnpm typecheck` clean.
`pnpm lint` green, 31/31 guards.

## Open findings, ranked

1. **`lg:` is used 33 times to widen a grid; `xl:` 6 times.** This is the systemic exposure.
   Finding #9 is one instance, measured and fixed; three more share its exact shape inside the
   shell and were not measured: `compliance-command-center.tsx:203,229` (`lg:grid-cols-4` ×2),
   `dashboard/apartment-metrics.tsx:56` (`lg:grid-cols-4`), and
   `transparency/minutes-availability-grid.tsx:48` (**`lg:grid-cols-6`** — six columns in a
   684px box is 114px each). *Recommended rule: inside the authenticated shell, `lg:` may
   never increase a column count. Use `xl:`.*
2. **`packages/ui` `KpiCard` has no `min-w-0` on its title and no wrap strategy on its value**
   (`kpi-card.tsx:82,89`). Measured: `$1,284,500.00` needs 173px in a 109px box. Not fixed
   here because the remedy — truncate, shrink the type, or wrap — changes card height on every
   dashboard, and that is a design decision rather than a bug fix.
3. **Touch targets.** At 375px, **16 of 18 public routes** carry controls below the 44px
   `DESIGN.md:207` minimum. The systemic one is the marketing nav and footer link list
   (22.5px, on 10 routes). The ones that matter individually: form inputs at 41.6px
   (`/signup`, `/auth/login`, `/auth/forgot-password`), a **16px** control on `/signup`, the
   `Sign In` button at 39.6px, and `support@getpropertypro.com` at 17px on `/contact`. In the
   authenticated surfaces: `QuickFilterTabs` 32px, and `Edit`/`Bids`/`Close` buttons at
   **21.9px** in the contracts screens.
   **This is a policy contradiction, not simply a bug.** `DESIGN.md:207` requires 44px below
   768px; `design.md:164` specifies buttons at 32/36/40px. Both cannot hold. Someone has to
   decide which governs before this can be enforced.
4. **Eleven raw `<table>` elements remain**, now frozen shrink-only in
   `scripts/responsive-geometry-baseline.json`, which explains which are deliberate. Drain
   `finance/payment-portal.tsx` first: 11 `whitespace-nowrap` cells, two tables, no tab stop,
   owner-facing money.
5. **`.mk-sec-l`** (home page, 1024px only) overflows its sticky section column by 22px and
   15px. Pre-existing, unchanged, and the last unexplained bleed on the public surface.
6. **`.mk-reck > .mk-mark`** (home page) is `width: max-content` inside a `max-width: 24ch`
   parent and measures 298px in a 242px box at every width ≥768. Nothing is clipped and
   nothing collides — it overflows into empty space — so it is latent, not a defect. It is
   recorded because it *will* bleed the moment that block sits in a constrained column, and
   because it is the class of finding that makes a naive overflow gate red for no reason.
7. **`shell-breadcrumbs.tsx:141`** uses `px-6 py-2 lg:px-8` where `PAGE_GUTTER_X` is
   `px-6 sm:px-8 lg:px-10`, so the trail is misaligned with page content from 640px up.

## Unmeasured register

Everything the tiers did not reach, so the report's silence is bounded:

- **95 authenticated + 24 admin pages** — no DB in this container. Nine surfaces were
  substituted via Tier B.
- **59 hard `w-[Npx]` / `min-w-[Npx]`**; the narrow-hostile ones are
  `help/help-docs-modal.tsx:237` (`h-[85vh] w-[440px]`), `storm-damage-section.tsx:105`
  (`SelectTrigger w-[180px]`), `visitors/VisitorQRCode.tsx:63` (`200px` square).
- **`packages/ui/.../sheet.tsx:41-43`** — `left`/`right` are `w-3/4 sm:max-w-sm`, ~186px of
  usable content at 320px, and `WorkOrderCreateSheet`/`ReservationCreateSheet` put unprefixed
  two-column form grids inside it. `top`/`bottom` have no `max-h` and no scroll container.
  (`Dialog`, by contrast, is already correct: `w-[calc(100vw-2rem)]` with `sm:`-prefixed caps.)
- **45 `whitespace-nowrap`**, ~30 of them on user-supplied strings.
- **23 files** use `truncate` with no `min-w-0` anywhere in the file.
- **Nine of ten `DataTable` consumers declare no `meta.hideBelow`** — the mechanism
  (`data-table-types.ts:37-65`) exists and only `documents-table.tsx` uses it. There is no
  card-stacking fallback in the shared table at all; four files hand-roll one.
- Defensive idioms appear in **114 of 693 `.tsx` files (16%)**. `insurance`, `leases`,
  `operations`, `reserves`, `storm-damage`, `move-checklists` and `auth` have none.

## What changed in the gates

- **`pnpm guard:responsive-geometry`** (new, guard 31 of 31). One rule: no raw `<table>`
  outside `apps/web/src/components/ui/table.tsx`. Objective, no layout inference. Verified
  four ways — clean on the repo, exit 1 on an injected violation, released by the
  `// responsive-geometry:exempt — <reason>` hatch, exit 2 when a search root is missing, and
  exit 1 against the pre-fix tree (it names all six files this PR drained).
  Deliberately **not** added: rules for unprefixed `grid-cols-N` and `truncate`-without-
  `min-w-0`. Both infer layout from text — `grid-cols-7` in a calendar is correct, and
  `min-w-0` legitimately sits on an ancestor in another file. This repo has already shipped a
  guard that answers confidently and wrongly (`08d0265`). Geometry claims belong in a browser.
- **`responsive-overflow.spec.ts`**: floor 768 → **375**, viewport list 4 → 6, and a fifth
  route block for `/communities/[id]/payments` (which carries findings #2 and #9).
  `expectedTestCount` 36 → 37. Both new widths were measured offline against the compliance
  queue before being added — its #1129 scroller holds at 375 (584px table in a 325px box, zero
  unscrolled bleeds) — rather than added on the hope that they pass.

## Recommendations

1. **Declare a minimum supported viewport.** This audit assumed **375px**. Nothing in the repo
   states one, which is why the gate could sit at 768 for a year without anyone disagreeing.
2. **Resolve the 44px-vs-32px contradiction** before anyone tries to enforce touch targets.
3. **Adopt "`lg:` never widens"** as a written rule, and drain the four `lg:grid-cols-4`/`-6`
   sites inside the shell.
4. **The real fix is container queries.** Every finding here is a symptom of breakpoints keyed
   to the viewport when the thing that varies is the content column. `@container` on
   `PageContainer` would let page content respond to the box it is actually in, and would
   delete the entire class of defect rather than patching instances of it. That is a
   multi-week migration and is out of scope for this pass — but every future patch in this
   area is interest paid on not doing it.

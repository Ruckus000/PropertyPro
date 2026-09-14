# Responsive and text-overflow audit — apps/web

**Date:** 2026-09-14 · **Branch:** `claude/web-responsiveness-text-overflow-f3rlhl`
**Predecessor:** #1129 (`17e5772`), which fixed three screens and named the cause.

> **This document was rewritten after its first version was wrong.** That version said 95
> authenticated pages "cannot be rendered in this container" and reported 18 routes. Both are
> superseded: a local stack was built (below), **93 of the 95 were rendered**, and the numbers here
> come from 558 measurements rather than 108. The first version's route findings were not false,
> but they were a tenth of the picture.

## The one-paragraph version

The app has one structural defect and most of what follows is a symptom. The authenticated sidebar
is a static flex sibling that **pushes** (`app-shell.tsx:180`, `NavRail w-[260px]`), and it appears
at `lg:` — so at exactly 1024px the content column drops from ~959px to 684px **while every `lg:`
layout switches on**. `lg:` is used 33 times to widen a grid; `xl:` six times. Measured across every
authenticated page: **9 of 75 bleed**, overwhelmingly below 768px. The larger problem is not
overflow at all — it is touch targets, where **53 of 65 pages** carry a control under the 44px
minimum at phone widths, and **about half still fail the looser 36px desktop floor**.

## What was measured

93 authenticated routes × 6 viewports (375 / 414 / 768 / 1024 / 1280 / 1440) against a **production
build**, driven through real Chromium with the seeded demo dataset. **558 measurements, 542 usable
(97%)**. Those 93 routes render **75 distinct pages**: 31 of them are server redirects — `/welcome`,
`/settings/roles` and `/pm/dashboard/[id]` all land on `/dashboard`, `/meetings` on
`/communities/[id]/meetings` — so they were never measured as themselves. Everything below counts
pages actually rendered, not routes requested; the 16 gaps are noted below. Phone widths run with `isMobile`/`hasTouch`. Content column at
375px is **327px** — viewport minus `PageContainer`'s `px-6` gutter; at 1024px it is **684px**,
narrower than at 768px, because that is where the rail appears.

**How the authenticated app was rendered here.** No Docker daemon was running and image blobs are
blocked by the network policy, so `supabase start` was impossible. Instead: `postgresql-16` from
apt, the repo's own `scripts/local-test-db.sh` for migrations, `pnpm seed:demo`, a loopback-only
`.env.local` symlinked by `scripts/setup.sh`, and a **local stand-in for Supabase Auth and Storage**
serving the handful of endpoints the app calls, backed by the real `auth.users` table.

That stand-in is **deliberately not in this repo**. It issues unsigned tokens and verifies nothing;
in a codebase whose rules are emphatic about auth safety, a committed fake auth server is a footgun
that eventually gets pointed at something real. It is reproducible from this description. Auth
contributes nothing to CSS geometry — it only decides whether a page renders at all — so no finding
below depends on it being faithful.

**Limits, stated plainly.** Every route-level number depends on the seeded dataset matching CI's; a
longer record title moves a marginal result. CI's e2e job runs `pnpm dev:e2e`, a **dev** server, so
production measurements predict the gate by inference, not observation.

## The detector was wrong, and six findings were phantom

`findOverflows` asked `scrollWidth > clientWidth`. An element's `scrollWidth` includes layout
overflow from content inside a **descendant** scroll container, so every ancestor of a working
horizontal scroller was reported as overflowing by that content's full width:

```
/communities/[id]/compliance @375px, where #1129's scroller works as designed:
  PageContainer                    client 375   scrollWidth 784   ← called a "+409 bleed"
  the table's scroller             client 325   scrollWidth 771   tabIndex 0
  PageContainer, scroller hidden   client 375   scrollWidth 375
  elements actually sticking out   0
```

Fixed in `fe9e9cb` by comparing box edges instead — does an element's right edge exceed its parent's
content-box edge, with no ancestor scrolling it. The rule got *smaller*: three conditions that
existed only to paper over `scrollWidth` were deleted. It now lives in `e2e/helpers/overflow.ts` so
it can be tested on its own, and the audit and the gate share one implementation.

**20 flagged routes became 14.** Removed as false positives: `compliance` (+409),
`meetings/[id]/minutes/author` (+234), `communities/[id]/residents` and `dashboard/residents` (+52),
`pm/dashboard/communities` and `…/new` (+21). All six were ancestors of legitimate scrollers.

## Pages that bleed (9 of 75)

Deduplicated by the page actually rendered. `/welcome`, `/settings/roles` and `/pm/dashboard/[id]`
do not appear because they redirect to `/dashboard`; `/meetings` and `/esign/submissions` because
they redirect to the two pages listed.

Measured before, and again after the fixes, on a production build at each width.

| page | before (375 / 414 / 768 / 1024 / 1280 / 1440) | after | outcome |
|---|---|---|---|
| `/communities/[id]/meetings` | 119 / 80 / **186** / **189** / **152** / **129** | 14 / 10 / 0 / 0 / 0 / 0 | desktop clean; +14 left at phone widths |
| `/esign/templates/[id]` | 181 / 142 / · / · / · / · | 11 / 2 / · / · / · / · | reduced 94%; +11 left |
| `/settings/transparency` | 138 / 99 / · / · / · / · | 0 | **clean** |
| `/audit-trail` | 61 / 22 / · / · / · / · | 0 | **clean** |
| `/emergency/new` | 46 / 7 / · / · / · / · | 0 | **clean** |
| `/dashboard` | 43 / 4 / · / **40** / · / · | 0 | **clean** |
| `/esign/submissions/[id]` | · / · / · / 18 / · / · | — | left, below the cut |
| `/announcements/new` | 13 / · / · / · / · / · | — | left, below the cut |
| `/esign` | · / · / 4 / 4 / · / · | — | left, below the cut |

The two residuals are separate elements that were already on the below-cut list: meetings' +14 is a
`md:hidden` label, and esign's +11 is a badge row. Neither is what the fix targeted.

**Meetings was the only page broken at every width**, including 1440px. The cause took two attempts
and the first was wrong in an instructive way. `truncate` without `min-w-0` looked like the answer —
it is a real anti-pattern and the class was genuinely absent — but adding it changed the measurement
by **zero pixels**, because `truncate` sets `overflow:hidden`, which already gives an element
automatic minimum size 0. The class was a no-op and has been removed.

The actual constraint was one level up: the pill's `<span>` was `inline-flex`, an *inline-level* box,
so it shrink-to-fits and overflows its 66px container rather than being bounded by it — the title sat
at its full 219px and the ellipsis never engaged. `flex` makes it block-level and sized by the
container. Measured at 1024px: title 219px → 41px and visibly ellipsised, page +189 → 0.

The three left alone are +18, +13 and +4 — the last is ~1% of a 327px column, and is caused by a
`-mx-1` negative margin rather than by anything failing to shrink.

The recurring shape in nearly all of these is the same one already fixed twice in this branch: a
horizontal flex row whose children cannot shrink and whose container cannot wrap —
`div.flex.items-center.gap-2 > button`, `> span`, `> div.min-w-[11rem]`. `/dashboard` at 1024px is
the `lg:` cliff in miniature: an action button that fits at every other width.

## Touch targets — the larger finding

Measured in real px, never by class name: the 18px root makes `h-8` render 36px.

| viewport | floor (`DESIGN.md:207`) | pages affected | distinct controls |
|---|---|---|---|
| 375 / 414 | 44px | **53 of 65** | 190 |
| 768 / 1024 | 36px | **29 of 65** | 96 |
| 1280 / 1440 | 36px | **30 of 65** | 97 |

Half the app misses the rule **even at desktop widths against the looser threshold**. The smallest
control measured is a **13px input**, on 5 routes. The most widespread are the payments tab triggers
at 31.6px (5–6 routes each) and the rich-text toolbar at 36px.

**This is a policy contradiction before it is a bug.** `DESIGN.md:207` requires 44px below 768px;
`design.md:164` specifies buttons at 32/36/40px. Both cannot hold. Nothing can be enforced until
someone picks, and that is a product decision, not an engineering one.

## Fixed in this branch, each measured before and after

| | |
|---|---|
| `/transparency` scrolled sideways on **every phone** (470px doc in a 375px viewport, two independent causes) | 470 → 320/375/414 exactly |
| `recent-payments`, `BroadcastHistoryTable`, `BidTracker` clipped 165/193/110px with no scrollbar and no tab stop | routed through the `Table` primitive; 0 |
| `ContractTable` 1552px table, scroller present but `tabIndex -1` — keyboard-unreachable (WCAG 2.1.1) | conditional tab stop from the primitive |
| `QuickFilterTabs` — 5 tabs at 529px in a 327px column, no wrap, no scroller (5 screens) | `flex-wrap`; 0 |
| `TabsList` — same defect in the shadcn primitive, 8 consumers | `flex-wrap`; `/pm/reports` +242 → 0, `payments` +96 → 0 |
| notifications category chips, 654px in 327px — the worst single bleed | `flex-wrap`; 0 |
| `FinanceKpiRow` `lg:grid-cols-4` — 6 overflowing boxes at 1024, 4 at 1152, 0 at 1280 | `xl:grid-cols-4`; identical above 1280, so it costs nothing |
| `DeliveryReport` unprefixed `grid-cols-4` — 44px per count needing 60 | `grid-cols-2 sm:grid-cols-4` |

## Gates

- **`pnpm guard:responsive-geometry`** (31st guard, `d1c34ea`). One rule: no raw `<table>` outside
  the primitive. Deliberately *not* rules for unprefixed `grid-cols-N` or `truncate`-without-
  `min-w-0` — both infer layout from text, and this repo already shipped a guard that "answers
  confidently and wrongly" (`08d0265`). 11 remaining tables are frozen shrink-only.

  The meetings fix is direct evidence for that exclusion, and it cuts the opposite way to what it
  first looked like. Meetings *was* a `truncate` with no `min-w-0`, so the rejected rule would have
  flagged it — and the flag would have been **wrong**. `truncate` sets `overflow:hidden`, which
  already gives automatic minimum size 0, so adding `min-w-0` moved the measurement by zero pixels.
  A guard enforcing that rule would have sent someone to add a no-op class and close the ticket,
  while the real cause — an `inline-flex` box that shrink-to-fits out of its container — sat one
  level up, untouched. A static rule that names a real anti-pattern can still point at the wrong
  line.
- **`responsive-overflow.spec.ts`** floor 768 → 375, four widths → six, plus a `payments` block.
  With the corrected detector **all 24 gated blocks pass** on a production build. Under the old
  detector three would have failed on compliance — at 768 and 1024, widths gated since #1129, on a
  screen with nothing wrong with it.

## Unmeasured

**Everything was measured as one role: `cam` (property manager) in community 1.** The redirects show
what that costs — `/settings/roles` bounces to `/dashboard` because a property manager is not a root
manager, so `RolesAccessClient` never rendered, and neither did `/welcome`'s `WelcomeScreen`.
Root-exclusive and resident-only surfaces are entirely unmeasured. Re-running as `root_sunset` and
`owner` would be the cheapest way to widen coverage, and the harness supports it today.

16 of 558 measurements (2.9%) did not complete, all `Execution context was destroyed` — Next's RSC
refresh re-navigating during measurement. 2 of 95 authenticated pages were skipped for want of seed
rows (`board/forum/[threadId]`, `maintenance/[id]`). `apps/admin` (24 pages) was not measured.
`/mobile/**` is out of scope per `.claude/rules/design.md:86-89`.

Not measured but enumerated: 59 hard `w-[Npx]`; `sheet.tsx`'s `w-3/4 sm:max-w-sm` left/right panels
(~186px usable at 320px) containing unprefixed two-column form grids; 45 `whitespace-nowrap`, ~30 on
user strings; 9 of 10 `DataTable` consumers declaring no `meta.hideBelow`.

## Recommendations

1. **Declare a minimum supported viewport.** This audit assumed 375px. Nothing states one, which is
   how the gate sat at 768px for a year without anyone disagreeing.
2. **Resolve 44px vs 32/36/40px** before anyone tries to enforce touch targets.
3. **Treat `lg:` with suspicion inside the shell — but only where content cannot shrink.** The
   concern is real: `lg:` is the pixel the rail appears, so a grid that widens there gets a
   *narrower* column. It cost `FinanceKpiRow` six overflowing boxes at 1024px, fixed by moving to
   `xl:`. An earlier draft of this document recommended draining the other three
   `lg:grid-cols-4`/`-6` sites on that pattern alone. **Measurement says leave them:**
   `compliance-command-center`, `dashboard/apartment-metrics` and `minutes-availability-grid` are
   clean at all six widths, because counts and percentages fit in 159px where currency does not.
4. **Fix meetings first** — the only route broken at all six widths.
5. **The real fix is container queries.** Every finding here is a breakpoint keyed to the viewport
   when the thing that varies is the content column. `@container` on `PageContainer` would delete
   the class rather than patch instances. Out of scope here; every future patch is interest on it.

## Appendix — six harness bugs, because they cost more than the findings

Each was precise, reproducible, and wrong. This is the transferable part of the exercise.

1. **No `<meta viewport>`** — Chromium's mobile emulation falls back to a 980px layout viewport. The
   first component harness reported a 916px content column at 375px and found nothing.
2. **`pkill -f 'next start'` misses the server** — it renames itself to `next-server`. A
   post-rebuild run was answered by the stale server, which 400'd its own stylesheets; with no CSS,
   images rendered at intrinsic size and the run reported bleeds going 19 → 46. `curl` returning 200
   is what made it look fine.
3. **Next's RSC double-navigation** destroyed the execution context mid-measure — 317/558 errors
   that read as the app falling over. Diagnosed only after instrumenting `framenavigated`; two
   prior theories (session expiry, rate limiting) were both wrong, and bypassing the rate limiter
   made it *worse*.
4. **`scrollWidth` counts a descendant scroller's content** — the six phantom routes above.
5. **Elements in a `display:none` subtree** report their own `display` normally while every rect is
   all-zero, so subtracting the parent's padding gives a negative content edge and a child's 0
   "overflows" it. Three phantom findings on `documents` at +24/+33px.
6. **Recording the route requested rather than the page landed on.** 31 of 93 routes redirect, so
   one page appeared as four table rows with byte-identical numbers — which read as a shared
   component with a shared bug. It is not: `/dashboard` was simply measured four times. Found while
   planning the fix for bug 4.

The pattern: a measurement that is precise and reproducible still is not valid. Four of the five
were caught only by deliberately breaking something and checking that the harness noticed.

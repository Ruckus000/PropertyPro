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
authenticated route: **14 of 91 bleed**, overwhelmingly below 768px. The larger problem is not
overflow at all — it is touch targets, where **74 of 91 routes** carry a control under the 44px
minimum at phone widths, and **about half still fail the looser 36px desktop floor**.

## What was measured

93 authenticated routes × 6 viewports (375 / 414 / 768 / 1024 / 1280 / 1440) against a **production
build**, driven through real Chromium with the seeded demo dataset. **558 measurements, 542 usable
(97%)**; the 16 gaps are noted below. Phone widths run with `isMobile`/`hasTouch`. Content column at
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

## Routes that bleed (14 of 91)

| route | 375 | 414 | 768 | 1024 | 1280 | 1440 |
|---|---:|---:|---:|---:|---:|---:|
| `/meetings`, `/communities/[id]/meetings` | +119 | +80 | **+186** | **+189** | **+152** | **+129** |
| `/esign/templates/[id]` | +181 | +142 | · | · | · | · |
| `/settings/transparency` | +138 | +99 | · | · | · | · |
| `/audit-trail` | +61 | +22 | · | · | · | · |
| `/emergency/new` | +46 | +7 | · | · | · | · |
| `/dashboard` | +43 | +4 | · | **+40** | · | · |
| `/welcome`, `/pm/dashboard/[id]`, `/settings/roles` | +43 | +4 | · | +40 | · | · |
| `/esign/submissions/[id]` | · | · | · | +18 | · | · |
| `/announcements/new` | +13 | · | · | · | · | · |
| `/esign`, `/esign/submissions` | · | · | +4 | +4 | · | · |

**Meetings is the only route broken at every width** and should be fixed first: a badge
(`span.inline-flex.items-center.gap-1.5`) inside a non-shrinking `flex items-center gap-2` row.

The recurring shape in nearly all of these is the same one already fixed twice in this branch: a
horizontal flex row whose children cannot shrink and whose container cannot wrap —
`div.flex.items-center.gap-2 > button`, `> span`, `> div.min-w-[11rem]`. `/dashboard` at 1024px is
the `lg:` cliff in miniature: an action button that fits at every other width.

## Touch targets — the larger finding

Measured in real px, never by class name: the 18px root makes `h-8` render 36px.

| viewport | floor (`DESIGN.md:207`) | routes affected | distinct controls |
|---|---|---|---|
| 375 / 414 | 44px | **74 of 91** | 192 |
| 768 / 1024 | 36px | **47 of 89** | 97 |
| 1280 / 1440 | 36px | **50 of 91** | 99 |

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
- **`responsive-overflow.spec.ts`** floor 768 → 375, four widths → six, plus a `payments` block.
  With the corrected detector **all 24 gated blocks pass** on a production build. Under the old
  detector three would have failed on compliance — at 768 and 1024, widths gated since #1129, on a
  screen with nothing wrong with it.

## Unmeasured

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
3. **Adopt "`lg:` never widens"** inside the shell, and drain the four `lg:grid-cols-4`/`-6` sites.
4. **Fix meetings first** — the only route broken at all six widths.
5. **The real fix is container queries.** Every finding here is a breakpoint keyed to the viewport
   when the thing that varies is the content column. `@container` on `PageContainer` would delete
   the class rather than patch instances. Out of scope here; every future patch is interest on it.

## Appendix — five harness bugs, because they cost more than the findings

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

The pattern: a measurement that is precise and reproducible still is not valid. Four of the five
were caught only by deliberately breaking something and checking that the harness noticed.

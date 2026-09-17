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
authenticated page: **9 of 75 bled**, overwhelmingly below 768px. **All nine are fixed**, and a
post-fix sweep — 558 measurements, every route at every width — finds **none**. Five personas were
measured, not one, and the two components that had never rendered at all now render clean.

The larger problem is not overflow. It is touch targets: **53 of the 65 pages measured at 375px**
carry a control under the 44px minimum, and **29 of 65** fail even the looser 36px desktop floor.
Fixing 17 unsized checkboxes took 375px to 47 of 66 and removed a quarter of the offending
controls; the rest cannot be fixed without a product decision, because `DESIGN.md`'s 44px rule
contradicts the design system's own 32/36/40px component ladder and **nothing in the repo detects
violations of either** — the axe assertions that would run `target-size` execute under jsdom,
which performs no layout, so they pass without measuring anything.

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

It was corrected once more afterwards (`b603b7b`): the edge compared is now the element's **margin**
box, clamped to negative margins only, because a deliberate `-mx-1` scroller affordance is an author
saying "paint me wider than my parent" and is not a bleed. A positive margin is not symmetric — it
overflows only transparent space — so counting it would invent findings. See appendix bug 7,
including the plausible diagnosis (content box versus padding box) that the measurement refuted.

**20 flagged routes became 14.** Removed as false positives: `compliance` (+409),
`meetings/[id]/minutes/author` (+234), `communities/[id]/residents` and `dashboard/residents` (+52),
`pm/dashboard/communities` and `…/new` (+21). All six were ancestors of legitimate scrollers.

## Pages that bled (9 of 75), and what each one was

Deduplicated by the page actually rendered. `/welcome`, `/settings/roles` and `/pm/dashboard/[id]`
do not appear because they redirect to `/dashboard`; `/meetings` and `/esign/submissions` because
they redirect to the two pages listed.

Measured before, and again after the fixes, on a production build at each width.

| page | before (375 / 414 / 768 / 1024 / 1280 / 1440) | after | outcome |
|---|---|---|---|
| `/communities/[id]/meetings` | 119 / 80 / **186** / **189** / **152** / **129** | 0 | **clean** — two fixes; see below |
| `/esign/templates/[id]` | 181 / 142 / · / · / · / · | 0 | **clean** |
| `/settings/transparency` | 138 / 99 / · / · / · / · | 0 | **clean** |
| `/audit-trail` | 61 / 22 / · / · / · / · | 0 | **clean** |
| `/emergency/new` | 46 / 7 / · / · / · / · | 0 | **clean** |
| `/dashboard` | 43 / 4 / · / **40** / · / · | 0 | **clean** |
| `/esign/submissions/[id]` | · / · / · / **18** / · / · | 0 | **clean** — `lg:grid-cols-5` → `xl:` |
| `/announcements/new` | 13 / · / · / · / · / · | 0 | **clean** — base grid track pinned |
| `/esign` | · / · / 4 / 4 / · / · | 0 | not a bleed — detector bug 7 |

Every row is 0 on the final build, confirmed twice: once by re-measuring each page at six widths,
and once by a full 558-measurement sweep of all 93 routes that found no bleeding page anywhere.
The two "after" figures this table used to carry — meetings +14 and `esign/templates` +11 — are
both gone: meetings because chasing its `md:hidden` label exposed a 15px day-cell content box and
that got fixed, `esign/templates` because it measures 0 under the corrected detector on the current
build, in both the root and the final `cam` sweeps.

**Meetings was the only page broken at every width**, including 1440px, and the first fix was wrong
in an instructive way. `truncate` without `min-w-0` looked like the answer — a real anti-pattern,
and the class was genuinely absent — but adding it moved the measurement by **zero pixels**, because
`truncate` sets `overflow:hidden`, which already gives automatic minimum size 0. The constraint was
one level up: the pill's `<span>` was `inline-flex`, an *inline-level* box, so it shrink-to-fits and
overflows its 66px container instead of being bounded by it, and the title sat at its full 219px
with the ellipsis never engaging. `flex` makes it block-level and container-sized. Measured at
1024px: title 219px → 41px and visibly ellipsised, page +189 → 0.

**The three that were left alone have since been resolved, and only one was the detector's fault.**
`/esign`'s +4 was a deliberate `-mx-1` scroller affordance the rule mis-read (appendix bug 7).
`/esign/submissions/[id]`'s +18 is the clearest instance of the `lg:` cliff in the audit — the row
already had `flex-wrap`, so nothing could wrap its way out; a single button exceeded the line
because at 1024 the `col-span-2` rail is 259px. `/announcements/new`'s +13 was **briefly reported
here as "no longer reproduces", which was wrong**: the one-route probe that said so omitted the
`deviceScaleFactor: 2` the sweep uses at phone widths (appendix bug 9). It was real, and the cause
was the implicit base grid track sized to a `datetime-local`'s intrinsic width.

The recurring shape in nearly all of these is the same one already fixed twice in this branch: a
horizontal flex row whose children cannot shrink and whose container cannot wrap —
`div.flex.items-center.gap-2 > button`, `> span`, `> div.min-w-[11rem]`. `/dashboard` at 1024px is
the `lg:` cliff in miniature: an action button that fits at every other width.

## Touch targets — the larger finding

| viewport | floor (`DESIGN.md:207`) | pages affected, before | after | distinct controls, before → after |
|---|---|---|---|---|
| 375 | 44px | **53 of 65** | **47 of 66** | 192 → 147 |
| 414 | 44px | **53 of 65** | **46 of 66** | 192 → 147 |
| 768 | 36px | **29 of 65** | **26 of 65** | 97 → 90 |
| 1024 | 36px | **29 of 65** | **23 of 65** | 97 → 84 |
| 1280 | 36px | **30 of 65** | **26 of 65** | 99 → 88 |
| 1440 | 36px | **30 of 65** | **26 of 65** | 97 → 88 |

Denominators are the pages measured **at that width**, which is not the same as the 75 the sweep
reaches across all widths — see correction 2 below. Control counts are distinct
(tag, label, height) triples and are a **floor**: the sweep caps its per-page list at 10.

Two in three pages miss the rule at phone widths, and a third still miss it **at desktop widths
against the looser threshold**. The whole of the "after" column is the checkbox fix below; nothing
in categories 1 and 2 has been touched, because they need a decision rather than a patch.

> **Two corrections to this section, both of which make the finding worse.**
>
> 1. It said *"the 18px root makes `h-8` render 36px"*. False — and it was the sentence that made
>    the gap look smaller than it is. `apps/web/tailwind.config.ts:27-42` overrides the spacing
>    scale with literal pixels and Tailwind's height scale derives from spacing, so
>    `h-8`/`h-9`/`h-10`/`h-11` are exactly **32/36/40/44px**. The design system's numbers do not
>    quietly satisfy the rule; the gap is 4px *wider* than claimed. The 18px root
>    (`globals.css:8`) is real but reaches height only through controls with **no** height class
>    — which is why `TabsTrigger` lands on 31.6px. It does inflate every rem font token:
>    `--font-size-sm: 0.875rem` (`packages/ui/src/styles/tokens.css:168`) renders **15.75px**, not
>    the 14px its own comment claims.
> 2. A draft of this revision "corrected" the denominator from **65** to 75 and was **wrong**:
>    75 is the pages reached at *any* width, while 65 is the pages measured *at that width*, which
>    is the only population the numerator comes from. 65 stands. Recomputing per width confirms it
>    at all six (appendix bug 10). What does need saying is that the control counts are a
>    **floor** — the sweep caps its per-page list at 10 — and that it only records controls under
>    44px, so there is no "controls measured" total in this data.

### The 192 were three different problems, not one — and one of them is now fixed

1. **Primitives below the floor — the policy question.** `packages/ui/src/components/ui/button.tsx`
   is `sm:h-8 / default:h-9 / lg:h-10 / icon:h-9`, so **no Button variant reaches 44px**;
   `ui/input.tsx:11` and `ui/select.tsx:22` are both `h-9`. Note the rules file's Input ladder
   (`sm(36) md(40) lg(48)`) does not exist in code — Input has one size.
2. **Controls with no height class at all.** `ui/tabs.tsx:44` `TabsTrigger` is only
   `px-3 py-1 text-sm`; its height comes from `TabsList` (`h-auto min-h-9 p-1`) plus an
   18px-root-inflated line box, landing at 31.6px. That is upstream shadcn's composition, not a
   missing value — supplying `h-9` would grow every tab strip in the app and still only reach the
   36px desktop floor, so it belongs with the policy decision below rather than being fixed
   quietly.
3. **Unsized raw checkboxes — an outright defect, and fixed in this branch.** 17 raw
   `<input type="checkbox">` across 8 files carried no size class and rendered at Chrome's native
   ~13.3px, against 20 siblings already written `h-4 w-4`. That is the **13px input** in the table
   above. They now match the repo's own primitive (`ui/checkbox.tsx:16` is `h-4 w-4 shrink-0`);
   `shrink-0` is load-bearing, since `w-4` alone still measured 13px wide where the row was tight.
   This is the whole of the "after" column: it takes the smallest control in the app from 13px to
   16px and removes about a quarter of the distinct sub-floor controls, without touching a single
   design-system decision. Categories 1 and 2 are untouched and are what the decision below is
   about.

### Two caveats on the measurement

- **Checkboxes and switches are counted unfairly.** `getBoundingClientRect()` is the right
  measurement for buttons, links, inputs and selects — there is **zero** hit-area expansion
  anywhere in `apps/web/src` or `packages/ui/src` (no `after:-inset-*`, no `touch-action`), so the
  visual box *is* the tap target for those. But a checkbox's real target is its `<label>`, and the
  probe measured the input. `ui/checkbox.tsx` (16px) and `packages/ui`'s Switch (20px) can never
  pass a rect measurement and should not be read as failures on that basis.
- **The rule is unevenly implemented, not ignored.** 36 call sites across 38 files already write
  `h-11 md:h-9` / `min-h-11 sm:min-h-0` by hand — `layout/app-top-bar.tsx:33,43,60`,
  `notifications/notification-bell.tsx:35,49`, `layout/profile-menu.tsx:57`, and the whole
  `board/elections/` and `board/polls/` trees. Someone has already decided what compliance looks
  like; it just never reached the primitives.

### The decision this needs

**This is a policy contradiction before it is a bug.** `DESIGN.md:189,207,228` states the 44px rule
three times; `.claude/rules/design.md:164` specifies buttons at 32/36/40px six lines from restating
it. Both cannot hold, and neither cites WCAG (for reference, WCAG 2.5.8 AA is 24px with spacing
exemptions — *looser* than either). One of the two documents has to change:

- **promote `h-11 md:h-9` into the Button/Input/SelectTrigger CVAs**, matching the 36 hand-rolled
  sites — satisfies `DESIGN.md:207` app-wide, but changes every control's height on every phone
  screen, and taller controls can introduce new wrapping and overflow; or
- **delete the 44px line from `DESIGN.md`** and accept the shadcn ladder as the standard.

That is a product decision, not an engineering one, and nothing can be enforced until it is made.

**Nothing currently detects this, and axe will not help.** `axe-core ^4.11.1` is already a
dependency and its default ruleset includes `target-size`, but every call site
(`apps/web/__tests__/accessibility/`) runs under **jsdom**, which performs no layout — every
`getBoundingClientRect()` returns zero, so the rule resolves as inapplicable and those assertions
pass vacuously. No axe configuration fixes that; only a browser-run check would.

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
| `esign/submission-detail` `lg:grid-cols-5` — a 259px rail at 1024 holding a 175px button | `xl:grid-cols-5`; +18 → 0, revert-check reproduces both findings |
| 17 raw `<input type="checkbox">` with no size class, rendering at Chrome's native ~13.3px | `h-4 w-4 shrink-0`, matching `ui/checkbox.tsx`; smallest control app-wide 13px → 16px |
| `SupportAccessSettings` loading skeleton — a fixed `w-64` bar beside a `shrink-0` switch in a 287px card | `min-w-0 flex-1` + `max-w-full`; +63 → 0 |
| `announcement-composer` — implicit base grid track sized to a `datetime-local`'s intrinsic width (277px box, 290px track) | `grid-cols-[minmax(0,1fr)]` at base; +13 → 0 |
| `month-grid` — seven columns leaving each day cell a **15px content box**, crushing the 28px date badge to 10px | `gap-1`/`p-1` below `sm` + `flex-wrap`; +14 → 0 |

## Beyond layout — two defects found while widening coverage

Neither is a responsiveness bug. Both were found trying to render surfaces this audit had never
seen, and both are worth more than most of the layout findings.

**1. The two root-manager demo personas have never been able to log in.**
`root.manager@sunset.local` and `root.manager@sunsetridge.local` are declared in `DEMO_USERS`
(`scripts/config/demo-data.ts:53-54`) and in `ROOT_MANAGER_BY_SLUG` (`scripts/seed-demo.ts:147`),
but were not in `PRIMARY_ASSIGNMENTS` — and that list is the **only** path reaching `ensureAuthUser`
(`runDemoSeed` → `seedCommunity` → `packages/db/src/seed/seed-community.ts:1643`). The root loop
calls `ensureDemoUserRecord`, which writes `public.users` and nothing else. So the seed produced a
user row and a `user_roles` row with **no Supabase Auth identity**, and
`/dev/agent-login?as=root_sunset` called `generateLink` on a user Auth had never heard of: a 500,
whose hint says *"run `pnpm seed:demo`"* — advice that could never work.

Both personas have been advertised by `agent-login/route.ts:40-41` and by the CLAUDE.md
agent-testing table since #919. `founding.admin@palm.local` works only because it *is* in
`PRIMARY_ASSIGNMENTS`. The consequence reaches past this audit: root-exclusive surfaces (billing,
community deletion, role assignment) were unreachable by any agent or e2e spec in Sunset Condos and
Sunset Ridge — and Palm Shores, the one community with a working root, is on `essentials`, where
most of the surface renders "Upgrade now".

Fixed by mirroring palm-shores: list both as `property_manager` and let the existing
`ROOT_MANAGER_BY_SLUG` loop promote them. Measured against the local stack — `generate_link` 404 →
200 with an unchanged control, `auth.users` 23 → 25, `public.users.id == auth.users.id` for both
(the seed's `needsReconcile` branch replaced the divergent ids), and `user_roles.role` still
`root_manager`.

**2. `pnpm seed:verify`'s id-drift check was passing vacuously on exactly these two rows.**
`scripts/verify-seed-evidence.ts:488` joins `public.users` to `auth.users` **on email**, so a user
with no auth row contributes nothing to compare and the check reports PASS. The one verifier aimed
at this class of problem could not see the two users that had it. It now has rows to compare, and
still passes.

## Role coverage — the hole is closed

The first version of this audit measured everything as one role, `cam` (property manager) in
community 1, and said so. Root-exclusive and resident-only surfaces were entirely unmeasured, and
two components — `RolesAccessClient` and `WelcomeScreen` — had never rendered once. Closing that
required fixing the seed defect above first, since `root_sunset` could not authenticate at all.

| persona | role | pages rendered | pages that bleed | sub-44px @375 | measurements lost |
|---|---|---:|---:|---:|---:|
| `root_sunset` | root_manager | 75 | 3 | 51 of 65 | 29/558 (5%) |
| `cam` (pre-fix baseline) | property_manager | 75 | 9 | 53 of 65 | 16/558 (3%) |
| `cam` (post-fix) | property_manager | 76 | 0 | 47 of 66 | 14/558 (3%) |
| `owner` | resident (unit owner) | 53 | 1 | 33 of 53 | 47/558 (8%) |
| `tenant` | resident (tenant) | 50 | 1 | 32 of 50 | 112/558 (20%) |
| `pm_admin` | portfolio manager | 6 PM routes, measured directly | 0 | — | 0 |

**The rows are not one build.** The two `cam` rows bracket the work; `root_sunset`, `owner` and
`tenant` were swept in between, after the first round of fixes and before the last three, so read
the middle three as a coverage census rather than a like-for-like comparison. Every bleed any of
them found is fixed and re-measured individually (the fix table above), and the post-fix `cam` row
is the one that says the app is clean.

**The "measurements lost" column matters.** All of it is the RSC context-destruction error
(appendix bug 3), and a lost measurement is missing data rather than a clean result — so
`tenant`'s "1 bleeding page" is a floor. The rate climbing 3% → 5% → 8% → 20% and then falling
back to 3% on a freshly started server is what identifies the cause as run-length degradation.

`pm_admin` was measured on its six PM routes directly rather than swept, because
`cam` and `root` already render five of them; the sixth, `/pm/dashboard/[id]`, redirects to
`/dashboard` for every persona including `pm_admin`, so it has no seed row rather than a role
problem.

Reading it:

- **A resident sees a much smaller and much cleaner app.** 53 pages against a manager's 75, and one
  bleeding page against nine. That is not a surprise once stated — resident surfaces carry fewer
  dense tables and fewer action rows — but it does mean the manager surfaces are where the
  remaining risk is, and the pre-existing single-role sweep happened to pick the worst case.
- **Root-exclusive surfaces are clean.** `/settings/roles` (`RolesAccessClient`), `/settings/billing`
  and `/dashboard/claim-root` measure 0 at all six widths. The one thing the root sweep found that
  the manager sweep had not — `/settings` +63 — turned out not to be root-specific at all: it is
  the `SupportAccessSettings` loading skeleton, visible to any admin, and the earlier sweep simply
  caught the page after the fetch resolved.
- **`WelcomeScreen` is clean, and was unreachable for a reason worth knowing.** `/welcome` redirects
  whenever `hasChecklistItems` is true, and `createChecklistItems` is called from ordinary API
  routes (compliance, notification-preferences, documents …) — so any user who has touched the app
  has rows and can never see it again. It is not a role problem. Measured by clearing one user's
  `onboarding_checklist_items` and re-running: **rendered at all six widths, 0 findings**, and the
  page created no rows itself, which is how we know all six renders were real.
- **Touch targets are the one finding that does not vary much by role.** Every persona fails at
  phone widths on the majority of the pages it can reach.

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

  The two grid findings from the role sweep are the other half of the same argument, and they do
  not both fall the same way. An unprefixed-`grid-cols-N` rule **would** have flagged
  `month-grid`'s `grid-cols-7`, and it would have been pointing at a real defect — but its implied
  remedy ("add a breakpoint prefix") is wrong, because a month grid has seven columns at every
  width; the fix was the gutters. And it would **not** have flagged `announcement-composer`, whose
  base grid declares no `grid-cols-*` at all: the offending track is the implicit one. A text rule
  can find the right line with the wrong advice, and miss the case that has no text to match.
- **`responsive-overflow.spec.ts`** floor 768 → 375, four widths → six, and **4 route blocks → 7**.
  Under the old detector three blocks would have failed on compliance — at 768 and 1024, widths
  gated since #1129, on a screen with nothing wrong with it. With the corrected detector **all 42
  gated blocks pass** on a production build.

  The three added in the second round are `meetings`, `announcements composer` and `settings`:
  each bled earlier in this branch and each has a different cause, so one regressing says something
  the others would not. All three avoid record ids deliberately — `/esign/submissions/[id]` bled
  too and is **not** gated, because a block that 404s when the seed shifts is worse than no block.
  `settings` is the one that can pass vacuously, since its bleed lived in a loading skeleton that
  a fast fetch replaces before the measurement; it still cannot pass while the bleed is back.
  `apps/web/e2e/ci-safe-specs.json`'s `expectedTestCount` went 37 → 40 to match, and this spec is
  on that list, so these run in `.github/workflows/e2e.yml` against a real Supabase stack. Like
  every block there, they are unmeasured against **that** stack (dev server, CI seed); the job's
  own run on this PR is the real measurement.

## Unmeasured

Measurements lost to the RSC context-destruction race (appendix bug 3) ran 2% on the baseline
sweep, climbed to 20% by the fourth persona, and came back to **2.5% (14 of 558)** on the post-fix
sweep against a freshly started server — which is the evidence that the climb was run-length
degradation in one long-lived browser and server, not a property of any persona or page. A lost
measurement is missing data, not a clean result, so every count here is a floor. 2 of 95 authenticated pages were
skipped for want of seed rows (`board/forum/[threadId]`, `maintenance/[id]`), and
`/pm/dashboard/[id]` has no seed row either. `apps/admin` (24 pages) was not measured. `/mobile/**`
is out of scope per `.claude/rules/design.md:86-89`.

Also unmeasured: **`apps/web` on a dev server**, which is what CI's e2e job actually runs. Every
number here is from a production build.

Not measured but enumerated: 59 hard `w-[Npx]`; `sheet.tsx`'s `w-3/4 sm:max-w-sm` left/right panels
(~186px usable at 320px) containing unprefixed two-column form grids; 45 `whitespace-nowrap`, ~30 on
user strings; 9 of 10 `DataTable` consumers declaring no `meta.hideBelow`.

## Recommendations

1. **Declare a minimum supported viewport.** This audit assumed 375px. Nothing states one, which is
   how the gate sat at 768px for a year without anyone disagreeing.
2. **Resolve 44px vs 32/36/40px** before anyone tries to enforce touch targets. The concrete
   choice is in "The decision this needs" above: promote `h-11 md:h-9` into the Button/Input CVAs
   (matching the 36 sites that already hand-roll it), or delete the 44px line from `DESIGN.md`.
   Until one of those happens the rule is unenforceable, and nothing detects violations — the
   existing axe assertions run in jsdom and pass vacuously.
3. **Treat `lg:` with suspicion inside the shell — but only where content cannot shrink.** The
   concern is real: `lg:` is the pixel the rail appears, so a grid that widens there gets a
   *narrower* column. It cost `FinanceKpiRow` six overflowing boxes at 1024px, fixed by moving to
   `xl:`, and again `esign/submission-detail`'s `lg:grid-cols-5`, whose `col-span-2` rail is 259px
   at 1024 and 362px at 1280. An earlier draft of this document recommended draining the other three
   `lg:grid-cols-4`/`-6` sites on that pattern alone. **Measurement says leave them:**
   `compliance-command-center`, `dashboard/apartment-metrics` and `minutes-availability-grid` are
   clean at all six widths, because counts and percentages fit in 159px where currency does not.
4. ~~**Fix meetings first** — the only route broken at all six widths.~~ **Done**, in two
   rounds: the event pill's `inline-flex` at every width, then the month grid's phone-width
   geometry (`gap-1`/`p-1` below `sm`), where seven columns in a 277px grid had left each day cell
   a **15px content box** and crushed the 28px day-number badge to 10px. That second one was never
   really a text-overflow bug — it is a layout that does not fit a phone, and the +14 was the
   symptom that surfaced it.
5. **Make `verify-seed-evidence.ts`'s drift check assert its own population.** It joins
   `public.users` to `auth.users` on email, so a user with no auth row contributes no pair to
   compare and the check reports PASS — which is exactly how it missed the two root managers for
   as long as they were broken. An inner join can only validate rows that exist on both sides;
   asserting that every `DEMO_USERS` email appears in `auth.users` would have caught it on the
   first run. (Same shape as the guard rule in `.claude/rules/verification.md`: *assert a non-zero
   population*.)
6. **The real fix is container queries.** Every finding here is a breakpoint keyed to the viewport
   when the thing that varies is the content column. `@container` on `PageContainer` would delete
   the class rather than patch instances. Out of scope here; every future patch is interest on it.

## Appendix — eleven harness bugs, because they cost more than the findings

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
7. **A deliberate negative margin read as a bleed.** The detector compared each element's *border*
   box against its parent's content box, so `-mx-1 w-full overflow-x-auto` — the standard way to
   stop a horizontal scroller clipping the focus ring on its first and last child — reported +4 on
   `/esign`. It now compares the margin box, clamped to negative margins only (a positive margin
   overflows nothing that is painted). Worth recording is the *wrong* diagnosis this started from:
   content-box versus padding-box looked like the obvious culprit, since CSS overflow is
   padding-box relative — but the measurement showed the parent's `padding-right` is 0 there, so
   both bases give the same +4. The hypothesis was refuted by the same probe written to confirm it.
   Seven of these sites exist, one of them on a route the shipped gate covers.
8. **A fault injection that did not land, reported as a passing rule.** The anti-vacuity probe for
   bug 7 set `width` on the offending element and got zero findings — which looks like the detector
   failing to catch a real bleed. The element is a flex item with the default `flex-shrink: 1`, so
   the row simply shrank it back and the injected fault never existed. `min-width` is the floor
   shrink cannot cross. `.claude/rules/verification.md` warns about exactly this ("confirm the fault
   landed"); it is easy to read and still walk into.

9. **A targeted re-measure that did not match the harness it was checking.** `/announcements/new`
   measured +13 in the sweep and **0** in a one-route probe written to confirm the fix — which read
   as "already resolved" and was written into this document as such. The probe omitted
   `deviceScaleFactor: 2`, which the sweep sets at phone widths (`sweep.mts:85`). With the context
   matched the +13 returned immediately, and the cause turned out to be real and specific (the
   implicit grid track, below). A re-measure is only evidence if it reproduces the original
   conditions; "I could not reproduce it" is a claim about the harness until then.

10. **A correct number "corrected" into a wrong one.** Revising this document I decided the
   touch-target denominator of **65** was unsupported and changed it to 75, the number of distinct
   pages the sweep reached. It is not the right denominator: 75 counts pages reached at *any*
   width, while the numerator counts pages failing *at one* width, and only 65 pages are measured
   at any single width. Recomputing per width gives 65 at all six, so the original was right and
   the correction was the error. It survived one review because the new number was *smaller* and
   therefore felt more conservative — a wrong denominator does not get safer by being bigger.

11. **The same mistake again, on a different number, and CI is what caught it.** Bug 10 was
   "corrected" a right number into a wrong one. Two reviews then disagreed about how many blocks
   the e2e config collects — 40 or 41 — and I sided with 41, called the long-standing 40 a stale
   floor with slack, and set the new floor from a `playwright --list` total. CI rejected it:
   `counted=53 floor=54`. `--list` prints the warmup project's test alongside the chromium ones;
   the workflow's assertion filters `projectName !== "warmup"` and says so in its own comment. So
   40 was right, review 1 was right, and I had repeated bug 10 within the same branch. The
   correction is a command rather than a number: count with
   `--list | grep -c chromium`.

Bug 2 also recurred: the first measurement of the `/esign/submissions/[id]` fix returned the
before-number to the pixel, because `next start` serves the build on disk and the source edit was
never compiled. Identical output across a change is itself a signal.

The pattern: a measurement that is precise and reproducible still is not valid. Nine of the eleven
were caught only by deliberately breaking something, or by re-deriving a number two ways and
finding they disagreed. The last two were both **corrections** rather than original measurements,
which is the part worth keeping: a number I had just decided to change got less scrutiny than one
I had measured, in both directions, twice.

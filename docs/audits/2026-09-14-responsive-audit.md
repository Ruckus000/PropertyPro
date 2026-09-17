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

The other finding in this document was **touch targets**, and it was reported against the wrong
standard. A follow-up pass on 2026-09-17 re-measured it and the section below is rewritten: the
44px figure this audit called a "minimum" is WCAG 2.1 **SC 2.5.5, Level AAA**, while the AA
criterion is WCAG 2.2 **SC 2.5.8 — 24x24 with a spacing exception**. Measured against AA, in real
Chromium, with the rule that implements the exceptions: **twelve of the thirteen shared controls
are conformant**, and the one that was not — a 16px remove button that overlaps another target —
is fixed here. Sweeping all 93 authenticated routes at phone widths then examined **2,612 targets
across 68 pages and found zero failures**, so the product has no AA target-size defect anywhere it
was measured. The house 44px rule was then **adopted** (2026-09-17) and is now implemented in the
primitives at `lg`, with three named exceptions — a product decision about touch comfort, taken
with the measurement in hand and explicitly not an accessibility fix. The overflow sweep that
gates it found **zero** pages scrolling sideways and no bleed attributable to it.

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

## Touch targets — re-measured 2026-09-17 against the criterion that binds

**This section replaces an earlier one that led with "53 of the 65 pages measured at 375px carry a
control under the 44px minimum". That sentence is withdrawn.** It was not wrong about the pixels.
It was wrong about what the pixels meant, and it was produced by a probe that is not in this
repository.

### Which standard 44px actually is

| | criterion | level | size |
|---|---|---|---|
| what this audit measured | WCAG 2.1 SC 2.5.5 Target Size (Enhanced) | **AAA** | 44×44 |
| what conformance asks for | WCAG 2.2 SC 2.5.8 Target Size (Minimum) | **AA** | **24×24**, with exceptions |
| WCAG 2.1 AA — the version most often cited | *no target-size criterion at all* | — | — |

44px is a defensible internal standard: it is the Apple HIG figure, and this product's residents
skew older than most consumer software's. But calling a shortfall against it an accessibility
failure inflates an aspiration into a defect, and an audit that does so invites a sprint against
the wrong number. SC 2.5.8 also carries five exceptions — **spacing**, inline, user-agent control,
equivalent, essential — and the spacing one does most of the work: an undersized target that no
other target crowds is conformant.

### What the shared controls actually measure

Thirteen controls, rendered from the real components (`react-dom/server`, so the fixture cannot
drift from `packages/ui`) into real Chromium against Tailwind compiled from
`apps/web/tailwind.config.ts`, with `tokens.css` and the 18px root in the cascade.
`apps/web/e2e/touch-target-audit.spec.ts` is the measurement and it is committed.

The table below is **as first measured**, before the 44px rule was adopted later the same day.
The right-hand column is what each control is now: the rule is implemented at `lg`, so every row
that said "no" says 44 below 1024px and keeps its old height above. See "The decision, taken".

| control | measured (pre-adoption) | clears 24×24 | reaches 44px | now |
|---|---|---|---|---|
| `Button` size=default (`h-9`) | 141.8×36 | yes | no | **44** / 36 at `lg` |
| `Button` size=sm (`h-8`) | 50.2×32 | yes | no | **44** / 32 at `lg` |
| `Button` size=lg (`h-10`) | 153.5×40 | yes | no | **44** / 40 at `lg` |
| `Button` size=icon (`h-9 w-9`) | 36×36 | yes | no | **44×44** / 36×36 at `lg` |
| `Input` (`h-9`) | full-width × 36 | yes | no | **44** / 36 at `lg` |
| `SelectTrigger` (`h-9`) | full-width × 36 | yes | no | **44** / 36 at `lg` |
| `TabsTrigger` (no height class) | 98.2×**31.6** | yes | no | **min 44** / 31.6 at `lg` |
| `QuickFilterTabs` pill (`h-8`) | 43.5×32 | yes | no | **44** / 32 at `lg` |
| esign field remove button (`size-4` → `size-6`) | 16×16 → **24×24** | **now** | no | 24×24 — the AA fix, not the house rule |
| `HelpTooltip` trigger (`size-5`) | 20×20 | spacing-dependent | no | unchanged — **named exception** |
| `Checkbox` (`h-4 w-4`) | 16×16 | spacing-dependent | no | unchanged — **named exception** |
| `Checkbox` + sibling `<label>`, as shipped | **16×16** | spacing-dependent | no | unchanged — **named exception** |
| `Switch` (`h-5 w-9`) | 36×**20** | spacing-dependent | no | unchanged — **named exception** |

**One genuine AA violation existed, and it is fixed.** `esign/field-overlay.tsx:185`'s remove
button was `size-4` — 16×16 — pinned at the corner of a field box that is itself a target
(draggable, selectable). Two targets that close means neither gets the spacing exception, and
`axe-core`'s `target-size` reported it **even with 24px of clear space around the entire overlay**.
It is `size-6` now, with the offset moved 8px → 12px so the larger circle still centres on the
corner and the glyph stays `size-3`. Reverting that one class turns exactly two blocks red, both
naming the control and its 16×16 size, with the sibling blocks green.

**Four controls sit under 24×24 and depend on their surroundings.** Checkbox, Switch and the help
tooltip are conformant wherever nothing else clickable is within reach, and axe excuses all four
in the fixture. That is the criterion, not a loophole — but it does mean their conformance is a
property of each screen rather than of the component, and nothing measures it on the authenticated
surface today.

**Correcting this audit's own caveat.** It said "a checkbox's real target is its `<label>`, and the
probe measured the input". As a geometry claim that is false, and now measured: the shipped shape
(`pm/BulkAnnouncementDialog.tsx:220-229`) puts the label in a **sibling** element, so the control's
box is 16×16 with or without it. Clicking the label does activate the control — that is a genuine
usability gain — but it does not enlarge the target, and SC 2.5.8 is about the target.

### On real pages — public, then the whole authenticated app

**Public routes.** Six at 375px and 414px, with `isMobile` / `hasTouch` /
`deviceScaleFactor: 2`: **83 targets examined per width, 0 unexcused.** They are the ones
`marketing-smoke` and `activation-smoke` already prove need no database — `/`, `/resources`,
`/contact`, `/login`, `/signup/checkout`, `/signup/checkout/return`.

**The authenticated app, measured 2026-09-17.** All 93 authenticated routes at 375 and 414 as the
property_manager persona, driving the same committed `findUndersizedTargets`:

| | |
|---|---|
| measurements | **186**, zero lost |
| distinct pages landed | **68** (+3 apartment-only dashboards, measured separately) |
| targets examined | **2,612** (+103 on the apartment dashboards) |
| **unexcused targets (SC 2.5.8 failures)** | **0** |

So the four spacing-dependent controls are, on every screen this reaches, spaced. **There is no
WCAG 2.2 AA target-size failure anywhere in the product at phone widths**, and the 44px question is
therefore a pure product decision with no accessibility component attached to it. That is the
single most useful thing this section now says, and the earlier version of it said the opposite.

**How the stack was rebuilt**, since `supabase start` is still impossible (image blobs are
proxy-blocked, as recorded above): PostgreSQL 16 started natively from the existing cluster — no
Docker — with the seeded `propertypro_dev` database intact at 72 of 72 migrations; the Auth/Storage
stand-in described above; and a **loopback-only env symlinked into `apps/web/.env.local`**, written
outside the repository so it cannot be committed. The production env file was neither read nor
written. `nonLocalBackendReason` (`packages/shared/src/env/loopback.ts`) fails closed and 403s
`/dev/agent-login` unless BOTH `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are loopback, which is
what makes that safe rather than merely intended.

**Three things this sweep got wrong first, all caught by the denominator.**

1. **It measured sign-in screens and called them clean.** The first probe reported `/dashboard`
   with zero findings — having examined **4 targets**, which is what a login page has. Supabase
   auth cookies are host-only and Next's dev server normalises `request.url` to `localhost`, so a
   browser on `127.0.0.1` never sends the session back. `CLAUDE.md` records this trap for the admin
   app; it bites the web app identically. Every page was rendering `/auth/login`.
2. **Then it measured `/select-community`.** With the host fixed, a multi-community persona with no
   pin bounces there — a real authenticated page, so it measures plausibly while telling you
   nothing about the page requested. Top-level routes need `?communityId=`; nested
   `/communities/[id]/…` routes must not have one.
3. **Then it lost a quarter of the run.** 47 of 186 measurements failed, in two contiguous blocks
   rather than scattered: the dev server went down and came back twice, which is appendix bug 3's
   run-length degradation again. A resume pass that **waits** for the server instead of recording
   an error recovered all 47. Two further rows had transiently landed on `/` and were re-measured.

The lesson is the same one in each case: a sweep that cannot render the page reports zero findings,
which is indistinguishable from a pass. Only the count of targets examined separates them, which is
why both the sweep and the committed blocks print it and assert a floor on it.

**Still unmeasured.** Four of the five personas (the sweep used one, on the finding that touch
targets barely vary by role); every width above 414; `apps/admin`; and `/mobile/**`. The sweep ran
against a dev server and the seeded dataset, so a route whose content differs in production could
differ here.

### Why the old numbers are withdrawn rather than corrected

The harness behind the 53-of-65 table (`sweep.mts`) was never committed; it survived only in a
scratch directory, so a figure in a shipped audit document was not reproducible from this
repository. Read back, it had seven counting defects, and each one is something SC 2.5.8 has an
explicit clause about:

1. the per-page list was truncated at 10, so "192 → 147 controls" cannot measure progress — a page
   could go 40 → 12 and still report 10 → 10;
2. it compared **height only**, so a 40×12px chip remover scored better than a 36px full-width
   button, when the criterion is a 24×24 box;
3. it measured `<input type=checkbox>` rather than the label association;
4. it matched only `[role="button"]`, missing `tab` / `menuitem` / `switch` / `option`;
5. it counted native `<select>`, which has a user-agent-control exception;
6. its inline-link exemption was `closest('p,li')`, so an inline link in a `<td>` or a `<div>`
   counted;
7. its dedupe key was `(tag, label, height)` — neither per-page distinct nor globally distinct.

**And there was no spacing exception at all**, which is the one that matters most: it is why a 32px
button with room around it was reported as an accessibility failure. That single omission is most
of the difference between "53 of 65 pages fail" and "one control in the design system did".

The replacement does not re-derive the rule. `axe-core` has been a dependency of `apps/web` the
whole time and its `target-size` rule (`wcag22aa` / `wcag258`) already implements every clause
above. The reason it never fired is in this audit's own text: the existing axe assertions run under
jsdom, which performs no layout, so the rule resolves inapplicable and passes without measuring
anything. The new spec runs it in a real engine, prints the number of targets examined so a vacuous
run cannot look like a clean one, and carries a block that injects a deliberately 10×10px target to
prove the rule fires.

### The decision, taken 2026-09-17: the 44px rule is now implemented

The contradiction was narrower and worse than this audit first described. It was
not `DESIGN.md` against `.claude/rules/design.md`: **both** documents stated the
44/36 rule *and* the 32/36/40 ladder. `DESIGN.md` contradicted **itself**, at line
118 against 207 and 228. Four documents asserted 44px
(`DESIGN.md:207`, `:228`, `DESIGN_LAWS.md:28`, `design-system/README.md:144`),
**zero** primitives satisfied it, and **no** guard enforced it. Two further signs
that the rule had been written rather than decided:

- `DESIGN.md:189` scoped it to "the DataRow pattern". **`DataRow` never existed** —
  zero hits across `apps/web/src` and `packages/ui/src`. Deleted from both files
  that described it.
- `DESIGN.md:8` calls board members "tablet-first … larger touch targets", while
  the 768px breakpoint handed tablets the **smaller** target. The rule was
  inverted for the persona it was written for.

**What was decided.** Implement the rule in the primitives, at **`lg` (1024px)**
rather than the stated 768. Explicitly **not** an accessibility fix: the
conformance bar is SC 2.5.8's 24×24, and the app measured clean against it before
any of this. It is a product decision about touch comfort, taken with that
evidence in hand.

| | |
|---|---|
| primitives changed | Button (all four sizes), Input, SelectTrigger, TabsTrigger, QuickFilterTabs |
| breakpoint | `lg` — 768–1024 is a touch tablet, and it matches `app-top-bar.tsx`, which already shipped `size-11 … lg:size-9` |
| below `lg` | every Button size clamps to 44, so `sm`/`default`/`lg` are indistinguishable on a phone — what a minimum does to 32/36/40 |
| named exceptions | `Checkbox` (16×16), `Switch` (36×20), `HelpTooltip` (20×20) — each clears the AA floor via the spacing exception; reaching 44 needs a visual redesign or an invisible hit area, a pattern that exists nowhere here |
| idioms | **three collapsed to one.** Zero `md:`/`sm:` height steps remain |
| the gate | the 44px test flipped from *printing* to *asserting*, exceptions pinned by name |

**The idiom consolidation was not cosmetic.** All 32 `h-11 md:h-9` sites sat on
`Button`/`Input`/`SelectTrigger`. Left alone they would not merely have been
redundant: `md:h-9` and `lg:h-9` are different variant groups and both survive
`tailwind-merge`, so those 32 call sites would have kept the tablet inversion
alive in exactly the files the breakpoint change exists to fix.
`min-h-11 sm:min-h-0` (4 sites) never implemented the rule at all — it drops the
floor above 640px instead of stepping down. The `min-h-[44px] md:min-h-[36px]`
cluster (23 sites) was raw arbitrary px, against the repo's own
no-ad-hoc-spacing rule, and is now on the scale.

### What the change cost, measured

The gate for a change that makes every control taller is the **overflow** suite,
not the touch-target suite. All 93 authenticated routes at all six widths, after:

| | |
|---|---|
| measurements | **558**, zero lost |
| distinct pages | 77 |
| **pages that scroll sideways** | **0** |
| rows with a bleed | 8, across 5 pages — **none attributable to this change** |

**I predicted this wrong.** The stated risk was the 768–1024 band: `lg` keeps 44px
controls alive there, and 1024 is where the rail appears and the content column is
narrowest (684px, narrower than at 768). Not one bleed appeared at 768, 1024, 1280
or 1440. Every finding was at 375 or 414.

**Attribution took three attempts and the first answer was wrong.** A before/after
on the flagged routes said `/dashboard/residents` went 0 → 6 bleeds, which read as
a clean regression. It was not: measuring the row's geometry under both versions
gave **identical numbers** — text column 170.4px, button column 118.6px, the email
needing 204px either way — and re-running the control warm reproduced all six
bleeds *with the change reverted*. That route's bleed count tracks whether the list
has painted, not the code. The flaky signal was the count; the deterministic signal
was the geometry.

Two of the five were real, pre-existing defects and are fixed here:

- **`/dashboard/residents`** — `root.manager@sunset.local` in a 170px column,
  overflowing 8–52px at 375 and 414. `break-words` on the email line; not
  `truncate`, because an ellipsised address is unreadable and a wrapped one is
  not. Note the likely origin: that seed identity was added in #1151, and it is
  longer than every other seeded email — which is why the merged sweep, run before
  it existed, reported zero bleeds.
- **`AlertBanner`** (`/pm/dashboard/communities`, +10 and +21) — `min-w-0` lets the
  column shrink but an unbreakable token then overflows rather than wrapping.
  `break-words` on both lines; a no-op for ordinary copy.

Three were not defects: `/settings/payments` (+11) is an `animate-pulse`
**skeleton** and `/communities/1/documents/author/…` (+195) an unsettled input —
neither reproduces once the page finishes loading. `/communities/1/meetings`
(+1.8px) is the known trailing-letter-spacing edge in the detector, unchanged
before and after.

Neither fixed route is in the committed overflow gate, deliberately: both bleeds
are only observable after their list paints, and a block that races the data would
be a flaky gate, which is worse than none.

**And the accessibility side, re-checked.** "Bigger controls cannot fail a size
minimum" is the intuition and it is only half right: nothing shrank, but
`Checkbox`, `Switch` and `HelpTooltip` clear SC 2.5.8 **only via the spacing
exception**, and their neighbours just grew 36→44px. In a fixed-width row that
closes the gap, which is the one mechanism by which making everything larger
could produce an accessibility regression. Re-swept all 93 routes at 375 and 414
after the change: **186 measurements, zero lost, 2,564 targets examined across 66
pages, zero unexcused.** The three exceptions are still uncrowded everywhere they
appear.

One operational note that cost a red run and is worth writing down: the
authenticated block failed once with `ECONNRESET` in `loginAs` after the dev
server had been driven for several hours — the same run-length degradation as
appendix bug 3, now visible as a connection reset rather than lost measurements.
It passed on a freshly started server in 2.2 minutes. The block's timeout went
240s → 360s on the strength of that number, since a cold CI runner compiles
every route from scratch and 2.2 minutes warm is not a safe margin against four.

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

| persona | role | pages rendered | pages that bleed | under 44px @375 [^tt] | measurements lost |
|---|---|---:|---:|---:|---:|
| `root_sunset` | root_manager | 75 | 3 | 51 of 65 | 29/558 (5%) |
| `cam` (pre-fix baseline) | property_manager | 75 | 9 | 53 of 65 | 16/558 (3%) |
| `cam` (post-fix) | property_manager | 76 | 0 | 47 of 66 | 14/558 (3%) |
| `owner` | resident (unit owner) | 53 | 1 | 33 of 53 | 47/558 (8%) |
| `tenant` | resident (tenant) | 50 | 1 | 32 of 50 | 112/558 (20%) |
| `pm_admin` | portfolio manager | 6 PM routes, measured directly | 0 | — | 0 |

[^tt]: This column is kept for the record but is **not** an accessibility measure — see "Touch
targets" above. It counts pages carrying a control below the house 44px aspiration (WCAG AAA), not
pages failing the AA criterion, and it comes from the withdrawn `sweep.mts` harness, whose per-page
list was capped at 10 and which applied no spacing exception. Read it as "how far the app sits from
`DESIGN.md:207`", nothing more.

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
- **`touch-target-audit.spec.ts`** (added 2026-09-17, 9 blocks, `expectedTestCount` 55 → 64). Runs
  `axe-core`'s `target-size` — already a dependency — rather than a second hand-rolled geometry
  rule, which is the whole lesson of the harness it replaces. Six blocks need no server: they
  render the real primitives through `react-dom/server` in a `tsx` subprocess and measure them in
  Chromium against Tailwind compiled from the app's own config. Two visit the six DB-free routes.

  It asserts the **24×24 AA floor** and the *set* of controls that fall below it, and only
  **prints** conformance with `DESIGN.md:207`'s 44px. That split is the point. Asserting 44px would
  turn the entire component library red over a contradiction nobody has resolved, and a gate is a
  bad place to hold an argument; leaving the 24×24 floor unasserted would let the one real
  violation come back silently. Pinning the under-24 set by equality rather than asserting it empty
  means a fifth control acquiring a dependency on its surroundings is a decision someone makes.

  A ninth block sweeps the five densest AUTHENTICATED screens at 375px — the same five
  `responsive-overflow.spec.ts` already proves render against the CI seed, so it adds a block
  rather than a seed dependency. It is there for the one failure mode the other layers cannot
  see: **crowding**. Four controls clear SC 2.5.8 only while nothing clickable sits within 24px of
  them, so a change to one row's `gap` can end conformance without touching a component file. It
  asserts a floor on targets examined as well as zero findings, because five dense screens that
  examine almost nothing have rendered as login pages.

  Note also what it does **not** do: there is no static lint rule for control size, and there
  should not be. `verify-responsive-geometry.ts` already settles why — "a geometry claim belongs in
  the browser" — and a grep for `size="sm"` is exactly the shape it rejects.
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
overflow number here is from a production build.

For touch targets the authenticated gap is now **closed** — all 93 routes were swept on
2026-09-17 (see "On real pages") — but on a narrower base than the overflow numbers: one persona,
two widths, a dev server. What remains unmeasured there is the other four personas, every width
above 414px, and the same `apps/admin` and `/mobile/**` exclusions.

Not measured but enumerated: 59 hard `w-[Npx]`; `sheet.tsx`'s `w-3/4 sm:max-w-sm` left/right panels
(~186px usable at 320px) containing unprefixed two-column form grids; 45 `whitespace-nowrap`, ~30 on
user strings; 9 of 10 `DataTable` consumers declaring no `meta.hideBelow`.

## Recommendations

1. **Declare a minimum supported viewport.** This audit assumed 375px. Nothing states one, which is
   how the gate sat at 768px for a year without anyone disagreeing.
2. **Resolve 44px vs 32/36/40px, and run the target-size blocks against the authenticated app.**
   The choice and its price are in "The decision this still needs" above; the recommendation there
   is to make 24x24 the enforced floor, demote 44px to a documented aspiration, and scope any
   44px push to the resident-facing mobile surfaces. Whichever is chosen, the four documents that
   assert a rule no primitive implements have to stop. **Done, 2026-09-17** — see "The decision,
   taken" above. The rule is implemented at `lg`, the three rival idioms are one, the four
   documents describe what ships, and the 44px test asserts rather than prints.
   `apps/web/e2e/touch-target-audit.spec.ts` also carries a block over the five densest
   authenticated screens, so a future change that crowds one of the spacing-dependent controls
   fails a gate rather than shipping.
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

## Appendix — fourteen harness bugs, because they cost more than the findings

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

12. **The biggest one was not a bug in the harness. It was the standard.** Everything in bug 10 and
   bug 11 was an argument about a *number* — 65 or 75, 40 or 41 — while the sentence those numbers
   supported ("53 of 65 pages carry a control under the 44px **minimum**") was measuring an
   aspiration and calling it a floor. 44px is WCAG 2.1 SC 2.5.5, Level **AAA**; the AA criterion is
   SC 2.5.8 at 24×24 with a spacing exception, and WCAG 2.1 AA has no target-size criterion at all.
   This document said so, once, in a parenthetical — "for reference, WCAG 2.5.8 AA is 24px with
   spacing exemptions — *looser* than either" — and then led with the AAA number anyway for a
   fortnight. Re-measured against AA, one control in the design system failed, not two thirds of
   the pages.

   The harness defect underneath it is the same shape: the probe implemented no spacing exception,
   which is not a detail but most of the criterion, and `axe-core` — already installed, with the
   rule already written and tagged `wcag258` — was never reached for because the existing axe call
   sites appeared to cover it. They ran under jsdom, which has no layout engine, so the rule had
   been resolving inapplicable and passing for as long as it had existed. A dependency that is
   present, invoked, and green is not the same as a check that runs.

   The correction worth keeping: **before measuring, write down which criterion, at which level.**
   Three revisions of this section argued about denominators without anyone asking what the
   numerator was supposed to mean.

13. **A fixture that could only ever see one branch.** After the 44px rule landed in the CVAs,
   every number in the primitive layer came back identical and the self-check passed — which
   reads exactly like a change that did not apply. It had applied; the fixture renders at the
   project's viewport, `devices['Desktop Chrome']` = 1280px, where `lg:` is already in force, so
   it was measuring the desktop branch and reporting it as the only one. It had been correct for
   as long as there was one branch to measure, which is what made it invisible: the bug arrived
   in the production code, not in the test, and the test's silence was the symptom. It now takes
   the width as an argument and pins both sides.

14. **An attribution that was confidently backwards.** The overflow sweep flagged
   `/dashboard/residents`, and a before/after on that route said 0 bleeds without the change and
   6 with it — a clean regression, reported as one. It was not. Measuring the ROW rather than
   counting bleeds gave identical geometry under both versions (text column 170.4px, button
   column 118.6px, the email needing 204px either way), and re-running the control with the route
   warm reproduced all six bleeds *with the change reverted*. The route's bleed count tracks
   whether its list has painted; the count was the flaky signal and the geometry was the
   deterministic one. This is bug 10 and bug 11's family again — a number that felt like evidence
   because it came from a comparison — with the added lesson that **a before/after is only a
   control if both sides are in the same state**, and "I just recompiled" is not the same state.

Bug 2 also recurred: the first measurement of the `/esign/submissions/[id]` fix returned the
before-number to the pixel, because `next start` serves the build on disk and the source edit was
never compiled. Identical output across a change is itself a signal.

The pattern: a measurement that is precise and reproducible still is not valid. Nine of the
fourteen were caught only by deliberately breaking something, or by re-deriving a number two ways
and finding they disagreed. Two were **corrections** rather than original measurements, which is
worth keeping on its own: a number I had just decided to change got less scrutiny than one I had
measured, in both directions, twice. Bug 12 outranks those, because precision and reproducibility
were never going to catch it — the number was defensible and the question was wrong.

Bugs 13 and 14 add the one that recurs most and is hardest to see: **a measurement taken in the
wrong state**. A fixture at the wrong viewport, a route measured before its list paints, a control
run against a just-recompiled server. In every case the harness worked perfectly and answered a
question about a situation that was not the one being asked about. The defence is not more care in
reading the number — it is a second, differently-shaped measurement of the same thing: the count
of targets examined, the geometry behind the bleed, the same route warm as well as cold.

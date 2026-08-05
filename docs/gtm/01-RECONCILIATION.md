# GTM Reconciliation — What Changed Since February

**Date:** 2026-08-05
**Supersedes:** `docs/03-MARKET-ENTRY-PLAN.md`, `docs/competitive-analysis-2026-03.md` (strategic layer)
**Context:** pre-revenue, not launched, solo founder

---

## 1. The headline

The February plan was written for a company about to enter a regulatory window
that opened **January 1, 2026**. It is now **August 5, 2026**. Seven of those
months are spent and the plan was never executed — no discovery calls, no
outbound, no content, no revenue.

Meanwhile the *product* advanced enormously. The March competitive analysis
listed violations, ARC, payments, accounting, and e-voting as table-stakes gaps
that made us "underweight." That list is now substantially closed (§2).

**So the position inverted.** In February we had a market window and no product.
In August we have a product and a partly-spent window. The plan has to change
accordingly: the February plan's premise — *build toward the window* — is
obsolete. The correct premise now is *the product is ready enough; the bottleneck
is that nothing has ever been sold.*

This is the single most important thing in this document. Every remaining
decision follows from it. **Do not spend more time on product breadth.** The
next unit of work that creates value is a conversation with a board president.

---

## 2. Product reality vs. the March gap list

Verified against the route tree on 2026-08-05.

| March "gap" | Status now | Evidence |
|---|---|---|
| Violations | **Shipped** | 3 authenticated pages + API + service |
| ARC / ACC | **Shipped** | 2 pages (`arc-requests/`) + API |
| Payments | **Shipped** | 5 pages + Stripe routes |
| Assessments | **Shipped** | 2 pages |
| E-voting / elections | **Shipped** | `elections/` + `polls/` pages + API |
| E-Sign | **Shipped** | 7 pages — deepest surface in the app |
| Accounting / finance | **Shipped** | `finance/`, `/api/v1/accounting`, `/ledger` |
| Amenities / reservations | **Thin** | API exists; UI is one `operations/` page |
| Work orders | **Thin** | API exists; no dedicated UI |
| Native mobile app | **Does not exist** | `/mobile/` is web-only routes |

**Read:** the compliance-and-governance core is done. The remaining thin spots
(amenity booking, work orders) are *operational conveniences*, not deal-breakers
for a self-managed 25–149 unit condo board. They are not worth delaying launch.

### 2.1 The differentiator problem

`docs/03` §2.1 names **the native mobile app as the recommended PRIMARY
differentiator**, on the correct legal observation that the statute permits
compliance via a mobile application. That app does not exist and is not on any
current roadmap. `/mobile/` is a set of responsive web routes — exactly what the
February plan said CondoSites and CONDUU already have and what it argued was
*insufficient* to differentiate.

**You cannot lead with the mobile app.** Any messaging inherited from `docs/03`
that does so is a promise the product cannot keep, and a board that downloads
nothing from an App Store will notice on day one. `02-POSITIONING.md` builds the
differentiation on statutory depth instead, which is real, verifiable, and
already shipped.

---

## 3. Market reality

What has *not* changed: Florida still has the largest condo/HOA market in the
US, §718.111(12)(g) still binds associations at 25+ units, and the operational
pain the `docs/07` pitch foundation describes (email chains, filing cabinets,
the treasurer's spreadsheet) is structural and permanent.

What *has* changed is the buyer's emotional state, and this is a real shift in
sales posture:

- **In February,** the pitch was *"the deadline is coming, you are about to be
  non-compliant."* Fear of a future event. Urgency was free.
- **In August,** every target association has already been non-compliant for
  seven months, or has already bought something. Fear of a future event no
  longer works — the event happened and, for most, nothing visible occurred.

This produces two distinct segments that need different approaches:

| Segment | State | Approach |
|---|---|---|
| **Already bought** (likely the majority of the easy ones) | On CondoSites, CONDUU, or a static page a board member's nephew built | Displacement sale. Slower. Wedge is *"that's a website; it isn't running your association."* |
| **Still non-compliant** | Did nothing. Not because they didn't know — because nobody made it easy. | Direct sale, but urgency must be **re-manufactured** from a concrete trigger (below), not from the Jan 1 date. |

**Re-manufacturing urgency.** The honest triggers available in August are: an
owner records request (the statute's actual enforcement mechanism is
owner-initiated, with $50/day damages), an upcoming annual meeting or budget
season, an insurance or milestone-inspection deadline, or a board turnover.
These are *specific to one association on a specific date* — which means
research per prospect, which means fewer, better-targeted approaches. That is
fine for a solo operator; it is in fact the only thing a solo operator can do.

Note also: the "seven months late" fact cuts *for* you in one specific way. An
association still non-compliant in August has demonstrated it will not solve
this on its own. That is a qualified prospect, not a cold one.

### 3.1 Competitive read, updated

The March analysis stands and does not need rewriting. One correction of
emphasis: `docs/03` names **CondoSites ($55–70/mo, 20 years, founder sits on
boards)** as the most dangerous competitor, and the March doc's Tier-1 framing
(AppFolio, Vantaca, CINC) buries this. For a self-managed 25–149 unit condo, you
will almost never be in a deal against Vantaca. **You will be in a deal against
CondoSites, against a $0 static page, and against doing nothing.** Price and
messaging should be built against those three, not against the enterprise suites.

That is a hard spot: we are asking $199 against a $55 incumbent. `02-POSITIONING.md`
§4 addresses how — and it is not by competing on price.

---

## 4. Direct conflicts between existing docs

These must be resolved before any of the `04`–`08` playbooks are used verbatim.

| # | Conflict | Resolution |
|---|---|---|
| C1 | `docs/05` assumes PM pricing of **$149/mo × 7 communities**. The live site says **"Let's talk"** and the code implements volume tiers (10%/15%/20% off at 3/6/11 communities). | The tier system is real and shipped; the playbook's flat $149 is stale. Use the tier model. |
| C2 | `docs/04` assumes **$199/mo + $1,500 setup**. The live pricing section shows **$199 Essentials / $349 Professional**, no setup fee. | Live site wins. The $1,500 setup fee is not in the product and would need to be sold manually. See `02-POSITIONING.md` §4.2 — recommend *not* reintroducing it. |
| C3 | `docs/03` §2.1 makes the **native mobile app** the primary differentiator. It does not exist. | Dropped. Replaced by statutory depth. (§2.1 above.) |
| C4 | `docs/03` and `docs/04`/`05` assume **both channels run in parallel**. | Impossible solo. One channel only — see §5. |
| C5 | `docs/09` roadmap logs two dissents — SEO deferred, customer validation skipped. Both are still outstanding five months later. | Both are now *overdue*, not deferred. `04-90-DAY-PLAN.md` pays down validation in weeks 1–3 and starts content in week 2. |

---

## 5. The channel decision — this is the one that matters

`docs/04` (board) and `docs/05` (PM) are each written as complete, independent
playbooks, and `docs/05` explicitly warns it is not a variant of `docs/04`. That
is correct and it is exactly why **one person cannot run both.** They are
different buyers, different tones, different cycles, different collateral.

### The case for PM channel
Higher deal value (`docs/05`: ~$15.5k Year 1 vs. ~$3.9k). One relationship
yields 2–15 communities. Volume-tier pricing is already built for it. The live
pricing page already gives the PM tier visual primacy.

### The case against, which is decisive
**There is no product path for a PM.** `/signup?type=pm` renders a page whose
only action is a `mailto:sales@getpropertypro.com` link. No self-serve, no
checkout, no portfolio onboarding. Every PM deal is therefore a fully manual,
high-touch, 25–50 day cycle run entirely by you — with no way to demo a
portfolio view to a prospect without you building it for them by hand first.

A solo founder with zero closed deals cannot survive on a channel where each
deal takes 25–50 days of personal effort and there is no path to the first
reference customer. You would spend the entire 90 days on 3–4 PM prospects and
could plausibly end with nothing.

### Recommendation: **board channel first, PM as opportunistic follow-on**

Run `docs/04` (board channel, 21–40 day cycle, $199/mo). Reasons:

1. **A funnel exists.** Self-serve signup works for condo/HOA. The marketing
   site has a working compliance checker that CTAs into it.
2. **Shorter cycle → faster learning.** You need to know whether the pitch works
   in weeks, not quarters. Five board conversations teach more than one PM pilot.
3. **Board customers become PM ammunition.** The single most effective PM pitch
   is "three of the associations you'd inherit already run on this." You cannot
   make that pitch today. Board wins manufacture it.
4. **It matches the product's shipped strength** — statutory compliance depth,
   which a self-managed board feels acutely and a PM firm partly absorbs itself.

**Opportunistic exception:** if an inbound PM appears, take the meeting. Do not
*prospect* PMs in the first 90 days.

---

## 6. What this reconciliation does not resolve

Stated plainly so it is not mistaken for settled:

- **Pricing against a $55 incumbent is unvalidated.** $199 may be correct, but no
  customer has ever been asked to pay it. Weeks 1–3 discovery must test it.
- **Palm Beach County geographic focus is inherited, not re-verified.** It is
  probably still right (density), but it was chosen in February for reasons that
  included in-person door-knocking, which may not match how you actually want to
  work.
- **No decision here on whether to charge a setup fee.** See `02-POSITIONING.md` §4.2.
</content>
</invoke>

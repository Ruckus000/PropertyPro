# Launch Readiness Assessment

**Date:** 2026-08-05
**Question answered:** if a board president decided to buy tomorrow, what breaks?
**Method:** route-tree and source inspection on `main` @ `3fcc993`.

---

## Verdict

**The transactional path works. The demand-capture path does not.**

A condo/HOA board can sign up, verify email, and reach a real Stripe checkout
that creates a subscription — that machinery is built and defensively written
(the subscribe route explicitly guards against billing-identity rebinding and
double-subscription). This is further along than most pre-revenue products.

What is missing is everything *before* the decision: the site captures no leads,
publishes no content, and shows placeholder social proof. And the PM tier that
the pricing page visually emphasizes has no funnel behind it at all.

**Nothing here blocks starting outbound in week 1.** The board-channel motion in
`04-90-DAY-PLAN.md` is human-driven — you call, you demo, you run the audit. The
blockers below throttle *scale* and *inbound*, which matter from roughly week 4.
Fix them in that order.

---

## A. What works — verified

| Area | Status | Evidence |
|---|---|---|
| Self-serve signup (condo/HOA) | Works | `(auth)/signup` → `SignupForm`, email verification, plan param |
| Stripe checkout | Works | `/api/v1/subscribe` — resolves price by plan + community type + interval, creates session, webhook-driven activation |
| Onboarding | Works | `/api/v1/onboarding/condo`, `/apartment`, `/checklist` |
| Compliance engine | Works | Scoring, 30-day/14-day/48-hour windows |
| Feature depth for the pitch | Strong | Violations, ARC, payments, assessments, elections, e-sign, finance all shipped (`01-RECONCILIATION.md` §2) |
| Demo instances | Works | `/demo/[slug]` — public demo landing with branding + role entry, conversion + expiry lifecycle |
| Per-community public site | Works | `public-site/[[...slug]]`, `[subdomain]`, transparency pages |

The demo-instance system is a significant and underused asset. `docs/04`'s
"pre-built portal on THEIR data" opening depends on exactly this, and it exists.

---

## B. Blockers — ranked

### B1 — The compliance checker captures nothing. *(highest ROI, smallest fix)*

`components/marketing/compliance-checker.tsx` lets a visitor enter their
association type and unit count and tells them whether they're legally required
to have a portal. It is entirely client-side: it renders a result and a link to
`/signup`. No email, no name, no association, nothing persisted.

This is the **highest-intent moment anywhere on the site** — someone has just
self-identified as a qualified prospect (type + unit count = your exact ICP
filter) and learned they have a legal obligation. Today, if they don't click
straight through to signup, they vanish without a trace.

For a solo founder whose scarcest asset is qualified names, this is the single
most costly gap on the site.

**Fix:** capture email (+ association name, optional) before or alongside the
result, persist it, and notify. Half a day of work.
**Decision needed:** where leads land — a DB table, Resend notification, or both.

### B2 — No content surface at all

The marketing app has **four routes**: home, transparency, and two legal pages.
There is no `/blog`, no `/resources`, no per-statute landing pages.

`docs/09` logged this as a dissent in **March** — "SEO deferred to Phase 3,
content takes 3–6 months to compound, competitors are actively publishing." Five
months later there is still no surface to publish onto. Competitors named in the
February plan (CONDUU, Neigbrs) have been compounding that entire time.

The compounding argument is now *stronger*, not weaker: you are five months
behind, and the only way that gap ever closes is to start. Every week of further
delay pushes first organic traffic out by a week.

**Fix:** a minimal MDX route (`/resources/[slug]`) is enough. Do not build a CMS.
**Effort:** 1–2 days for the route; the ongoing cost is writing, not engineering.

### B3 — The PM tier is emphasized but has no funnel

`pricing-section.tsx` gives the Property Manager tier the featured treatment
(`mk-feat`, "primary emphasis" per the source comment) and prices it
**"Let's talk."** `/signup?type=pm` renders a page whose only action is a
`mailto:sales@getpropertypro.com` link.

So the most visually prominent thing on the pricing page routes to an email
client. There is no form, no calendar link, no lead record.

Given the channel decision in `01-RECONCILIATION.md` §5 (board first, PM
opportunistic), this doesn't need a full PM onboarding flow. But a `mailto:` is a
poor container for an inbound PM — the highest-value lead type you can receive.

**Fix (minimal):** replace the mailto with a real inbound form, or a booking
link, and demote the PM tier's visual emphasis to match where you're actually
selling. Half a day.

### B4 — Placeholder social proof is live on the marketing site

Two components ship placeholder content, and the source is candid about it:

- `testimonial-section.tsx` — *"Placeholder quote until a real one lands."*
- `logo-proof-section.tsx` — *"Placeholder management-company names — swap for
  real customers when available."* Rendered under the caption *"Illustrative
  management-company names (examples)."*

The logo section is at least disclosed. The testimonial's disclosure is a code
comment, which the visitor does not read.

**This matters more for us than for most products.** The buyer is a fiduciary
purchasing a *compliance and records-integrity* product, partly to protect
themselves from a records-accuracy claim. Discovering that the vendor's own
homepage showed a testimonial nobody said is disproportionately damaging — it
attacks the exact attribute we're selling.

**Fix:** remove or clearly label both until real proof exists. Under an hour.
Do this before any outbound points a prospect at the site.

### B5 — Thin operational surfaces

Amenities, reservations, and work orders have API routes and schema but only a
single `communities/[id]/operations` page.

**Not a launch blocker** for a self-managed 25–149 unit condo — these are
conveniences, not statutory. Flagged only so it isn't promised in a demo. Do not
build these before revenue.

---

## C. Recommended sequence

| When | Item | Why then |
|---|---|---|
| Before first outbound | **B4** (placeholder proof) | Credibility risk; under an hour |
| Week 1–2 | **B1** (checker lead capture) | Every day it's unfixed, qualified names are lost |
| Week 2–3 | **B2** (content route) | Longest compounding lag — start it early even though it pays off late |
| Week 3–4 | **B3** (PM inbound form) | Only matters once traffic exists |
| Not now | **B5** (ops surfaces) | No revenue depends on it |

**Total engineering: roughly 3–4 days**, spread over the first month, alongside
selling. That is the correct ratio for a solo founder at this stage — you are not
blocked on building, and the plan should not let you retreat into building.
</content>
</invoke>

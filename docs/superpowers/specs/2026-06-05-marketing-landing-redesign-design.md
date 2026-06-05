# Marketing Landing Page Redesign — "Florida Modern" (Direction D)

**Date:** 2026-06-05
**Status:** Approved design, pending implementation plan
**Scope:** The public marketing homepage at `getpropertypro.com` (`apps/web/src/app/(marketing)/page.tsx` and `apps/web/src/components/marketing/*`).

---

## 1. Goal

Graduate the landing page from a competent-but-generic compliance scare-page into a warm,
premium, product-forward page in the spirit of Stripe / Atlassian — while keeping the
Florida-statute compliance angle as the strategic wedge.

**Primary buyer:** property managers — CAMs and management companies running **portfolios of
multiple associations**. Self-managed condo/HOA boards are the secondary audience.

This decision shifts copy and emphasis (the warm "Florida Modern" aesthetic from the approved
mockup is unchanged):

- **Hero** leads with the portfolio value prop — "Run your whole portfolio compliant" rather
  than "Run your community" — and the hero product card shows a **multi-association portfolio
  view** (a list of communities each with its own compliance score) instead of a single
  building. Boards are still welcomed in a secondary line.
- **Social proof / logo strip** features **management companies** (placeholder names), not
  single associations.
- **Testimonial** comes from a **CAM / property manager** ("…across 14 buildings"), not a
  single board president.
- **Features** elevates the portfolio/bulk/white-label/centralized-compliance capabilities to
  the **hero feature**; per-association tools (owner portal, notices, documents) become the
  supporting grid. The old "For managers" single card is no longer needed as a secondary
  mention — managers are the spine of the page.
- **Pricing** keeps all three tiers, but the **Property Manager** tier is positioned as the
  primary/most-relevant path (the "Most popular" emphasis moves accordingly, with per-seat or
  volume framing in the copy); Essentials/Professional remain for self-managed boards.
- **How it works** frames the three steps at portfolio scale (onboard a community →
  bulk-load documents → invite boards & owners).

---

## 2. Problems being fixed (from the audit)

The current page (`page.tsx` + 5 `marketing/*` components) is technically clean but has
six gaps:

1. **The product is invisible** — zero screenshots or UI anywhere. The new design shows
   product UI (compliance score ring, document list, dashboard) in the first viewport.
2. **All fear, no relief** — messaging is one-note penalty/deadline. The new copy pairs the
   legal obligation with the payoff ("the easiest way you've ever run your community").
3. **No social proof** — no logos, names, testimonial, or counts. Added: a Florida-association
   logo strip + a board-president testimonial.
4. **Generic visual language** — blue-on-gray default SaaS. Replaced with a distinctive warm
   "Florida Modern" palette + serif display.
5. **IA gaps** — the old "See How It Works" CTA pointed nowhere. Added a real How-It-Works
   section and an FAQ that handles board objections (required? hard? data-safe?).
6. **Flat features** — six equal cards. Now: one hero feature (dashboard, shown) + a 6-card grid.

---

## 3. Chosen direction: "Florida Modern"

Warm, human, premium. Owns a brand in a category where every competitor looks beige.
The look was validated through three companion iterations (`direction-d-v3.html` is the
reference mockup, saved in `.superpowers/brainstorm/`).

### Visual language

- **Palette (warm):**
  - Surfaces: cream `#fdf6ee`, cream-2 `#fbeee1`, card `#fffdfb`, line `#efe2d4`
  - Ink: `#241712` (primary), `#6b574c` (soft/secondary)
  - Brand: coral `#c2533a` (primary action), coral-dark `#a8412c` (hover)
  - Accents: teal `#2f8f83` (success/positive), gold `#e3a93c` (highlight/urgency)
- **Type:** Fraunces (warm display serif) for h1–h4 / numbers; Inter for body & UI. Italic
  Fraunces "swash" for the accent word in the hero headline.
- **Shape:** generous radii (cards ~16–22px, pill buttons fully rounded), soft warm shadows
  (`0 18px 40px -20px rgba(80,40,20,.35)`), borders-first.
- **Layout:** content max-width **1680px**, **56px** gutters; section padding **64px**.
  Structural sections fill the width; reading-heavy blocks (pricing, FAQ, testimonial,
  footer) are capped (~1180–1300px) for legibility.
- **Motion:** subtle — pulse dot on the hero badge, nav underline-on-hover, button
  lift-on-hover. All must respect `prefers-reduced-motion`.

### Relationship to the existing design system (key decision)

The project's global design system (`.claude/rules/design.md`, `packages/ui/tokens`) is
**blue/gray + Inter only**. Direction D's warm palette + serif is intentionally a
**marketing-only visual layer**, scoped to the `(marketing)` route group — it does NOT
change the app's product tokens. Implementation introduces a marketing-scoped token set
(CSS variables on a marketing wrapper, or a `marketing-tokens.css` imported only by the
marketing layout) plus the Fraunces font loaded only on marketing routes. The authenticated
app keeps its existing tokens untouched. This boundary is a hard requirement and a primary
review checkpoint.

---

## 4. Page structure (section inventory)

In order, top to bottom. Each maps to a component under `components/marketing/`.

| # | Section | Anchor | Notes |
|---|---------|--------|-------|
| 1 | **Nav** | — | Sticky, blur background. Logo (jumps to top) + in-page anchor links (Product, Compliance, How it works, For managers, Pricing) + Log in + "Get started" pill. Smooth-scroll, `scroll-margin-top` so sections clear the sticky bar. |
| 2 | **Hero** | `#top` | Two columns: copy left (badge, serif headline leading with the **portfolio** value prop, relief-framed lede, dual CTA, trust micro-row, secondary "self-managed board? you're covered too" line) + **portfolio product card** right (browser frame, a list of 3–4 communities each with its own compliance score + an aggregate portfolio score) + floating "managing N communities" chip. Warm radial "sun" backdrop. |
| 3 | **Logo proof** | — | "Trusted by management companies across Florida" + 5 management-company names (placeholder). |
| 4 | **Compliance / Relief** | `#compliance` | "The law changed. We handle it." Left: 3 statute obligations (30-day posting, notice timing, audit-ready). Right: dark **"Is your association required?" checker** (unit-count input → obligation + Jan 1 2026 deadline + $50/day penalty, framed as avoidable). |
| 5 | **How it works** | `#how` | 3 steps (spin up site → drop in documents → invite owners), each with a mini-UI thumbnail. Fixes the dead "See How It Works" CTA. |
| 6 | **Features** | `#features` | Hero feature = **portfolio compliance dashboard** (multi-association view with bulk actions, white-label, centralized compliance), with UI panel. Supporting 6-card grid of per-association tools: Document management, Meeting notices, Owner portal, Mobile access, Announcements, Compliance dashboard (`#managers` anchor lands here). |
| 7 | **Testimonial** | — | **CAM / property-manager** quote w/ highlight, avatar, attribution (e.g. "…across 14 buildings"). |
| 8 | **Pricing** | `#pricing` | 3 tiers (Essentials $199, Professional $349, Property Manager "Let's talk"). **Property Manager tier positioned as the primary path** (emphasis/ribbon moves to it); Essentials/Professional retained for self-managed boards. Same plan content as today, restyled warm. |
| 9 | **FAQ** | — | 4 objection-killers: required?, technical?, data secure?, already have a website? (Static accordion-style cards; expand interaction optional for v1.) |
| 10 | **Final CTA** | — | Coral gradient band, "Beat the deadline this week," dual CTA. |
| 11 | **Footer** | — | Warm dark (`--ink`). Product / Company / Legal columns + the existing legal disclaimer ("not a law firm…"). |

---

## 5. Component plan

Existing marketing components are **replaced/rewritten**, not patched, since the visual
language changes wholesale. Keep them as small, single-purpose files under
`components/marketing/` matching the current structure.

- **Rewrite:** `hero-section.tsx`, `features-section.tsx`, `compliance-urgency-section.tsx`
  (→ relief framing + checker), `pricing-section.tsx`, `footer.tsx`, and the inline
  `MarketingNav` in `page.tsx` (extract to `marketing-nav.tsx`).
- **New:** `how-it-works-section.tsx`, `logo-proof-section.tsx`, `testimonial-section.tsx`,
  `faq-section.tsx`, `final-cta-section.tsx`. Small shared bits: `portfolio-card.tsx` (the hero
  multi-association portfolio view — list of communities each with a score + aggregate),
  reused/adapted as the features-hero panel; `compliance-checker.tsx`.
- **Tokens/fonts:** marketing-scoped token CSS + Fraunces font wiring in
  `app/(marketing)/layout.tsx` (which today is metadata-only).
- **`page.tsx`:** composes the 11 sections in order.

Build with Tailwind + the marketing token CSS variables and `cn()`, consistent with project
conventions. No new component library; own the source.

---

## 6. Interactive checker (§4) — scope

v1: client component. Input = unit/parcel count + (optionally) association type. Output =
plain-language obligation + deadline + penalty, computed from a small static rules map
(condo 25+/150+, HOA 100+). **No backend call, no PII stored.** It mirrors the existing
compliance thresholds but is marketing copy, not legal advice (see §8). Deadline/threshold
logic should reference the same statute facts used elsewhere so the two never drift.

---

## 7. Responsive behavior

- Desktop ≥1100px: full two-column hero/relief/features, 3-up grids.
- Tablet (≤1100px): gutters shrink to 32px.
- Mobile (≤880px): all two-column grids stack to one column; 3-up grids → single column;
  hero headline scales down (~46px); nav links collapse (hamburger / simplified — to be
  detailed in the plan); touch targets ≥44px per design.md.

---

## 8. Constraints & compliance

- **Not legal advice.** All statute/penalty/deadline copy is factual and must retain the
  "PropertyPro is not a law firm" disclaimer (footer). The checker outputs general
  information, not a legal determination — wording must reflect that.
- **Statute accuracy.** Thresholds and dates (§718.111(12)(g) condos 25+/150+, §720.303 HOAs
  100+, 30-day posting, 48h/14d notices, Jan 1 2026) must match the project's existing
  compliance facts. No new legal claims.
- **Accessibility (design.md):** never suppress `:focus-visible`; decorative icons
  `aria-hidden`; status by icon+text+color, not color alone; body text ≥16px; respect
  `prefers-reduced-motion`; color contrast AA on the warm palette (verify coral-on-cream and
  soft-ink contrast during build).
- **No global token changes.** Marketing palette stays scoped to the marketing route group.

---

## 9. Out of scope / YAGNI / open questions

- **Real photography** of Florida buildings — deferred; v1 uses palette + product UI + the
  radial "sun" motif. (Direction D can incorporate photography later.)
- **FAQ expand/collapse animation** — optional for v1; static cards acceptable.
- **A/B testing infra, analytics events, SEO copy expansion** — out of scope here (the
  existing `(marketing)/layout.tsx` metadata is retained/updated, not rebuilt).
- **Resolved — primary buyer:** property managers (see §1). Page is PM-first; boards secondary.
- **Resolved — proof content:** use **placeholder** management-company names and a
  representative CAM testimonial for v1; swap in real names/quotes when provided.

---

## 10. Reference

- Approved mockup: `.superpowers/brainstorm/35120-1780689478/content/direction-d-v3.html`
- Current implementation: `apps/web/src/app/(marketing)/page.tsx`,
  `apps/web/src/components/marketing/{hero,features,compliance-urgency,pricing,footer}-section.tsx`
- Design system rules: `.claude/rules/design.md`, `DESIGN.md`
- Compliance rules: `.claude/rules/florida-compliance.md`

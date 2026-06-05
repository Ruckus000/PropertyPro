# Marketing Landing Page Redesign — "Florida Modern" (Direction D)

**Date:** 2026-06-05
**Status:** Approved design, pending implementation plan
**Scope:** The public marketing homepage at `getpropertypro.com` (`apps/web/src/app/(marketing)/page.tsx` and `apps/web/src/components/marketing/*`).

---

## 1. Goal

Graduate the landing page from a competent-but-generic compliance scare-page into a warm,
premium, product-forward page in the spirit of Stripe / Atlassian — while keeping the
Florida-statute compliance angle as the strategic wedge.

**Primary buyer (assumption):** self-managed condo/HOA boards (volunteer presidents and
board members). Property managers are a secondary audience, surfaced via a dedicated
"For managers" feature card and pricing tier. _Open to revisiting — see §9._

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
| 2 | **Hero** | `#top` | Two columns: copy left (badge, serif headline "Run your community like it's *2026.*", relief-framed lede, dual CTA, trust micro-row) + **product card** right (browser frame, compliance score ring 86%, 3-row document list with status pills) + floating "+38 owners active" chip. Warm radial "sun" backdrop. |
| 3 | **Logo proof** | — | "Trusted by associations across Florida" + 5 association names (placeholder, real ones TBD). |
| 4 | **Compliance / Relief** | `#compliance` | "The law changed. We handle it." Left: 3 statute obligations (30-day posting, notice timing, audit-ready). Right: dark **"Is your association required?" checker** (unit-count input → obligation + Jan 1 2026 deadline + $50/day penalty, framed as avoidable). |
| 5 | **How it works** | `#how` | 3 steps (spin up site → drop in documents → invite owners), each with a mini-UI thumbnail. Fixes the dead "See How It Works" CTA. |
| 6 | **Features** | `#features` | Hero feature (Compliance dashboard, with UI panel) + 6-card grid: Document management, Meeting notices, Owner portal, Mobile access, Announcements, For property managers (`#managers` anchor target). |
| 7 | **Testimonial** | — | Board-president quote w/ highlight, avatar, attribution. |
| 8 | **Pricing** | `#pricing` | 3 tiers (Essentials $199, Professional $349 featured, Property Manager "Let's talk"). Same plan content as today, restyled warm. |
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
  `faq-section.tsx`, `final-cta-section.tsx`. Small shared bits: `product-card.tsx`
  (the hero score-ring + doc list, reused as the features-hero panel), `compliance-checker.tsx`.
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
- **Open question — primary buyer:** built board-first. If PMs are the priority, the hero
  copy and the "For managers" emphasis shift. Flag before/at plan time.
- **Open question — real association names** for the logo strip and a real (or clearly
  representative) testimonial. Placeholder content used until provided.

---

## 10. Reference

- Approved mockup: `.superpowers/brainstorm/35120-1780689478/content/direction-d-v3.html`
- Current implementation: `apps/web/src/app/(marketing)/page.tsx`,
  `apps/web/src/components/marketing/{hero,features,compliance-urgency,pricing,footer}-section.tsx`
- Design system rules: `.claude/rules/design.md`, `DESIGN.md`
- Compliance rules: `.claude/rules/florida-compliance.md`

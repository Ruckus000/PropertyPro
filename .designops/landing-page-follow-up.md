# Marketing landing page follow-up — draft

Status: preserved for a later review; not the current Website-tab scope.

## Original scope

The public marketing landing page at `apps/web/src/app/(marketing)/page.tsx`, including its sticky anchor navigation and route-scoped marketing theme.

## Notes preserved

- The marketing nav mixes product taxonomy (`Product`, `Compliance`), process (`How it works`), audience (`For managers`), and pricing. That can make an in-page click feel like a change in mode rather than movement within one story.
- `#managers` is nested inside the Features section while being presented as a peer nav destination. Either make it a true peer section or rename the nav destination to the parent concept.
- The page is a long sequence of visually similar bands and card groups. A clearer narrative spine would be: outcome-led hero, proof/product overview, compliance story, portfolio story, pricing, FAQ, and CTA.
- The marketing route intentionally uses a parallel `--mk-*` theme layer: warm cream surfaces, coral primary, teal information accent, Fraunces display type, rounded cards, and sticky translucent navigation. Any redesign should remain aligned with the shared Florida Modern token intent.
- The logo-proof strip explicitly labels its management-company names as illustrative placeholders. It should not read as verified customer proof until approved evidence exists.
- Browser review should verify anchor navigation, mobile menu behavior, keyboard focus, skip link, reduced motion, and horizontal overflow at 375×812, 768×1024, 1024×768, and 1440×1000.

## Evidence references

- `apps/web/src/app/(marketing)/page.tsx`
- `apps/web/src/components/marketing/marketing-nav.tsx`
- `apps/web/src/app/(marketing)/marketing-theme.css`
- `apps/web/src/components/marketing/logo-proof-section.tsx`
- `DESIGN.md`

This note intentionally records the earlier findings without treating them as approved requirements or validated user research.

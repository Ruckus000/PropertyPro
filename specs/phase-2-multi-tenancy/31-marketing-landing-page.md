# Spec: P2-31 — Marketing Landing Page

> Build the marketing landing page with value proposition, pricing tiers, and call-to-action.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P0-03

## Functional Requirements
- Route at / (root) or www subdomain
- Content: value proposition for FL compliance, feature highlights
- Pricing tiers adapted by community type (condos/HOAs: $99/mo basic, $199/mo + mobile; apartments: separate lower pricing TBD)
- Screenshots/phone-frame demo
- "Get Started" CTA button
- Footer: Terms of Service link (/legal/terms), Privacy Policy link (/legal/privacy)
- SEO: meta tags, Open Graph, structured data for Florida-specific keywords
- Mobile responsive

## Acceptance Criteria
- [ ] Landing page renders with all content sections
- [ ] CTA button navigates to signup form
- [ ] Terms and Privacy links work
- [ ] Page passes basic SEO checks (meta tags present)
- [ ] Mobile layout works
- [ ] pnpm test passes

## Technical Notes
- Use design system components for consistency
- Implement structured data for Florida-specific compliance keywords
- Test CTA routing on staging environment

## Files Expected
- apps/web/src/app/(marketing)/page.tsx
- apps/web/src/components/marketing/hero.tsx
- apps/web/src/components/marketing/pricing.tsx
- apps/web/src/components/marketing/features.tsx
- apps/web/src/components/marketing/footer.tsx

## Attempts
0

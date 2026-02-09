# Spec: P1-23 — Public Website

> Build the public-facing community website with required statutory pages for condo and HOA communities.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P0-03
- P1-16

## Functional Requirements
- Renders at community subdomain
- Home page: community name, logo, address, contact info
- Notices page (required for condo/HOA): auto-populated from meeting data, prominently linked from home
- Login portal link
- Contact information
- SEO metadata (meta tags, Open Graph)
- Branded 404 page that does NOT leak other tenant context
- Terms of Service link
- Privacy Policy link
- For apartments: optional public page (simpler layout, no Notices page)

## Acceptance Criteria
- [ ] Public site renders at correct subdomain
- [ ] Notices page shows upcoming meetings with agendas
- [ ] 404 page does not expose other communities' data
- [ ] SEO meta tags present
- [ ] Login link navigates to auth page
- [ ] Apartment communities can optionally enable public site
- [ ] `pnpm test` passes

## Technical Notes
- Subdomain routing: use dynamic routing middleware or DNS configuration
- Notices page auto-generated from meetings with type=board_meeting
- Render based on community_type: show Notices for condo_718/hoa_720, optional for apartments
- 404 page uses Next.js not-found component with custom branding
- SEO: use Next.js metadata API for dynamic meta tags

## Files Expected
- apps/web/src/app/(public)/[subdomain]/page.tsx
- apps/web/src/app/(public)/[subdomain]/notices/page.tsx
- apps/web/src/app/(public)/[subdomain]/not-found.tsx
- apps/web/src/components/public-home.tsx
- apps/web/src/components/public-notices.tsx
- apps/web/src/lib/subdomain-routing.ts
- apps/web/src/__tests__/public-website.test.tsx

## Attempts
0

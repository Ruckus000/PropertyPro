# Spec: P3-48 — Phone Frame Mobile Preview

> Build the interactive phone-frame preview that displays a mobile-styled version of the resident portal.

## Phase
3

## Priority
P1

## Dependencies
- P0-03
- P1-24
- P2-40

## Functional Requirements
- Phone frame component using CSS/SVG iPhone 15 mockup (393x852 CSS pixels)
- Content rendered in same-origin iframe pointing to /mobile/* routes
- Separate Next.js layout for /mobile/* with bottom tab navigation (no sidebar)
- Interactive: scrollable, clickable, real navigation within iframe
- Demo screens: Home/Dashboard, Documents, Meetings (condo/HOA), Announcements, Maintenance
- Adapts to community type
- Placement: marketing pages and optionally admin dashboard as preview tool

## Acceptance Criteria
- [ ] Phone frame renders with correct device dimensions
- [ ] Content inside is interactive (scroll, tap, navigate)
- [ ] Mobile layout uses bottom tabs
- [ ] Content adapts to community type
- [ ] Same-origin iframe shares auth context
- [ ] `pnpm test` passes

## Technical Notes
- Use same-origin iframe to avoid CORS/auth issues
- Beware iframe performance on low-end devices
- Consider lazy loading iframe content
- Test on actual mobile devices for touch responsiveness

## Files Expected
- `apps/web/components/mobile/PhoneFrame.tsx`
- `apps/web/app/mobile/layout.tsx`
- `apps/web/app/mobile/page.tsx`
- `apps/web/app/mobile/documents/page.tsx`
- `apps/web/app/mobile/meetings/page.tsx`
- `apps/web/app/mobile/announcements/page.tsx`
- `apps/web/app/mobile/maintenance/page.tsx`

## Attempts
0

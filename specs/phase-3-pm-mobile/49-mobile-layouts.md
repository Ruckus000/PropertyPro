# Spec: P3-49 — Mobile Layouts

> Build mobile-optimized layouts for the /mobile/* routes with touch-friendly navigation.

## Phase
3

## Priority
P1

## Dependencies
- P3-48
- P0-02
- P0-03

## Functional Requirements
- Bottom tab bar with icons: Home, Documents, Meetings (condo/HOA only), Announcements, More
- Compact card layouts
- Touch-sized tap targets (minimum 44x44px)
- Simplified navigation (no sidebar, no breadcrumbs)
- Pulls same data as desktop resident portal
- Mobile-specific page transitions

## Acceptance Criteria
- [ ] Mobile layouts render correctly at 393x852 viewport
- [ ] Bottom tabs navigate between sections
- [ ] Tap targets meet 44px minimum
- [ ] Meetings tab hidden for apartment type
- [ ] `pnpm test` passes

## Technical Notes
- Use CSS Grid or Flexbox for responsive bottom tab bar
- Ensure safe area insets respected on devices with notches
- Meetings-tab visibility is feature-gated; apartment communities hide Meetings by default in Phase 3 mobile UX.
- Test with actual touch devices to verify tap target sizing
- Monitor performance on devices with limited memory

## Files Expected
- `apps/web/src/components/mobile/BottomTabBar.tsx`
- `apps/web/src/components/mobile/CompactCard.tsx`
- `apps/web/src/app/mobile/layout.tsx`
- `apps/web/src/styles/mobile.css`

## Attempts
1

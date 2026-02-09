# Spec: P4-63 — Accessibility Audit

> Conduct an accessibility audit targeting WCAG 2.1 AA compliance across all portals.

## Phase
4

## Priority
P1

## Dependencies
- P3-54

## Functional Requirements
- Run automated audit (axe-core)
- Manual testing: keyboard navigation, screen reader compatibility, color contrast ratios
- Fix: missing alt text, improper heading hierarchy, missing ARIA labels, focus management, form labels
- Test with: keyboard only, screen reader (VoiceOver/NVDA)
- Document findings and fixes

## Acceptance Criteria
- [ ] No critical axe-core violations
- [ ] All interactive elements keyboard accessible
- [ ] Color contrast meets AA ratios (4.5:1 text, 3:1 large text)
- [ ] Focus management works for modals and navigation
- [ ] `pnpm test` passes

## Technical Notes
- Integrate axe-core into test suite for automated checks
- Test with real screen readers (NVDA for Windows, VoiceOver for Mac)
- Focus on WCAG 2.1 Level AA compliance
- Document all accessibility patterns used in component library
- Consider accessibility review checklist for future PRs

## Files Expected
- `apps/web/__tests__/accessibility/axe-audit.test.ts`
- `docs/ACCESSIBILITY.md` (audit findings and remediation)
- Component accessibility documentation updates

## Attempts
0

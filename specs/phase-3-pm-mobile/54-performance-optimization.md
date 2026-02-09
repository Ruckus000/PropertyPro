# Spec: P3-54 — Performance Optimization

> Optimize the application for Core Web Vitals performance targets across all portals.

## Phase
3

## Priority
P1

## Dependencies
- P3-45
- P3-46
- P3-47
- P3-48
- P3-49
- P3-50
- P3-51
- P3-52
- P3-53

## Functional Requirements
- Measure Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1
- Optimize: image loading (lazy load, WebP, proper sizing), bundle splitting (dynamic imports for heavy components like PDF viewer), server component usage (minimize client JS), API response times (add database indexes where needed)
- React Query stale-while-revalidate for data freshness without loading spinners

## Acceptance Criteria
- [ ] Lighthouse performance score > 80 on key pages
- [ ] LCP under 2.5s
- [ ] No layout shift above 0.1 CLS
- [ ] Bundle size for initial page load under 200KB JS
- [ ] `pnpm test` passes

## Technical Notes
- Use next/image for automatic image optimization
- Profile bundle size using next/bundle-analyzer
- Implement dynamic imports for code splitting heavy components
- Monitor Core Web Vitals in production using web-vitals library
- Consider implementing prefetching for likely navigation paths

## Files Expected
- `apps/web/lib/performance/vitals-monitor.ts`
- `apps/web/next.config.js`
- `apps/web/middleware.ts`
- Various component refactors for dynamic imports

## Attempts
0

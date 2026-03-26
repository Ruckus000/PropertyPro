# Navigation Performance Remediation Implementation Plan

**Date:** March 25, 2026  
**Status:** In progress  
**Spec:** `docs/specs/navigation-performance-remediation-spec.md`

## Objective

Ship the remediation in small, verifiable phases so we improve navigation immediately, reduce architectural latency in the right order, and avoid mixing UX work with auth refactors in one risky release.

## Delivery Sequence

### Phase 1: Immediate UX and routing cleanup

**Goal:** Remove avoidable first-party redirect hops and make route transitions visibly responsive.

**Implementation**

1. Add route-level `loading.tsx` boundaries for:
   - `apps/web/src/app/(authenticated)`
   - `apps/web/src/app/mobile`
   - `apps/web/src/app/(authenticated)/pm/reports`
   - `apps/admin/src/app/dashboard`
   - `apps/admin/src/app/clients`
   - `apps/admin/src/app/clients/[id]`
   - `apps/admin/src/app/deletion-requests`
   - `apps/admin/src/app/demo`
   - `apps/admin/src/app/settings`
2. Update first-party navigation sources to use canonical destinations:
   - sidebar nav
   - command palette page links
   - command palette "View all" links
3. Add focused regression tests for canonical route generation and loading-state helpers.

**Verification**

- Primary sidebar links no longer target compatibility redirect pages.
- Command palette "View all" links no longer point at legacy bridge routes.
- Route transitions show loading UI instead of a blank wait.

### Phase 2: Remove duplicated auth and page-context work

**Goal:** Eliminate repeated auth and community-resolution work during one navigation.

**Implementation**

1. Refactor `packages/db/src/supabase/middleware.ts` to skip `auth.getUser()` when no auth cookie is present.
2. Refactor web and admin middleware to reuse the resolved middleware user instead of calling `auth.getUser()` again.
3. Introduce page-only request context helpers for middleware-authenticated page rendering.
4. Add request-local memoization for user, membership, branding, and shell context.
5. Refactor authenticated web layout and mobile layout/page to consume the shared page context.

**Verification**

- Middleware resolves auth at most once per request.
- Page render trees stop calling Supabase auth again for initial page auth.
- API handlers still use strict auth verification.

### Phase 3: Move admin landing pages to server-first initial data

**Goal:** Remove shell-first plus mount-fetch behavior from primary admin routes.

**Implementation**

1. Extract shared admin server loaders.
2. Move initial dashboard, deletion requests, and demo data loading into server pages.
3. Pass `initialData` into client components.
4. Keep API routes for mutations and manual refresh paths.

**Verification**

- `/dashboard`, `/deletion-requests`, and `/demo` render meaningful initial content without a client bootstrap fetch.

### Phase 4: Reduce shared client baseline

**Goal:** Shrink the per-route JS cost after the server-side latency work is done.

**Implementation**

1. Lazy-load the command palette.
2. Localize or defer motion-heavy providers.
3. Split PM reports by tab.
4. Measure deferred browser Sentry initialization and ship it only if the payload reduction is worthwhile.

**Verification**

- Shared route payloads drop measurably.
- PM reports becomes materially smaller on initial load.

### Phase 5: Enforce and document

**Goal:** Prevent regression and leave behind clear evidence.

**Implementation**

1. Extend perf checks to cover admin routes.
2. Add navigation and SSR-first regression tests.
3. Publish a post-change audit with before/after payload and request-flow evidence.

**Verification**

- Perf checks fail on route budget regressions.
- Audit evidence exists in `docs/audits/`.

## PR Breakdown

1. `PR 1`: Phase 1 loading boundaries plus canonical nav cleanup
2. `PR 2`: middleware and page-context dedupe
3. `PR 3`: admin server-first initial data
4. `PR 4`: bundle reduction work
5. `PR 5`: perf-gate hardening and final audit

## Rollout Notes

- Keep compatibility redirect pages in place until Phase 5 so legacy bookmarks and email links continue to work.
- Do not mix Phase 2 auth trust changes with Phase 4 bundle work in the same PR.
- Re-run `pnpm perf:check` after every phase that changes route composition.

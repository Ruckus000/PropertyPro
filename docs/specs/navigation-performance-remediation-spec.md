# Navigation Performance Remediation Spec

**Date:** March 25, 2026  
**Status:** Draft  
**Scope:** `apps/web`, `apps/admin`, shared auth/middleware, shared authenticated shell, route-level loading UX, build/perf gates  
**Primary objective:** Make navigation feel immediate and materially reduce real route latency without weakening tenant isolation, admin auth, or existing security controls.

---

## 1. Executive Summary

Navigation is slow in both the main web app and the operator console because the current architecture charges a repeated server-side auth and context-resolution tax on nearly every click before route-specific work even begins. The worst-case flow in the web app is:

1. Middleware refreshes Supabase session
2. Middleware calls `auth.getUser()`
3. Middleware may call `auth.getUser()` again on branch-specific logic
4. Authenticated layout calls `auth.getUser()` again
5. Layout resolves community by fetching all user communities
6. Page calls `requireAuthenticatedUserId()`
7. Page calls `requireCommunityMembership()`
8. Some pages immediately redirect to a second route
9. No `loading.tsx` exists to provide instant feedback while all of the above happens

The admin app has the same auth duplication and then adds a second problem: several primary pages render a thin shell and fetch the actual page data only after mount via `/api/admin/*`, which creates an unnecessary second HTTP round-trip after navigation.

This spec addresses both real latency and perceived latency through five coordinated workstreams:

1. Add route-level loading boundaries and remove first-party redirect hops
2. Consolidate auth/context resolution to one trusted page-level request context per navigation
3. Refactor admin landing pages to server-first initial data loading
4. Slim the shared client baseline by lazy-loading non-critical global UI and heavy route-specific modules
5. Add measurement, CI perf gates, and regression tests so the problem does not return

This is not a spinner-only fix and not a bundle-only fix. The primary issue is duplicated server work. Missing loading boundaries and oversized shared client bundles make the pain more visible.

---

## 2. Current-State Evidence

### 2.1 Verified code-path evidence

**Repeated auth resolution**

- `packages/db/src/supabase/middleware.ts` always calls `supabase.auth.getUser()` during middleware client creation.
- `apps/web/src/middleware.ts` calls `supabase.auth.getUser()` again in protected-path handling and on additional auth/public branches.
- `apps/web/src/app/(authenticated)/layout.tsx` calls `createServerClient().auth.getUser()` again.
- Most authenticated pages then call `requireAuthenticatedUserId()`, which calls `auth.getUser()` again via `apps/web/src/lib/api/auth.ts`.
- Admin middleware calls `auth.getUser()` and admin pages or admin APIs often call `requirePlatformAdmin()` again.

**No route loading boundaries**

- `apps/web/src/app`: `0` `loading.tsx`, `0` `template.tsx`
- `apps/admin/src/app`: `0` `loading.tsx`, `0` `template.tsx`

**First-party redirect bridges still used in active navigation flows**

- Compatibility routes:
  - `/documents -> /communities/:id/documents`
  - `/payments -> /communities/:id/payments`
  - `/finance -> /communities/:id/finance`
  - `/assessments -> /communities/:id/assessments`
- These bridge routes remain in active navigation helpers and command/search surfaces.

**Admin post-mount fetch pattern on primary screens**

- `/dashboard` renders the shell, then fetches `/api/admin/stats` in the client
- `/deletion-requests` renders the shell, then fetches `/api/admin/deletion-requests` in the client
- `/demo` renders the shell, then fetches `/api/admin/demos` in the client

### 2.2 Verified emitted route payloads

From emitted Next.js build artifacts and `pnpm perf:check`:

| Route | JS payload |
|------|-----------:|
| Web dashboard | 612.9 KiB |
| Web maintenance inbox | 625.9 KiB |
| Web mobile home | 847.5 KiB |
| Web PM reports | 1146.9 KiB |
| Admin dashboard | 563.9 KiB |
| Admin clients | 781.6 KiB |
| Admin deletion requests | 589.0 KiB |
| Admin settings | 561.8 KiB |

Additional artifact inspection shows:

- A large shared browser chunk is loaded on most routes in both apps
- The Sentry browser bundle is present in that shared chunk
- Web mobile and PM reports load additional heavy chunks for motion/query/chart-heavy UI

### 2.3 External guidance verified

This spec aligns with current official guidance from:

- Next.js App Router linking, loading UI, and prefetching
- Supabase server-side auth guidance
- Supabase `auth.getUser()` reference, which explicitly notes network validation behavior

References are listed in Section 14.

---

## 3. Root Cause

### 3.1 Primary root cause

**Duplicated auth and context resolution across middleware, layouts, and pages.**

The same navigation repeatedly resolves the same user and the same community membership in multiple layers that do not currently share a request-local source of truth.

### 3.2 Secondary root causes

**Missing App Router loading boundaries.**  
Even when dynamic rendering is unavoidable, the current route tree gives users no immediate visual response while the server is working.

**Primary navigation still uses compatibility redirect routes.**  
Some first-party links still route through pages that immediately redirect, turning one click into two route loads.

**Admin landing screens are not server-first.**  
They navigate to a shell, then fetch real content after mount, causing a second request after navigation.

### 3.3 Tertiary contributing factors

**Oversized shared client baseline.**  
Global client features such as browser Sentry, motion configuration, command palette wiring, and broad shell concerns increase the cost of almost every route.

**Heavy feature routes are not split aggressively enough.**  
PM reports especially load too much charting UI up front.

---

## 4. Goals

1. Navigation to primary authenticated routes should show visible progress immediately via route-level loading UI.
2. Authenticated page navigations should resolve user auth once in middleware and should not perform additional page-tree `auth.getUser()` network calls for initial render.
3. Community context should be resolved once per page render tree and reused by the authenticated shell and page components.
4. Primary navigation must use canonical destination URLs only.
5. Admin dashboard, deletion requests, and demo list must load initial content server-side, not via post-mount bootstrap fetches.
6. Shared client JS must be reduced materially on both apps, with route-specific heavy features loaded only when needed.
7. The fix must preserve tenant isolation, platform-admin authorization, and current API handler security expectations.
8. Performance must be measured and enforced in CI so regressions are caught early.

---

## 5. Non-Goals

1. Replace Supabase Auth
2. Remove middleware-based auth enforcement
3. Change tenant isolation architecture or RLS policy design
4. Convert all authenticated routes to static generation
5. Redesign the entire UI or information architecture
6. Remove compatibility redirect routes for bookmarked legacy URLs in the initial rollout

---

## 6. Constraints

### 6.1 Security and tenancy constraints

- `createScopedClient()` remains the default for tenant data
- Unscoped access remains limited to existing approved escape hatches
- Page performance changes must not bypass authorization checks in API routes
- Admin app service-role access patterns remain intact

### 6.2 Framework constraints

- The apps use Next.js App Router and React Server Components
- Route-level loading UI should use standard App Router conventions (`loading.tsx`)
- Request-local caching must remain request-local; no user-specific data may be cached across requests

### 6.3 Operational constraints

- This repo currently has build-time sensitivity to missing `DATABASE_URL`
- The web app already has a `perf:check`; the admin app does not
- The repo docs currently state Next.js 15.1.0, but emitted builds report 15.5.12, so spec changes must be validated against actual installed behavior

---

## 7. Proposed Solution Overview

The remediation will ship in five workstreams.

### Workstream A: Navigation Feedback and Canonical Route Cleanup

- Add `loading.tsx` to key route groups and high-traffic routes
- Stop using compatibility redirect pages in first-party navigation
- Keep bridge pages for legacy deep links during the migration window

### Workstream B: Request-Local Page Auth and Context Consolidation

- Resolve Supabase user once in middleware when auth cookies are present
- Reuse the middleware-authenticated result in page rendering
- Introduce page-only request context helpers that trust middleware-forwarded headers after spoofed inbound headers have been stripped
- Use request-local memoization for community membership, branding, and shell context
- Keep strong route-handler auth checks for APIs and server mutations

### Workstream C: Admin Server-First Initial Data

- Move initial dashboard, deletion requests, and demo-list data loading to the server page layer
- Extract shared data loaders used by both pages and API routes
- Reserve client fetches for mutations, filters, and incremental refresh

### Workstream D: Shared Client Bundle Reduction

- Remove eager loading of non-critical global client UI from the authenticated shell
- Lazy-load command palette, PM report tabs, and other route-specific heavy UI
- Re-evaluate browser Sentry bootstrapping so it does not dominate critical-path bundles
- Remove global motion wiring from routes that do not need it

### Workstream E: Measurement, CI, and Regression Safety

- Add admin route payload checks similar to the existing web perf check
- Add tests for canonical navigation, loading boundaries, and admin SSR-first behavior
- Add a small navigation performance baseline document for future regression tracking

---

## 8. Detailed Design

## 8.1 Workstream A: Navigation Feedback and Canonical Route Cleanup

### A.1 Add route-level loading UI

Create `loading.tsx` boundaries for:

**Web**

- `apps/web/src/app/(authenticated)/loading.tsx`
- `apps/web/src/app/mobile/loading.tsx`
- `apps/web/src/app/(authenticated)/pm/reports/loading.tsx`
- `apps/web/src/app/(authenticated)/communities/[id]/loading.tsx` if route-group coverage is insufficient

**Admin**

- `apps/admin/src/app/dashboard/loading.tsx`
- `apps/admin/src/app/clients/loading.tsx`
- `apps/admin/src/app/clients/[id]/loading.tsx`
- `apps/admin/src/app/deletion-requests/loading.tsx`
- `apps/admin/src/app/demo/loading.tsx`
- `apps/admin/src/app/settings/loading.tsx`

The loading UI should preserve shell continuity:

- Sidebar stays stable
- Top chrome stays stable
- Main panel shows route-appropriate skeleton content
- No full-screen blank/centered spinner for page navigations

### A.2 Stop first-party redirect hops

Update navigation sources to use canonical URLs directly:

- `apps/web/src/components/layout/nav-config.ts`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/lib/constants/feature-registry.ts` if any legacy hrefs remain
- Any recent-pages, view-all, or search-result link builders that still point at compatibility routes

Examples:

- `payments` should link directly to `/communities/:id/payments`
- `finance` should link directly to `/communities/:id/finance`
- `assessments` should link directly to `/communities/:id/assessments`

Compatibility redirect pages remain for legacy bookmarks, but first-party links must no longer target them.

### A.3 Do not overuse `template.tsx`

No `template.tsx` files should be added in the first pass unless a concrete state-reset or skeleton-remount issue appears. `loading.tsx` is the primary requirement.

---

## 8.2 Workstream B: Request-Local Page Auth and Context Consolidation

### B.1 Middleware should not over-resolve anonymous requests

`packages/db/src/supabase/middleware.ts` currently refreshes session tokens unconditionally. Introduce a new strategy:

- If no auth cookie is present, skip `auth.getUser()` and return `user: null`
- If an auth cookie is present, call `auth.getUser()` once and return the resolved user to the caller

Proposed API shape:

```ts
type MiddlewareAuthResult = {
  supabase: SupabaseClient;
  response: NextResponse;
  user: User | null;
};
```

This is especially important for:

- public pages
- branded auth pages
- public subdomain rewrites
- requests that currently pay the Supabase auth tax even when no authenticated session exists

### B.2 Web middleware should reuse the resolved user

`apps/web/src/middleware.ts` currently re-calls `supabase.auth.getUser()` in multiple branches. Refactor it so:

- the middleware receives `user` from `createMiddlewareClient()`
- protected-route handling reuses that user
- public-site root handling reuses that user
- auth-page redirect handling reuses that user

This reduces repeated network validation inside the same request.

### B.3 Split page auth from API auth

The current helpers are optimized for correctness but not for page-navigation performance. Introduce two layers:

**Layer 1: middleware-authenticated page context helpers**

For RSC pages and layouts only, create helpers that:

- trust middleware-controlled forwarded headers after spoofed inbound headers have been stripped
- fail closed when required headers are missing
- do not call Supabase again for initial page render auth

Suggested new web helpers:

- `apps/web/src/lib/request/page-auth-context.ts`
- `apps/web/src/lib/request/page-community-context.ts`
- `apps/web/src/lib/request/page-shell-context.ts`

Suggested new admin helper:

- `apps/admin/src/lib/request/admin-page-context.ts`

**Layer 2: strict handler auth helpers**

Keep existing Supabase-backed auth validation for:

- `app/api/*` route handlers
- server actions that mutate data
- flows that must independently verify session integrity outside the page-render context

This preserves defense-in-depth where it matters most.

### B.4 Use request-local memoization

Use request-local memoization for page tree data that is currently re-fetched within the same render:

- authenticated user
- selected community membership
- user communities list when needed
- branding/theme inputs

Implementation note:

- use request-local React `cache()` or equivalent request-scoped memoization
- do not use cross-request caching for user-specific data

### B.5 Consolidate authenticated shell data

Refactor `apps/web/src/app/(authenticated)/layout.tsx` to consume a unified request-shell context instead of independently calling:

- `resolveUser()`
- `listCommunitiesForUser()`
- `getBrandingForCommunity()`

The shell should get one memoized object that includes:

- user
- selected community
- role
- plan/subscription status
- feature flags
- branding/theme inputs
- demo info

### B.6 Mobile routes must stop duplicating shell work

`apps/web/src/app/mobile/layout.tsx` and `apps/web/src/app/mobile/page.tsx` currently repeat auth, membership, and branding resolution.

Refactor so:

- mobile layout owns auth and shell context
- mobile child pages reuse that context
- mobile page no longer repeats `requireAuthenticatedUserId()` and `requireCommunityMembership()` when layout has already resolved them

---

## 8.3 Workstream C: Admin Server-First Initial Data

### C.1 Extract shared server loaders

Create admin server loaders in `apps/admin/src/lib/server/`:

- `getPlatformDashboardData()`
- `getDeletionRequestsData(filters)`
- `getDemoListData()`
- `getPlatformSettingsData()` if the team wants consistency there as well

These loaders become the source of truth for both:

- page-level initial render
- API routes that expose the same data shape for client refreshes

### C.2 Make primary admin pages server-first

Refactor these pages to fetch initial data on the server:

- `apps/admin/src/app/dashboard/page.tsx`
- `apps/admin/src/app/deletion-requests/page.tsx`
- `apps/admin/src/app/demo/page.tsx`

Then pass the result into the existing client components as `initialData`.

### C.3 Update client components for hydrated initial state

Refactor these client components to accept server-initialized props:

- `PlatformDashboard`
- `DeletionRequestsDashboard`
- demo list page component extracted from `apps/admin/src/app/demo/page.tsx`

Client behavior after the initial render:

- use optimistic local updates for mutations
- use `router.refresh()` or targeted background refresh after successful writes
- avoid mount-time bootstrap fetches for the first screen render

### C.4 Keep admin API routes for mutations and filtered refreshes

These routes remain necessary:

- `/api/admin/stats`
- `/api/admin/deletion-requests`
- `/api/admin/demos`

But they become secondary refresh channels, not the only way to see initial page content.

### C.5 Preserve admin auth correctness

For admin pages:

- middleware-authenticated page context may trust stripped-and-forwarded `x-user-id`
- API routes continue to use `requirePlatformAdmin()`

This draws a clean line between page performance and API safety.

---

## 8.4 Workstream D: Shared Client Bundle Reduction

### D.1 Remove eager command palette loading from the shell

The authenticated shell mounts the command palette globally. Refactor to:

- lazy-load the command palette with `next/dynamic`
- only load it when the user opens search
- keep a very small trigger path in the main shell

Affected files:

- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- related command-palette exports

### D.2 Localize motion instead of globalizing it

The global `MotionProvider` adds shared client cost to all authenticated and mobile routes. Replace the global shell-wide provider with one of these approaches:

1. preferred: localize `framer-motion` to components that actually animate
2. fallback: lazy-load a motion provider only on routes that need it

This is especially important for mobile, where emitted chunks indicate large motion-related overhead.

Affected files:

- `apps/web/src/components/providers/motion-provider.tsx`
- `apps/web/src/app/(authenticated)/layout.tsx`
- `apps/web/src/app/mobile/layout.tsx`
- motion-heavy component entry points

### D.3 Split PM reports by tab

PM reports are the worst web route by payload size. Refactor so:

- each report tab is loaded dynamically
- inactive tabs do not ship chart code on initial route load
- `recharts` and associated table/chart helpers only load for the active tab

Affected files:

- `apps/web/src/components/pm/reports/PmReportsClient.tsx`
- individual report components
- optional chart wrapper utilities if they are pulled too broadly

### D.4 Re-evaluate browser Sentry on the critical path

Both apps eagerly import `@sentry/nextjs` in browser initialization files. Emitted chunks strongly suggest this is a major part of the shared route baseline.

Refactor browser Sentry initialization to a deferred model:

- only initialize if DSN is present
- load the browser client via deferred dynamic import after hydration or idle
- preserve server-side error capture and request-side reporting

Trade-off:

- earliest possible client-side error capture is reduced
- navigation and initial route payload improve materially

This is an acceptable trade if measured payload reduction is significant.

Affected files:

- `apps/web/instrumentation-client.ts`
- `apps/admin/sentry.client.config.ts` or its successor

### D.5 Add admin route payload checks

Extend the existing perf-check approach to cover admin routes:

- `/dashboard`
- `/clients`
- `/deletion-requests`
- `/settings`

This can be:

- an extended `scripts/perf-check.ts`
- or a new `scripts/perf-check-admin.ts`

---

## 8.5 Workstream E: Measurement, Testing, and Rollout Safety

### E.1 Performance assertions

Add assertions for:

- no first-party navigation targets compatibility redirect pages
- representative admin and web routes remain within agreed route budgets
- PM reports initial route payload drops significantly after tab splitting

### E.2 Regression tests

Add or update tests for:

**Unit / component**

- page-context helpers return consistent values across multiple callers in one request
- loading boundaries render the correct skeletons
- command palette dynamic import still opens correctly

**Integration / Playwright**

- clicking Payments from primary nav lands directly on `/communities/:id/payments`
- clicking Finance from primary nav lands directly on `/communities/:id/finance`
- authenticated route transitions show loading UI instead of a blank wait
- admin dashboard initial page load does not require a client bootstrap fetch to show core data
- admin deletion requests initial page load does not depend on a mount-time fetch

### E.3 Baseline documentation

Create a small performance evidence doc after implementation:

- pre/post payload sizes
- pre/post request flow count
- screenshots or trace notes for user-visible route transitions

Suggested location:

- `docs/audits/navigation-performance-remediation-results.md`

---

## 9. Affected Files and Proposed Additions

This list is intentionally explicit so implementation does not become a siloed patch.

### 9.1 Existing files likely to change

**Shared auth/middleware**

- `packages/db/src/supabase/middleware.ts`
- `apps/web/src/middleware.ts`
- `apps/admin/src/middleware.ts`

**Web auth/context**

- `apps/web/src/app/(authenticated)/layout.tsx`
- `apps/web/src/app/mobile/layout.tsx`
- `apps/web/src/app/mobile/page.tsx`
- `apps/web/src/lib/api/auth.ts`
- `apps/web/src/lib/api/community-membership.ts`
- `apps/web/src/lib/api/branding.ts`

**Web navigation**

- `apps/web/src/components/layout/nav-config.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/components/command-palette/CommandPalette.tsx`
- `apps/web/src/lib/constants/feature-registry.ts`

**Admin pages**

- `apps/admin/src/app/dashboard/page.tsx`
- `apps/admin/src/app/deletion-requests/page.tsx`
- `apps/admin/src/app/demo/page.tsx`
- `apps/admin/src/components/dashboard/PlatformDashboard.tsx`
- `apps/admin/src/components/deletion-requests/DeletionRequestsDashboard.tsx`
- `apps/admin/src/components/AdminLayout.tsx`
- `apps/admin/src/components/Sidebar.tsx`

**Perf and instrumentation**

- `apps/web/instrumentation-client.ts`
- `apps/admin/sentry.client.config.ts`
- `scripts/perf-check.ts`

### 9.2 New files likely to be added

**Web**

- `apps/web/src/app/(authenticated)/loading.tsx`
- `apps/web/src/app/mobile/loading.tsx`
- `apps/web/src/app/(authenticated)/pm/reports/loading.tsx`
- `apps/web/src/lib/request/page-auth-context.ts`
- `apps/web/src/lib/request/page-community-context.ts`
- `apps/web/src/lib/request/page-shell-context.ts`

**Admin**

- `apps/admin/src/lib/request/admin-page-context.ts`
- `apps/admin/src/lib/server/dashboard.ts`
- `apps/admin/src/lib/server/deletion-requests.ts`
- `apps/admin/src/lib/server/demos.ts`
- route-specific `loading.tsx` files listed above

**Tests / scripts**

- admin perf-check script if not folded into the existing script
- Playwright or integration tests for canonical nav and admin SSR-first load

---

## 10. Acceptance Criteria

The work is complete only when all items below are true.

### 10.1 Navigation behavior

1. Primary authenticated routes in both apps display route-level loading UI during server transitions.
2. No first-party navigation link targets a compatibility redirect page.
3. Canonical community-scoped URLs are used by sidebar navigation, command palette view-all links, and any other primary route launchers.

### 10.2 Auth/context behavior

4. `createMiddlewareClient()` no longer calls `auth.getUser()` for anonymous requests without auth cookies.
5. Web middleware calls `auth.getUser()` at most once per request.
6. Admin middleware calls `auth.getUser()` at most once per request.
7. Web page render trees do not call Supabase auth again for initial page auth when middleware has already authenticated the request.
8. API route handlers continue to enforce strong auth independently.

### 10.3 Admin data loading behavior

9. `/dashboard`, `/deletion-requests`, and `/demo` render initial content from server data on first load.
10. Those pages no longer depend on mount-time bootstrap fetches to populate the initial screen.

### 10.4 Payload and performance behavior

11. `pnpm perf:check` remains green for web.
12. Equivalent admin route payload checks are added and green.
13. PM reports initial route payload is materially reduced via tab splitting.
14. The shared browser baseline is reduced enough that representative route sizes improve measurably post-implementation.

### 10.5 Security behavior

15. Tenant isolation and platform-admin enforcement remain unchanged for API handlers and mutations.
16. No request-local performance optimization leaks user-specific data across requests.

---

## 11. Rollout Plan

### Phase 0: Baseline and scaffolding

- Capture current route payloads and request flow notes
- Add missing `loading.tsx` skeletons
- Add admin perf-check scaffolding

### Phase 1: Eliminate avoidable UX pain

- Update first-party navigation to canonical URLs
- Ship loading boundaries

### Phase 2: Remove duplicated page auth/context work

- Refactor middleware auth reuse
- Add page-context helpers
- Refactor authenticated layout and mobile layout/page

### Phase 3: Refactor admin landing pages to server-first initial data

- Extract shared loaders
- Hydrate client components from server props
- keep mutation APIs intact

### Phase 4: Reduce shared client baseline

- lazy-load command palette
- remove or localize global motion provider
- split PM reports by tab
- defer browser Sentry initialization

### Phase 5: Harden and enforce

- Add tests
- Add perf evidence doc
- Tighten route budgets further if post-phase results justify it

---

## 12. Risks and Trade-offs

### R1. Trusting middleware headers for page auth

**Risk:** Page-layer helpers that trust middleware-forwarded headers are less independently defensive than calling Supabase again in every page.

**Mitigation:**  

- Middleware already strips spoofed inbound auth headers
- This trust model applies to page rendering only
- API route handlers and server mutations keep strict auth verification
- Missing trusted headers fail closed

### R2. Deferred browser Sentry may miss earliest client startup errors

**Risk:** If Sentry is deferred until after hydration or idle, the very earliest browser errors may not be captured.

**Mitigation:**  

- keep server-side Sentry intact
- measure the payload savings first
- if savings are minimal, keep current behavior and document the cost

### R3. Localizing motion may change animation defaults

**Risk:** Some screens may lose shared default transitions.

**Mitigation:**  

- audit only motion-heavy screens before removing global provider
- keep a tiny local provider where it is still justified

### R4. Server-first admin pages require client component refactors

**Risk:** Existing client components assume they own the fetch lifecycle.

**Mitigation:**  

- preserve current APIs
- add `initialData` props first
- migrate incrementally route by route

---

## 13. Open Decisions

These should be resolved before implementation begins:

1. Should page-level auth helpers trust middleware-forwarded headers for both apps, or web only in the first pass?
2. Should browser Sentry be deferred in both apps immediately, or only after measuring post-auth-refactor payloads?
3. Should admin receive a separate `perf:check:admin` script or should the existing perf check expand to cover both apps?
4. Should PM reports lazy-load only inactive tabs, or should the active tab be lazy-loaded too?

**Recommended decisions**

1. Yes for both apps at the page layer; no change for API handlers.
2. Measure after auth/context refactor, but plan the deferred import path now.
3. Expand the existing perf check if practical; otherwise add a dedicated admin script.
4. Lazy-load all report tabs, including the default active tab, with a route-specific skeleton.

---

## 14. References

### Internal references

- `CLAUDE.md`
- `AGENTS.md`
- `docs/platform-data-flow-audit.md`

### External references

- Next.js App Router linking and navigation: <https://nextjs.org/docs/app/getting-started/linking-and-navigating>
- Next.js loading UI and streaming: <https://nextjs.org/docs/app/getting-started/fetching-data>
- Supabase `auth.getUser()` reference: <https://supabase.com/docs/reference/javascript/auth-getuser>
- Supabase Next.js server-side auth guide: <https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs>

---

## 15. Spec Outcome

If this spec is implemented successfully:

- the user will see immediate route feedback instead of a dead click
- authenticated page transitions will stop repeating the same auth work in multiple layers
- admin primary pages will render actual content on first response rather than shell-first then fetch
- the route graph will stop wasting hops on compatibility redirects
- shared route payloads will shrink, especially for PM reports and mobile
- the repo will gain measurable, enforceable guardrails against performance regressions


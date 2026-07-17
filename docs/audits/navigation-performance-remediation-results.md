# Navigation Performance Remediation — Results

**Date:** July 16, 2026
**Spec:** `docs/specs/navigation-performance-remediation-spec.md` (this closes Phase 5 / §E.3)
**Delivered as:** 4 PRs — #785 (progress bar + React Query), #786 (middleware getClaims), #787 (streaming + redirects), and the bundle/Turbopack/perf-gate PR carrying this document.

## What the original spec had already shipped (verified before this round)

Loading boundaries (web + admin), canonical nav links, middleware auth dedupe
(at most one `getUser()` per request), page-context helpers with React
`cache()`, admin server-first pages, lazy command palette, PM-reports tab
splitting, deferred web browser Sentry.

## What this round changed

### 1. Perceived smoothness (PR #785)

- Global top progress bar (web + admin), driven by the App Router
  `onRouterTransitionStart` instrumentation hook — zero dependencies, covers
  sidebar / breadcrumbs / command palette / back-forward. 150 ms show delay,
  reduced-motion static fallback, 15 s safety timeout.
- `placeholderData: keepPreviousData` on 16 filter/page-varying list queries
  across 12 hooks — filter, tab, and pagination changes keep previous rows
  visible instead of blanking to skeletons.
- React Query `gcTime` 5 → 10 min (back-navigation paints from cache).
- Documents-list data prefetch on sidebar hover/focus.
- Admin migrated from legacy `sentry.client.config.ts` to
  `instrumentation-client.ts`.

### 2. Real per-click latency (PR #786)

- Middleware `auth.getUser()` (network round-trip to the Supabase Auth server
  on every authenticated navigation) → `auth.getClaims()` (local JWKS
  verification, 10-min module cache). Session refresh behavior unchanged
  (`getClaims` → `getSession` first). Kill switch:
  `SUPABASE_MIDDLEWARE_AUTH_MODE=getUser`. `MIDDLEWARE_TIMING=1` logs
  per-request auth duration.
- **Activation dependency:** the win lands when the Supabase project migrates
  from the legacy HS256 shared secret to asymmetric JWT signing keys
  (Dashboard → Project Settings → JWT Signing Keys; staging first). Until
  rotation, `getClaims()` transparently falls back to today's network call.
- API routes and server actions keep strict `getUser()` validation.

### 3. Streaming (PR #787)

Request-flow evidence (dev server, warm, `curl -N` with session cookies):

| Route | Before | After |
|---|---|---|
| `/dashboard` | TTFB ≈ total (nothing until all 6 queries resolve) | TTFB 0.66 s, total 1.05 s — skeleton markup flushes at stream offset ~41 KB, data-derived panel content at ~107 KB |
| `/announcements` | TTFB ≈ total | TTFB 0.70 s, total 1.11 s — header + actions flush before rows |
| `/dashboard/apartment` (apartment community) | sidebar → `/dashboard` → 307 → `/dashboard/apartment` | sidebar links directly; `redirects=0` |

Layout: `detectDemoInfo` + `getPageShellBranding` parallelized (were serial on
every authenticated navigation).

### 4. Bundles, dev mode, gates (this PR)

**Route JS payloads** (production build, `pnpm perf:check`):

| Route | Spec §2.2 (Mar 2026) | Before this PR | After |
|---|---:|---:|---:|
| Web dashboard | 612.9 KiB | 562.7 KiB | 561.7 KiB |
| Web maintenance inbox | 625.9 KiB | 363.8 KiB | 363.6 KiB |
| Web mobile home | 847.5 KiB | 669.1 KiB | **541.7 KiB** |
| Web public site (`[subdomain]`) | — | not measured (stale manifest key) | 363.6 KiB |
| Admin dashboard | 563.9 KiB | — | 358.7 KiB |
| Admin clients | 781.6 KiB | — | 592.2 KiB |
| Admin deletion requests | 589.0 KiB | — | 392.3 KiB |

Changes: framer-motion removed from apps/web entirely (`MotionProvider`
deleted from both layouts — `MotionConfig` had no consumers; `PressScale`
converted to CSS `motion-safe:active:scale`; unused `FadeIn` deleted);
preview-only `TenantDashboardMockup` lazily imported out of the mobile-home
bundle; `experimental.optimizePackageImports` for the workspace barrels
(`@propertypro/ui`, `@propertypro/shared`) in both apps.

**Dev mode:** `pnpm dev` now runs Turbopack in both apps (`dev:webpack`
fallback scripts kept; `dev:e2e` intentionally stays webpack).
`import-in-the-middle@2.0.6` / `require-in-the-middle@8.0.1` added so
Sentry's OTel hooks resolve under Turbopack in the pnpm monorepo.

**Perf gates:** `scripts/perf-check.ts` is now multi-app — admin routes
(`/dashboard`, `/clients`, `/deletion-requests`) are budgeted alongside web;
the stale `site` manifest key was fixed (the public `[subdomain]` page had
been silently skipped); the hard per-route budget ratcheted 900 → 700 KiB
(worst measured route 592.2 KiB + headroom).

## Follow-ups

- Supabase dashboard JWT signing-key migration + rotation (activates the PR
  #786 latency win). Staging first.
- The 200 KiB per-route target remains aspirational for the heavy hubs;
  ratchet the 700 KiB hard budget further as drains land.
- Dev-mode smoothness never fully matches prod (compile-on-demand); judge
  final UX on a production build or the Vercel deploy.

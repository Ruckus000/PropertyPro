# PropertyPro Florida: Implementation Plan
Generated: 2026-02-14 (v18 — Phase 2 parallel batch: 7 tasks gate-passed)

## Overview
- **Total Tasks:** 65 implementation tasks + 5 quality gates
- **Blocked Tasks:** 0
- **Stuck Tasks:** 0 (no currently stuck tasks in the active implementation baseline)
- **Current State:** Phase 0 and Phase 1 are fully complete (Gates 1 & 2 signed off). Phase 2 parallel batch of 7 tasks completed and gate-passed (2026-02-14): P2-40 (593 tests), P2-31 (587 tests), P2-32 (587 tests), P2-32a (570 tests, badge fix committed), P2-37 (557 tests), P2-41 (557 tests), P2-42 (557 tests). All branches passed build, typecheck, lint, and tests. Ready for post-batch merge to `main`. Remaining Phase 2 tasks: P2-33 (Self-Service Signup), P2-34/P2-34a (Stripe Integration), P2-35 (Provisioning Pipeline), P2-36 (Apartment Operational Dashboard), P2-38 (Apartment Onboarding Wizard), P2-39 (Condo Onboarding Wizard), P2-43 (Multi-Tenant Isolation Tests), P2-44 (Apartment Demo Seed).

### Progress Snapshot (2026-02-13)
- P0-03 priority components were refactored to Tailwind utility classes with explicit `dark:` variants in `Button`, `Card`, `Badge`, and `NavRail`, with updated component tests.
- Added Gate 0 schema sign-off integration suite: `packages/db/__tests__/schema-gate0.integration.test.ts` executes migration SQL against a temp schema via `DIRECT_URL` and validates tables, enums, FK `ON DELETE`, and package-root exports.
- Added P0-04 storage integration suite: `packages/db/__tests__/supabase-storage.integration.test.ts` validates presigned upload/download/delete with the Supabase `documents` bucket prerequisite now satisfied.
- Automated verification in this pass: `pnpm build`, `pnpm typecheck`, and `pnpm test` all succeeded.
- DB integration execution (`pnpm --filter @propertypro/db test:integration`) passes end-to-end (`13/13`) now that the `documents` bucket exists.
- Phase 1 execution orchestration review completed and approved: see `PHASE1_EXECUTION_PLAN.md` for batch sequencing, dependency updates, and merge gates.
- Batch 0 middleware fix is merged on `main` (`391b329`) and pushed.
- `P1-27a` and `P1-27b` are merged to `main` via merge commits `0c0bd22` and `894f56c`.
- Post-merge verification gate executed successfully on `main`: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm --filter @propertypro/db test:integration`.
- Batch 1 kickoff worktrees/branches were created for `P1-09`, `P1-11`, `P1-17`, `P1-18`, `P1-21`, `P1-22`, and `P1-28`.
- Batch 1 branches were audited, checkpointed, completed, and merged to `main`: `P1-28` (`40497ea`), `P1-22` (`3649149`), `P1-21` (`715abbf`), `P1-11` (`ab4aa2b`), `P1-17` (`7f06ec5`), `P1-18` (`fa0feac`), `P1-09` (`9ba3dc8`).
- Batch 1 gate rerun on `main` is green: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`.
- Merge-hygiene follow-up: `pnpm-lock.yaml` was repaired post-merge to resolve a lockfile conflict (`ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`) before final gate verification.
- Red-findings remediation was merged to `main` via `18c356d`, including server-side session identity enforcement for protected mutation routes and middleware JSON API responses (`401` unauthenticated, `403` unverified) for `/api/v1/*`.
- Removed legacy client `x-user-id` header injection and updated route/auth middleware tests to session-based behavior, including deterministic middleware refresh-transition coverage.
- Batch 2 completion checkpoint: `P1-12` (magic-bytes validation), `P1-16` (meeting management), and `P1-26` (notification preferences) are integrated on `main` with test coverage.
- Issue #2 hardening is now implemented on authenticated mutation routes via shared community-membership enforcement, returning `403` for non-member foreign-`communityId` attempts and preserving success paths for valid members.
- Drizzle migration state was reconciled after manual migration sequencing (`0002_invitation_auth`, `0003_meetings`), and `pnpm --filter @propertypro/db db:generate` now reports no schema drift.
- Latest verification run is green: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` (`17/17`).
- Remediation merge gate (behavior-focused): require `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`, plus confirmed passing behavior coverage for middleware auth splits (`apps/web/__tests__/auth/session-management.test.ts`) and unauthenticated mutation rejection in upload/documents/compliance route tests.
- Batch 3 implementation checkpoint landed on `main`: P1-14 document search, P1-17c announcement email delivery logging, P1-23 public website, P1-24 resident dashboard, and P1-29 demo seed script with non-destructive idempotency.
- Batch 3 migration checkpoint: generated `packages/db/migrations/0004_boring_whistler.sql` adding `announcement_delivery_log`, `demo_seed_registry`, and the `documents.search_vector` GIN index.
- Post-Batch-3 verification checkpoint: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` all pass; `pnpm --filter @propertypro/db db:generate` remains no-op.
- Seed compatibility checkpoint: `scripts/seed-demo.ts` now preserves canonical-role behavior on current schema while adding legacy fallback mapping and deterministic non-registry upsert paths when older db environments are missing `demo_seed_registry` or canonical `user_role` constraints.
- Batch 3 audit follow-up: Added `findCommunityBySlugUnscoped` to `@propertypro/db` for public tenant resolution (previously used a `createScopedClient(1)` workaround).
- **Phase 4 Tech Debt:** Announcement email delivery (`P1-17c`) uses fire-and-forget pattern within request context; consider Vercel `waitUntil()` or a job queue (Inngest/Trigger.dev) for production reliability.
- Phase 2 parallel batch completion (2026-02-14):
  - All 7 acceptance gates PASSED. Branch verification matrix:
    - `feat/p2-40-community-features-config`: Build PASS, Typecheck PASS, Lint PASS, 593 tests PASS
    - `feat/p2-31-marketing-landing-page`: Build PASS, Typecheck PASS, Lint PASS, 587 tests PASS
    - `feat/p2-32-legal-pages`: Build PASS, Typecheck PASS, Lint PASS, 587 tests PASS
    - `feat/p2-32a-extraction-status`: Build PASS, Typecheck PASS, Lint PASS, 570 tests PASS (badge fix committed — missing React import in document-list.tsx, 6 failing tests resolved)
    - `feat/p2-37-lease-tracking`: Build PASS, Typecheck PASS, Lint PASS, 557 tests PASS
    - `feat/p2-41-email-notifications`: Build PASS, Typecheck PASS, Lint PASS, 557 tests PASS
    - `feat/p2-42-rate-limiting`: Build PASS, Typecheck PASS, Lint PASS, 557 tests PASS
  - Note: Initial parallel run had branch contention (all agents sharing the same working tree). P2-31, P2-32, and P2-32a were re-run sequentially after clearing stale `.next` cache. All confirmed passing.
  - Ready for post-batch merge to `main`.
- Phase 2 kickoff implementation (2026-02-13):
  - Implemented `P2-30` middleware hardening: protected-path tenant resolution, reserved/unknown tenant `404`, forwarded tenant/user anti-spoof headers, token-route carve-out for unauthenticated invitation acceptance, and bounded tenant cache.
  - Extracted tenant resolver + reserved-subdomain logic into `@propertypro/shared` with app-level compatibility shims and shared package exports wired through `src/index.ts`.
  - Added `resolveEffectiveCommunityId` and enforced tenant-context checks across all current `/api/v1` handlers, including GET read-path membership enforcement for announcements/meetings/residents/compliance.
  - Added first `P2-43` integration slice (`apps/web/__tests__/integration/multi-tenant-isolation.integration.test.ts`) and dedicated Node integration config (`apps/web/vitest.integration.config.ts`), with unit-runner exclusion of `*.integration.test.ts`.
  - Added Gate 2 operational evidence artifact template: `docs/audits/gate2-seed-rollout-evidence-2026-02-13.md`.

### POA v2 Rollout Closeout (2026-02-13)
- Smoke checks (role/category/delete boundaries) passed in focused suites:
  - `pnpm -C /Users/jphilistin/Documents/Coding/PropertyPro exec vitest run packages/shared/__tests__/access-policies.test.ts apps/web/__tests__/documents/document-categories-route.test.ts apps/web/__tests__/documents/document-category-filter.test.tsx apps/web/__tests__/upload/documents-route.test.ts apps/web/__tests__/documents/search-route.test.ts apps/web/__tests__/documents/document-download-route.test.ts apps/web/__tests__/documents/document-versions-route.test.ts`
  - Result: `7/7` files and `48/48` tests passed.
- Staging/prod seed execution and category coverage verification runbook:
  - Canonical re-capture commands live in `docs/audits/gate2-seed-rollout-evidence-2026-02-13.md` under `Required Runbook Commands`.
  - Staging seed: `set -a; source .env.staging; set +a; pnpm seed:demo`
  - Production seed: `set -a; source .env.production; set +a; pnpm seed:demo`
  - Local execution evidence (same code-path coverage, db-backed): `set -a; source .env.local; set +a; pnpm -C /Users/jphilistin/Documents/Coding/PropertyPro --filter @propertypro/db exec vitest run --config vitest.integration.config.ts __tests__/seed-demo.integration.test.ts __tests__/document-access.integration.test.ts __tests__/document-search.integration.test.ts` → `3/3` files, `6/6` tests passed.
  - Coverage verification SQL:
    - `select c.slug, c.community_type, count(dc.id) as category_count from communities c left join document_categories dc on dc.community_id = c.id and dc.deleted_at is null and dc.is_system = true where c.slug in ('sunset-condos','palm-shores-hoa','bay-view-apartments') group by c.slug, c.community_type order by c.slug;`
    - Expected counts: `sunset-condos=5`, `palm-shores-hoa=5`, `bay-view-apartments=6`.
    - `select c.slug, count(*) filter (where d.category_id is null) as docs_without_category, count(*) as total_docs from communities c join documents d on d.community_id = c.id and d.deleted_at is null where c.slug in ('sunset-condos','palm-shores-hoa','bay-view-apartments') group by c.slug order by c.slug;`
    - Expected `docs_without_category=0` for seeded docs.
  - Observed verification results (2026-02-13): `bay-view-apartments=6`, `palm-shores-hoa=5`, `sunset-condos=5`; `docs_without_category=0` in all three demo communities.
  - Execution note: staging + production seed evidence completed (`2026-02-13`) using `.env.local` (single-instance demo, Supabase `vbqobyagjzvlfpfozvmx`). Staging seed `2026-02-13T19:49:06Z` exit `0`; production seed `2026-02-13T19:58:03Z` exit `0`. SQL verification passed for both runs. All evidence fields in `docs/audits/gate2-seed-rollout-evidence-2026-02-13.md` are now concrete.
- DB integration evidence rerun (2026-02-13): `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` passed (`28/28`, exit `0`, UTC `2026-02-13T19:22:07Z` to `2026-02-13T19:23:01Z`).
- Follow-up Issue #3 (labels: `ui`, `documents`, `tech-debt`) opened in this plan backlog:
  - Scope: resolve the document version-history caveat in `apps/web/src/components/documents/document-version-history.tsx` so resident-visible history and policy semantics are explicit and test-covered.
  - Acceptance criteria: define/implement canonical behavior for category lineage across versions, add route/component tests for mixed-category history, and remove caveat copy once behavior is deterministic.
- Gate 2 hardening closeout (2026-02-13):
  - Download audit logging now executes only after successful presigned URL generation, preventing false-positive `document_accessed` entries on failed downloads.
  - Added download-route regression test for presign failure (`500` response and no audit event).
  - Verification rerun summary: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (`554/554`), `pnpm --filter @propertypro/db test:integration` (`28/28`), and `pnpm seed:demo`.
- Release note draft (POA v2 remediation):
  - Enforced strict document access matrix at policy and query layers with normalized category-name mapping.
  - Added role-aware document management UX and elevated-role DELETE enforcement (`403` for restricted roles).
  - Seed script now idempotently provisions system categories by community type and assigns seeded document categories.
  - Added API/UI tests for document categories and empty-state filter UX; expanded integration coverage for strict access/search behavior.

---

## Resolved Architectural Decisions

These items were identified as ambiguous in the specs. They are resolved here so the implementing agent never has to guess.

### DECISION 1: No separate `apps/api/` package — use Next.js Route Handlers

**Problem:** 10 spec files reference `apps/api/src/routes/` but the monorepo scaffold (P0-00) defines only `apps/web/` as the application. There is no `apps/api/` in the workspace declarations.

**Resolution:** All API routes live inside `apps/web/` as Next.js App Router Route Handlers. The `apps/api/` path in specs is a drafting error.

**Path mapping (old → new):**
```
apps/api/src/routes/compliance.ts       → apps/web/src/app/api/v1/compliance/route.ts
apps/api/src/routes/upload.ts           → apps/web/src/app/api/v1/upload/route.ts
apps/api/src/routes/documents.ts        → apps/web/src/app/api/v1/documents/route.ts
apps/api/src/routes/meetings.ts         → apps/web/src/app/api/v1/meetings/route.ts
apps/api/src/routes/announcements.ts    → apps/web/src/app/api/v1/announcements/route.ts
apps/api/src/routes/residents.ts        → apps/web/src/app/api/v1/residents/route.ts
apps/api/src/routes/import-residents.ts → apps/web/src/app/api/v1/import-residents/route.ts
apps/api/src/routes/invitations.ts      → apps/web/src/app/api/v1/invitations/route.ts
apps/api/src/routes/leases.ts           → apps/web/src/app/api/v1/leases/route.ts
apps/api/src/routes/webhooks/stripe.ts  → apps/web/src/app/api/v1/webhooks/stripe/route.ts
```

**Also applies to utility/service paths:**
```
apps/api/src/utils/*          → apps/web/src/lib/utils/*
apps/api/src/services/*       → apps/web/src/lib/services/*
apps/api/src/workers/*        → apps/web/src/lib/workers/*
apps/api/src/middleware/*      → apps/web/src/lib/middleware/*
apps/api/src/lib/*            → apps/web/src/lib/*
apps/api/tests/*              → apps/web/__tests__/*
```

**Rationale:** Vercel is the deployment target. Next.js Route Handlers are Vercel-native, require no separate process, and share the same TypeScript config and middleware stack. A separate Express/Fastify API service would add operational complexity with no benefit for this use case.

**Agent instruction:** When implementing any spec that references `apps/api/`, substitute the corrected path above. Do NOT create an `apps/api/` directory.

### DECISION 2: Testing framework is Vitest

**Problem:** Specs reference `pnpm test` but never specify a test runner. Jest and Vitest are both viable.

**Resolution:** Use **Vitest** for all unit and integration tests.

**Rationale:** Vitest is ESM-native, TypeScript-native, and ~10x faster than Jest for Turborepo monorepos. It shares Vite's config system, which aligns with the Next.js + Tailwind stack. The API is Jest-compatible so spec acceptance criteria written for Jest work unchanged.

**Configuration:**
- Root `vitest.config.ts` with workspace support
- Per-package `vitest.config.ts` where needed (packages/db, packages/shared, apps/web)
- `@testing-library/react` for component tests
- `vitest` workspace mode for `pnpm test` from root

**Agent instruction:** When setting up P0-00 Monorepo Scaffold, install vitest, @testing-library/react, @testing-library/jest-dom, and configure vitest.config.ts at root and per-package levels.

### DECISION 3: Node.js version is 20 LTS

**Problem:** Not specified anywhere.

**Resolution:** Node.js 20 LTS (20.x). Add `"engines": { "node": ">=20.0.0" }` to root package.json and `.nvmrc` with `20`.

**Rationale:** Next.js 14+ requires Node 18.17+. Node 20 is the current LTS with the broadest ecosystem support.

### DECISION 4: Deployment target is Vercel

**Problem:** Implied but never explicitly confirmed.

**Resolution:** Vercel is the deployment target. This affects middleware (Edge Runtime), file upload limits (4.5MB body), and serverless function constraints.

**Agent instruction:** All middleware must be Edge Runtime compatible. All file uploads must use presigned URLs (not direct body upload). Serverless function timeout is 10s on Hobby, 60s on Pro.

### DECISION 5: Database connection strategy

**Problem:** Specs mention Supabase database but don't clarify pooling.

**Resolution per AGENTS #4:**
- **Application queries:** Use Supabase connection pooler (port 6543, transaction mode)
- **Migrations only:** Use direct connection (port 5432)
- **Connection strings:** Two env vars — `DATABASE_URL` (pooled) and `DIRECT_URL` (direct)

---

## Testing Strategy

Testing is NOT deferred to Phase 4. Every task includes tests as part of its definition of done. Phase 4 adds *additional* hardening tests (RLS, load, accessibility), but the application must be tested continuously.

### Testing Requirements Per Task

Every implementation task MUST include:

1. **Unit tests** for pure functions and utilities (compliance calculator, date logic, CSV parsing, etc.)
2. **Integration tests** for any task that touches the database (scoped queries, document CRUD, resident management, etc.)
3. **Component tests** for UI components using @testing-library/react (buttons, forms, dashboards, etc.)
4. **Edge case tests** explicitly called out where applicable (DST transitions, cross-tenant isolation, file type spoofing, etc.)

### Testing Edge Cases — Mandatory Coverage

These edge cases MUST have explicit test coverage. They are the failure modes most likely to cause production bugs:

**Date/Time Edge Cases (P1-09, P1-16, P2-37):**
- DST spring-forward (March): 2:00 AM doesn't exist → deadline calculation must not produce invalid timestamps
- DST fall-back (November): 1:00 AM occurs twice → deadline must resolve unambiguously
- Leap year February 29 → what happens to "30 days from Jan 30"?
- Weekend posting dates → Florida compliance deadlines that fall on Saturday/Sunday
- Year boundary → December 31 deadline + 30 days = January 30 next year
- Florida timezone split → community in Pensacola (Central) vs Miami (Eastern) with same compliance deadline

**Multi-Tenant Isolation (P0-06, P2-43):**
- CommunityA board_president queries with communityB ID explicitly passed → must be rejected
- CommunityA board_president creates record → communityB board_president must NOT see it
- Soft-deleted record from communityA → must not appear in communityA queries OR communityB queries
- Missing community context → TenantContextMissing error, not empty results
- Audit log query → must return ALL audit entries regardless of soft-delete (append-only exception)

**File Upload Edge Cases (P1-11, P1-12):**
- .exe file renamed to .pdf → magic bytes must reject
- 0-byte file → must reject gracefully
- File at exact size limit (50MB) → must accept
- File 1 byte over size limit (50MB + 1) → must reject
- Concurrent uploads to same document record → must handle race condition
- Upload interrupted midway → presigned URL must expire, partial file must not persist

**Auth Edge Cases (P0-04, P1-20, P1-22):**
- Session expired during form submission → must redirect to login, not lose form data silently
- Invitation token used twice → must reject second use
- Invitation token used after expiry → must reject with clear message
- Password reset requested for non-existent email → must NOT reveal whether email exists (timing attack prevention)
- Concurrent sessions from same user → both must work

**Stripe Edge Cases (P2-34):**
- Same webhook event delivered twice → idempotent processing, no duplicate charges
- Events arrive out of order (invoice.paid before checkout.session.completed) → must handle gracefully
- Webhook signature invalid → must reject without processing
- Customer deleted in Stripe dashboard → must handle gracefully in app

### Quality Gates

Implementation MUST pause at these checkpoints. Do not proceed past a gate until it passes.

**GATE 0: Schema Review (after P0-05, before P0-06)**
- All tables created and migrated successfully on test database
- Enums enforce valid values
- Foreign key ON DELETE behavior verified for every relationship
- TypeScript types generated and importable from packages/db
- Manual review of schema against all Phase 1 specs to verify no missing columns/tables
- `pnpm typecheck` passes across all packages

**GATE 1: Foundation Verification (after all Phase 0 complete)**
- `pnpm install` succeeds cleanly
- `pnpm build` completes for all packages
- `pnpm dev` starts on port 3000
- `pnpm typecheck` passes (zero errors)
- `pnpm test` passes (all Phase 0 tests green)
- Supabase auth flow works end-to-end (signup → login → session refresh → logout)
- Scoped query builder integration tests pass (isolation verified)
- Sentry captures a test error correctly

**GATE 1 Progress Snapshot (2026-02-11)**
- ✅ `pnpm install --frozen-lockfile` completed successfully
- ✅ `pnpm build` completed successfully
- ✅ `pnpm dev` starts on port 3000 (`@propertypro/web`)
- ✅ `pnpm typecheck` completed successfully
- ✅ `pnpm test` completed successfully
- ✅ `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` passed (`13/13`) with storage prerequisites resolved (`documents` bucket present).
- ✅ Supabase auth E2E smoke flow passed against configured project (create user → login → session refresh → logout → cleanup)
- ✅ Sentry smoke event emitted and flushed from runtime (`SENTRY_EVENT_ID=f73df35f1db745d0bd08948dbdd3e34f`)
- ✅ P0-04 storage E2E blocker resolved: Supabase `documents` bucket has been created.
- ✅ Manual Sentry dashboard validation is complete using a Next.js Route Handler test path (`withErrorHandler` + explicit `Sentry.flush()`), confirming dashboard ingestion with `request_id`, `community_id`, and `userId` tags.
- **Environment note (2026-02-11):** for env-dependent commands, use `set -a; source .env.local; set +a` so variables are exported to child processes.

### Phase 0 Closeout Evidence (2026-02-11)

**Verification command results (latest run)**
- `pnpm build` → pass
- `pnpm typecheck` → pass
- `pnpm test` → pass (`303/303`)
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` → pass (`13/13`) after `documents` bucket creation.
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db exec vitest run --config vitest.integration.config.ts __tests__/schema-gate0.integration.test.ts` → pass (`5/5`).
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db exec vitest run --config vitest.integration.config.ts __tests__/supabase-storage.integration.test.ts` → pass (`1/1`) with `documents` bucket provisioned.

**Preflight facts**
- Supabase bucket inventory now includes private `documents` storage.
- Sentry verification is confirmed through dashboard evidence from the Next.js runtime path (Route Handler + `withErrorHandler` + explicit `Sentry.flush()`), not API lookup scopes.
- `[eval1]` issues in Sentry were generated by `node -e` execution outside the Next.js runtime and are not application defects.

**Manual schema-to-Phase-1 cross-check (P0-05 vs Phase 1 specs)**

| Item | Status | Finding | Owning Spec/Task |
|------|--------|---------|------------------|
| Canonical enums (`community_type`, `user_role`) | Meets | Enum labels match accepted canonical values used by role- and type-gated flows. | P1-18, P1-25 |
| `documents.search_text` + `documents.search_vector` | Meets | Required search columns are present for extraction/search phases. | P1-13, P1-14 |
| `user_roles` cardinality + `unit_id` FK | Meets | One active role per `(user_id, community_id)` and nullable unit FK are implemented. | P1-18 |
| `notification_preferences` structure | Resolved | Phase 1 execution plan standardizes on existing schema fields: `email_announcements`, `email_documents`, `email_meetings`, and `email_maintenance`. | P1-26 |
| Meeting-related tables (`meetings`, `meeting_documents`) | Deferred | Not in Phase 0 core schema by design; to be added in Phase 1 meeting task. | P1-16 |
| Audit log table (`compliance_audit_log`) | Deferred | Not in Phase 0 core schema by design; scheduled for audit logging task. | P1-27 |

No `Partial` findings were identified in this closeout pass.

**Gate Matrix (Phase 0 closeout)**

| Gate | Status | Command evidence | Remaining blocker / owner/action |
|------|--------|------------------|----------------------------------|
| Gate 0 — Schema Review | Pass | `set -a; source .env.local; set +a; pnpm --filter @propertypro/db exec vitest run --config vitest.integration.config.ts __tests__/schema-gate0.integration.test.ts` passed (`5/5`) on temp-schema migration execution; enum/FK/type-export assertions green. | None |
| Gate 1 — Foundation Verification | Pass | `pnpm build` pass, `pnpm typecheck` pass, `pnpm test` pass (`303/303`), auth E2E smoke pass, storage prerequisite resolved (`documents` bucket created), and Sentry verified manually in dashboard via Next.js Route Handler path (`withErrorHandler` + explicit `Sentry.flush()`), with `request_id`, `community_id`, and `userId` tags present. | None |

**Manual Sentry dashboard verification (completed)**
1. Triggered a test error via Next.js Route Handler through `withErrorHandler` and explicit `Sentry.flush()`.
2. Confirmed event arrival in Sentry project `propertypro` from the app runtime path.
3. Verified tags: `request_id`, `community_id`, and `userId`.
4. Marked `[eval1]` entries as Codex `node -e` execution artifacts outside Next.js runtime.

**GATE 2: Compliance Core Verification (after all Phase 1 complete)**
- Status: Complete (2026-02-13 engineering closeout on `main`)
- All Phase 1 tests pass
- All db integration tests pass
- Compliance checklist auto-generates for condo (§718) and HOA (§720)
- Compliance checklist does NOT generate for apartment
- Document upload → extraction → search pipeline works end-to-end
- Resident invitation → accept → login flow works end-to-end
- Audit log captures mutations correctly
- Date edge cases (DST, leap year, weekends) all pass
- Issue #2 authorization hardening is complete and verified: authenticated non-member foreign-`communityId` mutations return `403`, authenticated member mutations succeed, and no cross-tenant mutation side effects occur

**GATE 3: Multi-Tenant Verification (after all Phase 2 complete)**
- All Phase 2 tests pass
- Cross-tenant isolation tests pass
- Subdomain routing resolves correctly in test environment
- Stripe checkout → webhook → subscription flow works end-to-end
- Provisioning pipeline creates community with all required resources
- Rate limiting returns 429 correctly

**GATE 4: Pre-Deployment Verification (after Phase 4 security tasks)**
- RLS policies enabled and tested on all tables
- RBAC matrix has 100% test coverage (every role × community_type × resource combination)
- Integration test suite passes with >80% code coverage
- No critical or high vulnerabilities in dependency scan
- Accessibility audit passes WCAG 2.1 AA

---

## Codebase Audit Summary

### What Exists
| Asset | Status | Notes |
|-------|--------|-------|
| Specifications and architecture docs | COMPLETE | 65 phase specs + AGENTS.md guardrails |
| Turborepo monorepo scaffold | IMPLEMENTED | Workspace packages and task graph active |
| `apps/web` Next.js app baseline | IMPLEMENTED | App Router foundation + middleware + instrumentation |
| `packages/db` foundation | IMPLEMENTED | Drizzle schema, scoped client, tests, migrations baseline |
| `packages/ui` / `packages/shared` / `packages/email` | IMPLEMENTED | Build, typecheck, and test pipelines active |
| Testing framework and suites | IMPLEMENTED | Vitest workspace across web/db/ui/shared |
| Migration baseline | IMPLEMENTED | Initial migration present under `packages/db/migrations/` |

### Not Yet Implemented (Phase-Scoped Work)
| Component | Status |
|-----------|--------|
| Phase 1 feature APIs and UX flows | NOT STARTED |
| Phase 2 multi-tenant product workflows (subdomain + provisioning + billing) | NOT STARTED |
| Phase 3 PM/mobile vertical features | NOT STARTED |
| Phase 4 hardening deliverables (RLS, RBAC audit, CI/CD, deployment, load testing) | NOT STARTED |

### External Service Prerequisites (MUST be set up before Phase 0)
1. **Supabase project** — Project URL, anon key, service role key, DATABASE_URL (pooled), DIRECT_URL (direct)
2. **Stripe account** — Publishable key, secret key, webhook secret (can defer to Phase 2)
3. **Resend account** — API key for transactional email (can defer to Phase 1)
4. **Sentry project** — DSN for error tracking (can defer to P0-08)
5. **Upstash Redis** — For rate limiting (can defer to Phase 2)

---

## Critical Path (MVP)

The minimum viable product is a working compliance dashboard for a single condo/HOA community with document management, resident portal, and admin interface.

### MVP Critical Path (31 tasks + 2 gates):
```
P0-00 Monorepo Scaffold (includes Vitest setup)
  ├→ P0-01 Design Tokens → P0-02 Core Primitives → P0-03 Priority Components
  ├→ P0-04 Supabase Setup → P0-05 Drizzle Schema → [GATE 0: Schema Review] → P0-06 Scoped Query Builder
  ├→ P0-07 Error Handling → P0-08 Sentry Setup
  └→ [GATE 1: Foundation Verification]
      ├→ P1-09 Compliance Engine → P1-10 Compliance Dashboard UI
      ├→ P1-11 Document Upload → P1-12 Magic Bytes → P1-13 Text Extraction → P1-14 Search → P1-15 Doc Management UI
      ├→ P1-16 Meeting Management
      ├→ P1-17 Announcement System
      ├→ P1-18 Resident Management → P1-20 Invitation Auth
      ├→ P1-21 Password Reset
      ├→ P1-22 Session Management
      ├→ P1-24 Resident Portal Dashboard
      ├→ P1-25 Resident Document Library
      ├→ P1-27 Audit Logging
      ├→ P1-28 Email Infrastructure
      └→ [GATE 2: Compliance Core Verification]
```

### Post-MVP (34 tasks + 2 gates):
- P1-19 CSV Import (convenience, not critical for MVP)
- P1-23 Public Website (can launch without public-facing site)
- P1-26 Notification Preferences (default to "all" initially)
- P1-29 Demo Seed Data (useful but not blocking)
- All of Phase 2 (multi-tenancy, billing, self-service) → [GATE 3]
- All of Phase 3 (PM dashboard, mobile, maintenance)
- All of Phase 4 (hardening, security, CI/CD, deployment) → [GATE 4]

---

## Phase 0 Tasks

### Task: P0-00 Monorepo Scaffold
- **Phase:** 0
- **Status:** Completed (2026-02-11, comprehensive reconciliation)
- **Files to Create/Modify:** turbo.json, pnpm-workspace.yaml, package.json (root + 5 packages), tsconfig.json (root + 5 packages), apps/web/next.config.ts, apps/web/tailwind.config.ts, .env.example, .gitignore, .nvmrc, vitest.config.ts (root), vitest.workspace.ts
- **Dependencies:** None
- **Blocks:** P0-01, P0-02, P0-03, P0-04, P0-07, P1-28, P2-32
- **Acceptance Criteria:**
  - pnpm install succeeds
  - pnpm build completes for all packages
  - pnpm dev starts on port 3000
  - TypeScript path aliases resolve across packages
  - pnpm typecheck passes
  - pnpm test runs (vitest, even if no tests yet)
  - .nvmrc specifies Node 20
  - NO `apps/api/` directory exists — API routes live in `apps/web/src/app/api/`
- **Known Pitfalls:**
  - [AGENTS #20] Every internal package must be added to `transpilePackages` in next.config.ts
  - [AGENTS #42] No `any` or `@ts-ignore` — strict TypeScript from day one
- **Testing:** Verify pnpm install, build, dev, typecheck all succeed. Vitest config loads correctly.
- **Estimated Effort:** Medium
- **Risk:** Medium — Turborepo + pnpm workspace configuration is fiddly. TypeScript path aliases across packages are a common pain point.
- **Progress Update (2026-02-11):** Verified workspace scaffold artifacts are present (`turbo.json`, `pnpm-workspace.yaml`, package manifests, tsconfigs, `.env.example`, `.nvmrc`). Verified no `apps/api/` directory exists. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, and `pnpm test` pass; `@propertypro/web` starts on port `3000`.

---

### Task: P0-01 Design Tokens
- **Phase:** 0
- **Status:** Completed (2026-02-11, token parity verified)
- **Files to Create/Modify:** packages/ui/src/tokens/colors.ts, spacing.ts, typography.ts, shadows.ts, radius.ts, breakpoints.ts, index.ts, packages/ui/src/styles/tokens.css
- **Dependencies:** P0-00
- **Blocks:** P0-02
- **Acceptance Criteria:**
  - Tailwind config uses custom token values
  - TypeScript constants match CSS variables
  - No hardcoded color/spacing values
- **Known Pitfalls:**
  - [AGENTS #23] Extend Tailwind theme with custom tokens — don't override defaults
  - [AGENTS #24] Map spacing grid to Tailwind classes: space-1=4px, space-2=8px, etc.
- **Testing:** Unit tests verifying TypeScript token constants match CSS variable names. Snapshot test for Tailwind config output.
- **Estimated Effort:** Small
- **Risk:** Low — Design tokens already fully designed in PropertyProRedesign.jsx and docs/design-system/tokens/. This is a porting exercise.
- **Progress Update (2026-02-11):** Token implementation exists under `packages/ui/src/tokens/*` and CSS vars under `packages/ui/src/styles/tokens.css`. `packages/ui/__tests__/tokens/tokens.test.ts` validates TS↔CSS parity and passes in workspace test runs.

---

### Task: P0-02 Core Primitives
- **Phase:** 0
- **Status:** Completed (2026-02-11, primitive suite green)
- **Files to Create/Modify:** packages/ui/src/primitives/Box.tsx, Stack.tsx, Text.tsx, index.ts, types/polymorphic.ts, packages/ui/__tests__/primitives/
- **Dependencies:** P0-01
- **Blocks:** P0-03, P3-49
- **Acceptance Criteria:**
  - All props map to tokens
  - Polymorphic rendering works (Box as="section", Text as="h1")
  - TypeScript types correct (no any)
  - Unit tests pass
- **Known Pitfalls:**
  - [AGENTS #25] Port components in priority order: primitives first
  - [AGENTS #42] No TypeScript escape hatches
- **Testing:** Component tests with @testing-library/react. Test polymorphic `as` prop renders correct HTML elements. Test all token-mapped props produce correct CSS classes.
- **Estimated Effort:** Small
- **Risk:** Low — Reference implementations exist in docs/design-system/primitives/.
- **Progress Update (2026-02-11):** `Box`, `Stack`, and `Text` primitives are implemented in `packages/ui/src/primitives/` with token-mapped styling and polymorphic rendering. Primitive test suites pass in workspace runs.

---

### Task: P0-03 Priority Components
- **Phase:** 0
- **Status:** Completed (2026-02-11, spec-aligned dark-mode support verified)
- **Files to Create/Modify:** packages/ui/src/components/Button.tsx, Card.tsx, Badge.tsx, NavRail.tsx, Icon.tsx, index.ts, packages/ui/__tests__/components/
- **Dependencies:** P0-02
- **Blocks:** P1-10, P1-15, P1-17, P1-23, P1-24, P2-31, P2-36, P3-45, P3-48, P3-49, P3-50
- **Acceptance Criteria:**
  - All variant+size combos render correctly
  - Loading state shows spinner and disables interaction
  - NavRail keyboard navigation works (arrow keys, Enter, Tab)
  - Dark mode variants work via Tailwind dark: prefix
- **Known Pitfalls:**
  - [AGENTS #25] Port in order: Button → Card → Badge → NavRail
- **Testing:** Component tests for every variant × size combination. Keyboard event tests for NavRail (ArrowUp, ArrowDown, Enter, Tab). Loading state test verifying button is disabled and shows spinner.
- **Estimated Effort:** Medium
- **Risk:** Low — Reference implementations exist. Keyboard navigation on NavRail needs careful testing.
- **Progress Update (2026-02-11):** Refactored `Button`, `Card`, `Badge`, and `NavRail` to Tailwind utility composition with explicit `dark:` variants for normal/hover/active/selected/disabled states. Updated tests (`packages/ui/__tests__/components/{Button,Card,Badge,NavRail}.test.tsx`) now include targeted dark-class assertions and keyboard/behavior regression checks; suite passes under root `pnpm test`.

---

### Task: P0-04 Supabase Setup
- **Phase:** 0
- **Status:** Completed (2026-02-11)
- **Files to Create/Modify:** packages/db/src/supabase/server.ts, client.ts, admin.ts, middleware.ts, storage.ts, apps/web/src/middleware.ts, .env.example
- **Dependencies:** P0-00
- **Blocks:** P0-05, P1-11, P1-18, P1-20, P1-21, P1-22, P2-30, P2-33
- **Acceptance Criteria:**
  - Server-side queries work in Server Components via cookie-reading server client
  - Browser auth works in Client Components
  - Storage upload/download work via presigned URLs
  - Session persists across page refreshes
  - Middleware refreshes session without blocking rendering
- **Known Pitfalls:**
  - [AGENTS #1] Session NOT directly available in Server Components — must use @supabase/ssr with cookie-reading server client
  - [AGENTS #3] Customize invite emails via Resend, not Supabase defaults
  - [AGENTS #4] Use pooled connection (DATABASE_URL, port 6543) for app queries; direct connection (DIRECT_URL, port 5432) for migrations only
  - [AGENTS #9] Vercel 4.5MB body limit — use presigned URLs for file uploads
- **Testing:** Integration test for auth flow: signup → login → get session → refresh → logout. Storage test: generate presigned URL → upload file → download file → verify content. Middleware test: verify session refresh doesn't throw on expired token.
- **Estimated Effort:** Medium
- **Risk:** High — Auth in Server Components is a known pain point (AGENTS #1). Session refresh middleware must not block rendering. Presigned URL flow adds complexity.
- **Progress Update (2026-02-11):** Supabase server/browser/admin/middleware/storage utilities are implemented in `packages/db/src/supabase/`, and web middleware integrates session refresh plus `X-Request-ID` in `apps/web/src/middleware.ts`. Auth E2E smoke flow passes with configured env vars. Storage presigned upload/download/delete E2E is implemented in `packages/db/__tests__/supabase-storage.integration.test.ts`, and the prior blocker is resolved with the `documents` bucket now provisioned.

---

### Task: P0-05 Drizzle Schema Core
- **Phase:** 0
- **Status:** Completed (2026-02-11, Gate 0 formal sign-off complete)
- **Files to Create/Modify:** packages/db/src/schema/communities.ts, users.ts, user-roles.ts, units.ts, documents.ts, document-categories.ts, notification-preferences.ts, enums.ts, index.ts, drizzle.config.ts, migrations/0000_flashy_toro.sql
- **Dependencies:** P0-04
- **Blocks:** P1-09, P1-13, P1-16, P1-17, P1-18, P1-26, P1-27, P2-36, P2-37, P2-40, P3-47, P3-50, P3-52 (17 specs depend on this — most-depended-upon spec)
- **Acceptance Criteria:**
  - Migration creates all tables correctly on Supabase PostgreSQL
  - Enums enforce valid values: community_type (condo_718, hoa_720, apartment), role (owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin). Note: platform_admin is system-scoped (not in user_roles); auditor deferred to v2 per ADR-001.
  - `user_roles` enforces one active canonical role per `(user_id, community_id)` via DB unique constraint
  - `user_roles.unit_id` FK exists (nullable) to support ADR-001 unit assignment policy enforcement
  - All timestamps are `timestamp with time zone` defaulting to `now()`, stored as UTC
  - Foreign keys have explicit ON DELETE behavior (CASCADE for owned resources, RESTRICT for referenced entities)
  - Soft-delete: `deleted_at` column on all soft-deletable tables (nullable timestamp)
  - TypeScript types generated via `typeof table.$inferSelect` and exported from packages/db
  - BIGINT IDs on tenant tables; `users.id` remains UUID to mirror Supabase `auth.users.id`
  - `community_id` FK on every tenant-scoped table (NOT nullable)
  - `search_text` (text) and `search_vector` (tsvector) columns on documents table
- **Known Pitfalls:**
  - [AGENTS #5] Use `postgres-js` driver, NOT `node-postgres` (PgBouncer incompatibility with `node-postgres`)
  - [AGENTS #6] Never modify production schema manually — all changes via `drizzle-kit generate` then `drizzle-kit migrate`
  - [AGENTS #2] User roles are per-community via user_roles junction table (user_id, community_id, role), NOT a global role column on users
  - [AGENTS #16] All dates stored as UTC. Convert to community timezone at presentation layer ONLY.
- **Testing:** Migration test: run migration on clean database, verify all tables exist with correct columns and types. Enum test: attempt to insert invalid community_type, verify rejection. FK test: attempt to insert user_role with non-existent community_id, verify rejection. Type test: verify TypeScript inferred types match expected shapes.
- **Estimated Effort:** Large
- **Risk:** High — This is the most critical schema in the project. 17 specs depend on it. Getting the schema wrong here cascades failures everywhere.
- **Progress Update (2026-02-11):** Core schema files, enum definitions, and initial Drizzle migration are present (`packages/db/src/schema/*`, `packages/db/migrations/0000_flashy_toro.sql`) with FK/enum/tsvector/soft-delete columns and exported inferred types. Formal Gate 0 validation now passes via `packages/db/__tests__/schema-gate0.integration.test.ts` using temp-schema migration execution over `DIRECT_URL`, with assertions for exact enum labels, invalid enum rejection behavior, FK `ON DELETE` actions, and package-root type/schema exports. Manual schema-to-Phase-1 variance matrix is documented in this plan.

⚠️ **GATE 0: Schema Review** — After P0-05 completes, STOP and verify schema against all Phase 1+ specs before proceeding to P0-06. See Quality Gates section.

---

### Task: P0-06 Scoped Query Builder
- **Phase:** 0
- **Status:** Completed (2026-02-11, implementation and integration verification complete)
- **Files to Create/Modify:** packages/db/src/scoped-client.ts, tenant-context.ts, errors/TenantContextMissing.ts, types/scoped-client.ts, packages/db/__tests__/scoped-client.integration.test.ts, packages/db/__tests__/tenant-context.test.ts
- **Dependencies:** P0-05, GATE 0
- **Blocks:** P1-09, P1-11, P1-14, P1-16, P1-17, P1-18, P1-24, P1-25, P1-27, P2-30, P2-35, P2-36, P2-37, P2-43, P3-45, P3-50, P3-52, P4-55, P4-64
- **Acceptance Criteria:**
  - `createScopedClient(communityId)` wraps Drizzle and auto-appends `.where(eq(table.communityId, ctx.communityId))` to all queries
  - Soft-deletable tables auto-exclude `WHERE deleted_at IS NULL`
  - Cross-tenant isolation verified: communityA client cannot see communityB data
  - `compliance_audit_log` returns all rows (exempt from soft-delete filter — append-only)
  - `TenantContextMissing` error thrown when no community context provided
  - Raw Drizzle `db` object is NOT exported — only `createScopedClient` is exported
- **Known Pitfalls:**
  - [AGENTS #7] Must auto-inject community_id AND deleted_at IS NULL on EVERY query
  - [AGENTS #8] compliance_audit_log excluded from soft-delete filtering (append-only)
  - [AGENTS #13] EVERY query MUST include community_id filter — missing it = cross-tenant data leak
  - [AGENTS #14] Raw Drizzle queries bypass scoping — never use raw `db` outside of scoped-client.ts
- **Testing (CRITICAL — this is the security boundary):**
  - Isolation test: seed 2 communities, query from community A, verify 0 rows from community B
  - Soft-delete test: soft-delete a record, verify it disappears from normal queries
  - Soft-delete exception test: soft-delete an audit log entry, verify it still appears in audit queries
  - Missing context test: call query without communityId, verify TenantContextMissing error (not empty results)
  - Explicit ID bypass test: community A client passes `{ communityId: communityB.id }` in WHERE — verify scoped client overrides with community A's ID
- **Estimated Effort:** Large
- **Risk:** Critical — This is the safety layer preventing cross-tenant data leaks. Must have thorough integration tests from day one.
- **Progress Update (2026-02-11):** Added scoped client surface types in `packages/db/src/types/scoped-client.ts` and exported them via `packages/db/src/index.ts`. Integration tests now lazy-import `createScopedClient` so DATABASE_URL-less environments skip cleanly. Write-path bypass resistance assertions were added for conflicting-tenant `update` and `hardDelete` predicates.
- **Verification Snapshot (2026-02-11):** `pnpm build`, `pnpm typecheck`, and `pnpm test` pass. With env exported (`set -a; source .env.local; set +a`), `pnpm --filter @propertypro/db test:integration` passes end-to-end (`13/13`).

---

### Task: P0-07 Error Handling
- **Phase:** 0
- **Status:** Completed (2026-02-11, stable)
- **Files to Create/Modify:** apps/web/src/lib/api/error-handler.ts, request-id.ts, errors/AppError.ts, ValidationError.ts, UnauthorizedError.ts, ForbiddenError.ts, NotFoundError.ts, RateLimitError.ts, index.ts, zod/error-formatter.ts, components/ErrorBoundary.tsx
- **Dependencies:** P0-00
- **Blocks:** P0-08, P2-42
- **Acceptance Criteria:**
  - `withErrorHandler` HOF wraps all Route Handlers and returns structured JSON: `{ error: { code, message, details? } }`
  - ValidationError → 400, UnauthorizedError → 401, ForbiddenError → 403, NotFoundError → 404, RateLimitError → 429
  - Unknown errors → 500 (no stack trace, no internal details exposed)
  - X-Request-ID header (UUID) present on every response
  - React Error Boundary at portal layout catches render-time errors
  - Toast notification system for API errors
  - Zod error formatter produces human-readable validation messages
- **Known Pitfalls:**
  - [AGENTS #43] Every API Route Handler must use `withErrorHandler` wrapper — no bare try/catch
  - [AGENTS #45] Generate UUID per request in middleware (X-Request-ID header)
- **Testing:** Unit tests for each error class (verify status code, JSON structure). Test that unknown Error() produces 500 with no stack trace. Test X-Request-ID is present and is valid UUID. Test Zod error formatter with nested validation errors.
- **Estimated Effort:** Medium
- **Risk:** Low — Standard pattern, well-understood.
- **Progress Update (2026-02-11):** Existing error class and wrapper behavior remain intact; tests continue to pass with Sentry context-tagging additions and no API-contract regressions.

---

### Task: P0-08 Sentry Setup
- **Phase:** 0
- **Status:** Completed (2026-02-11, automated criteria)
- **Files to Create/Modify:** apps/web/sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts, next.config.ts (update with withSentryConfig), instrumentation.ts
- **Dependencies:** P0-07
- **Blocks:** None directly
- **Acceptance Criteria:**
  - Errors appear in Sentry with communityId and userId as context
  - Server Component errors captured
  - Performance transactions recorded
  - Source maps resolve correctly in production builds
  - No Sentry execution in local dev unless DSN is explicitly set (`SENTRY_DSN` server/edge, `NEXT_PUBLIC_SENTRY_DSN` client)
  - Sensitive headers redacted: authorization, cookie, x-api-key
  - X-Request-ID tagged for correlation with logs
- **Known Pitfalls:**
  - Must integrate with `withErrorHandler` from P0-07 — Sentry.captureException inside the handler
  - X-Request-ID should be tagged as Sentry tag for log correlation
- **Testing:** Verify Sentry client initializes without errors. Verify sensitive header redaction by checking beforeSend callback filters them.
- **Estimated Effort:** Small
- **Risk:** Low — Standard Sentry Next.js integration.
- **Progress Update (2026-02-11):** Added shared request-context extraction (`request_id`, optional `communityId`, optional `userId`), wired tags/user context into `withErrorHandler`, added App Router `global-error.tsx`, and wired `onRequestError` in `instrumentation.ts`.
- **Note:** Manual dashboard validation is complete; `[eval1]` issues were caused by Codex `node -e` execution outside the Next.js runtime and are not application bugs.

⚠️ **GATE 1: Foundation Verification** — After all Phase 0 tasks complete, run the Gate 1 checklist before starting Phase 1. See Quality Gates section.

---

## Forward-Compatibility Check (2026-02-11)

No downstream phase is expected to conflict with the current P0-06/P0-07/P0-08 hardening changes. The following alignments were made to keep future work consistent:

- Canonical audit table naming is standardized to `compliance_audit_log` in downstream tasks (P1-27, P4-55) to match AGENTS guidance and P0-06 soft-delete exemption logic.
- P2-43 remains necessary and non-duplicative: P0-06 validates DB-level scoping behavior, while P2-43 still covers full app/API/subdomain isolation flows.
- `communityId` remains `number` in Phase 0 by design because current Drizzle bigint columns are configured with `mode: 'number'`; a future bigint migration would be an explicit, separate change.
- Sentry request context tagging uses optional headers only; future auth/session phases can populate or refine these values without breaking current error-handling interfaces.

---

## Phase 1 Execution Readiness (2026-02-13)

- **Status:** Complete (Phase 1 implementation and Gate 2 engineering verification complete on `main`)
- **Execution Source of Truth:** `PHASE1_EXECUTION_PLAN.md`
- **Review Outcome:** Go status after closing planning blockers:
  - Added Batch 0.5 audit foundation (`P1-27a`) so mutation tasks can call `logAuditEvent` from the start
  - Split announcement email delivery into post-dependency task (`P1-17c`) after `P1-17`, `P1-26`, and `P1-28`
  - Updated dependency graph to show `P1-20` depending on both `P1-18` and `P1-22`
  - Added platform invariants checklist (scoped client, `withErrorHandler`, audit logging, cross-tenant tests, strict TypeScript)
  - Standardized migration commands to direct DB connection; app/test queries remain on pooled connection
  - Added `pnpm lint` to per-batch verification gates and clarified integration-test execution post-merge
- **Tracking Note:** `P1-15`, `P1-25`, and final `P1-27` endpoint-adoption closeout are completed on `main`. Next execution focus moves to Phase 2 tasks.

---

## Phase 1 Tasks

### Task: P1-09 Compliance Checklist Engine
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `9ba3dc8`)
- **Files to Create/Modify:** packages/db/src/schema/compliance-checklist-items.ts, packages/shared/src/compliance/templates.ts (§718 and §720 constants), apps/web/src/app/api/v1/compliance/route.ts, apps/web/src/lib/utils/compliance-calculator.ts, apps/web/__tests__/compliance/
- **Dependencies:** P0-05, P0-06
- **Blocks:** P1-10, P1-16, P2-39, P1-29
- **Acceptance Criteria:**
  - Creating a condo community auto-generates §718 checklist items
  - Creating an HOA community auto-generates §720 checklist items
  - Creating an apartment community generates NO compliance checklist
  - Checklist item status computed from document presence: satisfied/unsatisfied/overdue/not_applicable
  - 30-day posting deadline tracking works correctly
  - Rolling 12-month windows for minutes/recordings work correctly
- **Known Pitfalls:**
  - [AGENTS #16] All dates stored as UTC. Convert to community timezone at presentation layer ONLY
  - [AGENTS #17] All date calculations must use `date-fns` (NOT native Date, NOT moment.js)
  - [AGENTS #18] Must test DST transitions, weekend posting dates, leap years explicitly
  - [AGENTS #19] Florida spans Eastern and Central time — timezone is per-community, stored in communities.timezone column
- **Testing (COMPREHENSIVE — this is core business logic):**
  - §718 template test: verify condo gets all required checklist items with correct categories
  - §720 template test: verify HOA gets all required checklist items
  - Apartment exclusion test: verify apartment community gets zero checklist items
  - Status calculation test: upload a document, verify checklist item changes from unsatisfied to satisfied
  - Overdue test: set a deadline in the past, verify item shows as overdue
  - **DST spring-forward test:** Meeting on March 8, 2026 in Eastern timezone. Calculate 14-day notice deadline. Verify the result accounts for the spring-forward on March 8.
  - **DST fall-back test:** Meeting on November 1, 2026. Calculate posting deadline. Verify no duplicate or missing hour.
  - **Leap year test:** Document posted January 30. Calculate 30-day deadline. Verify it resolves correctly in leap year (March 1) and non-leap year (March 1).
  - **Weekend test:** Deadline falls on Saturday → verify behavior (does it move to Friday or Monday? Document the business rule explicitly).
  - **Timezone split test:** Same checklist item for Pensacola (America/Chicago) and Miami (America/New_York). Verify deadlines differ by 1 hour.
  - **Year boundary test:** Document posted December 15. 30-day deadline → January 14 next year.
- **Estimated Effort:** Large
- **Risk:** High — Date arithmetic with compliance deadlines is complex. DST transitions and Florida's timezone split add edge cases. This is core business logic that must be correct for regulatory compliance.

---

### Task: P1-10 Compliance Dashboard UI
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `02409c9`)
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx, apps/web/src/components/compliance/compliance-dashboard.tsx, compliance-checklist-item.tsx, compliance-badge.tsx, apps/web/src/lib/utils/pdf-export.ts
- **Dependencies:** P1-09, P0-03
- **Blocks:** P1-29
- **Acceptance Criteria:**
  - Dashboard displays all checklist items with correct status colors (green=satisfied, red=overdue, yellow=unsatisfied, gray=not_applicable)
  - PDF export includes all checklist items with current status and dates
  - Filter by status and category works
  - Timeline view shows upcoming deadlines
- **Known Pitfalls:** None specific beyond general UI pitfalls
- **Testing:** Component test for status badge colors. PDF export test: generate PDF, verify it contains expected checklist items (can verify via text content in generated buffer). Filter test: verify filtering reduces displayed items correctly.
- **Estimated Effort:** Medium
- **Risk:** Medium — PDF export may require additional libraries (jsPDF or @react-pdf/renderer). Specify library choice before implementing.

---

### Task: P1-11 Document Upload Pipeline
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `ab4aa2b`)
- **Files to Create/Modify:** apps/web/src/app/api/v1/upload/route.ts (presign endpoint), apps/web/src/app/api/v1/documents/route.ts (create document record), apps/web/src/components/documents/document-uploader.tsx, apps/web/src/hooks/useDocumentUpload.ts, apps/web/__tests__/upload/
- **Dependencies:** P0-04, P0-06
- **Blocks:** P1-12, P1-13, P1-15, P1-29
- **Acceptance Criteria:**
  - Presigned URL generation returns valid upload URL
  - Client uploads directly to Supabase Storage via presigned URL (NOT through Next.js server)
  - Document record created in DB after successful upload
  - Progress tracking displayed during upload
  - Upload errors handled gracefully with user-visible message
- **Known Pitfalls:**
  - [AGENTS #9] Vercel 4.5MB request body limit — MUST use presigned URLs for direct upload to Supabase Storage. Never route file bytes through the Next.js server.
  - [AGENTS #12] Documents max 50MB, images max 10MB
- **Testing:** Integration test: request presigned URL → verify it's a valid Supabase storage URL. Unit test: document record creation with correct community_id scoping. Error test: simulate upload failure, verify graceful handling.
- **Estimated Effort:** Medium
- **Risk:** Medium — Presigned URL flow is more complex than direct upload but necessary for Vercel deployment.

---

### Task: P1-12 Magic Bytes Validation
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged on `main`)
- **Files to Create/Modify:** apps/web/src/lib/utils/file-validation.ts, apps/web/src/lib/middleware/validate-upload.ts, apps/web/__tests__/file-validation/
- **Dependencies:** P1-11
- **Blocks:** P1-15, P1-29
- **Acceptance Criteria:**
  - PDF files with correct magic bytes (%PDF-) pass validation
  - Non-PDF files with .pdf extension rejected (magic bytes mismatch)
  - DOCX, PNG, JPG validated by their respective magic bytes
  - Size limits enforced: 50MB for documents, 10MB for images
- **Known Pitfalls:**
  - [AGENTS #10] Validate via magic bytes using `file-type` npm package. Never trust Content-Type headers or file extensions.
- **Testing:**
  - Valid PDF test: file with %PDF- header → passes
  - Spoofed PDF test: .exe renamed to .pdf → rejected (magic bytes don't match)
  - Zero-byte file test → rejected gracefully
  - Exact size limit test: 50MB file → accepted; 50MB + 1 byte → rejected
  - Each allowed type: verify PDF, DOCX, PNG, JPG magic bytes recognized
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P1-13 Document Text Extraction
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `54afb8c`)
- **Files to Create/Modify:** apps/web/src/lib/workers/pdf-extraction.ts, apps/web/src/lib/utils/extract-pdf-text.ts, packages/db/src/schema/documents.ts (verify search_text, search_vector columns), apps/web/__tests__/pdf-extraction/
- **Dependencies:** P1-11, P0-05
- **Blocks:** P1-14
- **Acceptance Criteria:**
  - Text extracted from uploaded PDF documents
  - `search_text` column populated with extracted text
  - `search_vector` (tsvector) generated from extracted text for full-text search
  - Extraction runs asynchronously (NOT blocking the upload response)
  - Extraction failures logged but don't break the upload flow
- **Known Pitfalls:**
  - [AGENTS #11] pdf-parse loads entire PDF into memory. Run extraction asynchronously outside the upload handler. Consider using a background job or queue for large files.
- **Testing:** Unit test: extract text from a known test PDF, verify output matches expected text. Integration test: upload PDF → verify search_text populated after extraction completes. Error test: corrupt PDF → extraction fails gracefully, document record still exists with empty search_text. Memory test: verify extraction of a 10MB PDF doesn't crash the process.
- **Estimated Effort:** Medium
- **Risk:** Medium — Memory constraints with large PDFs. Async processing adds complexity.

---

### Task: P1-14 Document Search
- **Phase:** 1
- **Status:** Complete (implemented and verified on `main`)
- **Files to Create/Modify:** apps/web/src/app/api/v1/documents/search/route.ts, packages/db/src/queries/document-search.ts, apps/web/src/components/documents/document-search.tsx, apps/web/__tests__/document-search/
- **Dependencies:** P1-13, P0-06
- **Blocks:** P1-15, P1-25
- **Acceptance Criteria:**
  - Full-text search returns relevant results using PostgreSQL tsvector
  - Results ranked by relevance
  - Filters by category, date range, document type apply correctly
  - Search queries respect community_id scoping (no cross-tenant results)
  - Empty search returns all documents (filtered by category/date if specified)
- **Known Pitfalls:**
  - [AGENTS #13] Search queries must include community_id filter via scoped builder — NEVER use raw queries for search
- **Testing:** Integration test: seed documents with known text → search for keyword → verify correct documents returned. Ranking test: seed documents with different relevance → verify ordering. Isolation test: seed documents in two communities → search from community A → verify zero results from community B. Filter test: verify date range and category filters narrow results correctly.
- **Estimated Effort:** Medium
- **Risk:** Low — PostgreSQL tsvector is mature and well-documented.

---

### Task: P1-15 Document Management UI
- **Phase:** 1
- **Status:** Complete on `main` (POA v2 remediation landed); follow-up caveat tracked as Follow-up Issue #3
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/communities/[id]/documents/page.tsx, apps/web/src/components/documents/document-upload-area.tsx, document-list.tsx, document-viewer.tsx, document-version-history.tsx
- **Dependencies:** P1-11, P1-12, P1-14, P0-03
- **Blocks:** P1-25
- **Acceptance Criteria:**
  - Drag-and-drop upload works with progress indicator
  - Document list displays with search/filter
  - Document viewer opens documents (PDF viewer for PDFs, download for others)
  - Version history displays for documents with multiple versions
  - Delete functionality with soft-delete
- **Known Pitfalls:**
  - Version-history category lineage behavior is functional but has a known caveat in the current UI copy; see Follow-up Issue #3 in the 2026-02-13 POA v2 rollout closeout notes.
- **Testing:** Component tests for upload area (drag events), document list rendering, filter interactions, plus route/component coverage for role-aware delete actions, category filtering, and document version/download/search route threading.
- **Estimated Effort:** Medium
- **Risk:** Medium — core behavior is merged, but version-history caveat remains until Follow-up Issue #3 is completed.

---

### Task: P1-16 Meeting Management
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged on `main`)
- **Files to Create/Modify:** packages/db/src/schema/meetings.ts, packages/db/src/schema/meeting-documents.ts, apps/web/src/app/api/v1/meetings/route.ts, apps/web/src/lib/utils/meeting-calculator.ts, apps/web/src/components/meetings/meeting-form.tsx, meeting-list.tsx
- **Dependencies:** P0-05, P0-06, P1-09
- **Blocks:** P1-23, P1-24
- **Acceptance Criteria:**
  - Meeting CRUD with date, type (board, annual, special, budget), location
  - Compliance deadlines auto-calculated based on meeting date and community type
  - Meeting notices generated with correct lead times
  - Documents attachable to meetings via meeting_documents join table
- **Known Pitfalls:**
  - [AGENTS #16-19] Date handling: UTC storage, community timezone display, DST awareness, date-fns required
- **Testing:** Deadline calculation tests mirroring P1-09 date edge cases (DST, leap year, weekends, timezone split). CRUD integration tests. Document attachment test.
- **Estimated Effort:** Medium
- **Risk:** Medium — Compliance deadline calculation ties into the compliance engine date logic.

---

### Task: P1-17 Announcement System
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `7f06ec5`)
- **Files to Create/Modify:** packages/db/src/schema/announcements.ts, apps/web/src/app/api/v1/announcements/route.ts, apps/web/src/components/announcements/announcement-composer.tsx, announcement-feed.tsx, announcement-toolbar.tsx
- **Dependencies:** P0-05, P0-06, P0-03
- **Blocks:** P1-24
- **Acceptance Criteria:**
  - Announcements created and displayed in resident portal
  - Announcement publish flow sends email delivery asynchronously through the P1-17c integration path, logs per-recipient delivery status, and records summary audit events
  - Pin/featured announcements appear at top
  - Archive functionality hides old announcements from default view
- **Known Pitfalls:**
  - [AGENTS #32] Check notification preferences before sending non-critical emails (once P1-26 is implemented)
- **Testing:** CRUD integration tests. Pin/unpin test. Archive test. Component tests for feed rendering order.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P1-18 Resident Management
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `fa0feac`)
- **Files to Create/Modify:** apps/web/src/app/api/v1/residents/route.ts, apps/web/src/components/residents/resident-form.tsx, resident-list.tsx, apps/web/src/lib/utils/role-validator.ts
- **Dependencies:** P0-04, P0-05, P0-06
- **Blocks:** P1-19, P1-20, P1-26
- **Acceptance Criteria:**
  - CRUD operations for residents work
  - Residents assigned to units via user_roles (user_id, community_id, unit_id)
  - Role assignment works: owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin with community-type constraints enforced per ADR-001
  - One active canonical role per `(user_id, community_id)` is enforced
  - Unit assignment policy enforced: owner/tenant require unit_id; non-unit roles keep unit_id nullable
  - A user can have different roles in different communities
  - Contact info (email, phone) manageable
- **Known Pitfalls:**
  - [AGENTS #2] Roles are per-community via user_roles junction table (user_id, community_id), NOT a global role column
  - [AGENTS #36] Use declarative policy matrix: role × community_type × document_category → allow/deny
- **Testing:** CRUD integration tests. Role assignment test: assign user as board_president in community A and tenant in community B, verify both roles exist correctly. Unit assignment test. Scoping test: verify resident list only shows residents from current community.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P1-19 CSV Import
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `dbc9cec`)
- **Files to Create/Modify:** apps/web/src/app/api/v1/import-residents/route.ts, apps/web/src/lib/utils/csv-validator.ts, apps/web/src/components/residents/csv-import-dialog.tsx, csv-preview-table.tsx, csv-error-report.tsx
- **Dependencies:** P1-18
- **Blocks:** None
- **Acceptance Criteria:**
  - CSV parsed correctly (handle commas in quoted fields, UTF-8 BOM, different line endings)
  - Preview shows parsed data before import
  - Errors reported clearly (row number + column + error message)
  - Import succeeds for valid data, skips invalid rows with error report
  - Duplicate detection by email address
- **Known Pitfalls:** None specific
- **Testing:** Parse test with edge cases: commas in fields, UTF-8 BOM, Windows line endings (\\r\\n), empty rows, trailing commas. Duplicate detection test. Error report test: verify row numbers and messages.
- **Estimated Effort:** Small
- **Risk:** Low — Not on critical path.

---

### Task: P1-20 Invitation Auth Flow
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `b2335fc`)
- **Files to Create/Modify:** apps/web/src/app/api/v1/invitations/route.ts, packages/email/src/templates/invitation-email.tsx, apps/web/src/app/auth/accept-invite/page.tsx, apps/web/src/components/auth/set-password-form.tsx, apps/web/__tests__/invitations/
- **Dependencies:** P1-18, P0-04
- **Blocks:** None directly
- **Acceptance Criteria:**
  - Invitation email sent via Resend (NOT Supabase built-in)
  - Accept invitation link renders set-password form
  - Set-password flow creates Supabase auth user and links to existing user record
  - Token is one-time use — second click shows "already used" message
  - Token expires after configurable period (default 7 days)
- **Known Pitfalls:**
  - [AGENTS #3] Send invite emails via Resend, not Supabase's built-in invite (which uses Supabase's email service)
  - [AGENTS #30] SPF/DKIM/DMARC must be set up in Phase 1 for email deliverability
- **Testing:** Integration test: create invitation → accept → set password → login succeeds. Token reuse test: accept invitation → try to accept again → rejected. Token expiry test: create invitation with short TTL → wait → try to accept → rejected. Email content test: verify invitation email contains correct link and community name.
- **Estimated Effort:** Medium
- **Risk:** Medium — Email deliverability depends on DNS configuration.

---

### Task: P1-21 Password Reset Flow
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `715abbf`)
- **Files to Create/Modify:** apps/web/src/app/auth/forgot-password/page.tsx, apps/web/src/app/auth/reset-password/page.tsx, apps/web/src/components/auth/forgot-password-form.tsx, reset-password-form.tsx
- **Dependencies:** P0-04
- **Blocks:** None
- **Acceptance Criteria:**
  - Reset email sent when valid email submitted
  - Reset link works and renders new password form
  - Password updated successfully
  - Rate limiting: max 3 reset requests per email per hour
  - Non-existent email: same response timing as valid email (prevent email enumeration)
- **Known Pitfalls:** None specific
- **Testing:** Happy path test. Rate limit test: send 4 requests, verify 4th is rejected. Timing attack test: verify response time for valid vs invalid email is similar (within 100ms). Reset link expiry test.
- **Estimated Effort:** Small
- **Risk:** Low — Standard Supabase Auth flow.

---

### Task: P1-22 Session Management
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `3649149`)
- **Files to Create/Modify:** apps/web/src/lib/supabase/server.ts (createServerClient wrapper), client.ts (createBrowserClient wrapper), apps/web/src/middleware.ts (update auth refresh), apps/web/src/app/(authenticated)/layout.tsx, apps/web/src/app/auth/verify-email/page.tsx
- **Dependencies:** P0-04
- **Blocks:** None directly
- **Acceptance Criteria:**
  - Session created on login and persisted in cookies
  - Session persists across page refreshes (middleware refreshes silently)
  - Expired sessions redirect to /auth/login with return URL preserved
  - Auth state change listeners update UI reactively
  - Verify email page handles email confirmation callback
- **Known Pitfalls:**
  - [AGENTS #1] Session NOT available directly in Server Components — must use @supabase/ssr with cookie-reading server client. The pattern is: read cookies → create server client → get session.
- **Testing:** Session persistence test: login → refresh page → verify still authenticated. Expiry test: simulate expired token → verify redirect to login. Return URL test: verify /dashboard redirects to /auth/login?returnTo=/dashboard when unauthenticated.
- **Estimated Effort:** Medium
- **Risk:** Medium — Server Component session handling is a known pain point.

---

### Task: P1-23 Public Website
- **Phase:** 1
- **Status:** Complete (implemented and verified on `main`)
- **Files to Create/Modify:** apps/web/src/app/(public)/[subdomain]/page.tsx, apps/web/src/app/(public)/[subdomain]/notices/page.tsx, apps/web/src/app/(public)/[subdomain]/not-found.tsx, apps/web/src/components/public/public-home.tsx, public-notices.tsx
- **Dependencies:** P0-05, P0-03, P1-16
- **Blocks:** None
- **Acceptance Criteria:**
  - Public community page loads via subdomain (or ?tenant= query param in dev)
  - Meetings and notices displayed
  - Login link navigates to auth page
  - Mobile responsive
  - Non-existent subdomain shows 404
- **Known Pitfalls:**
  - [AGENTS #21] Use query param `?tenant=x` in development; hostname extraction in production. The tenant resolution logic must handle BOTH patterns based on environment.
  - [AGENTS #22] Reserved subdomains that must return 404 or redirect: admin, api, www, mobile, pm, app, dashboard, login, signup, legal
- **Testing:** Tenant resolution test: verify subdomain maps to correct community. Reserved subdomain test: verify "admin.propertypro.com" returns 404/redirect, not a community page. 404 test: verify non-existent subdomain shows not-found page.
- **Estimated Effort:** Medium
- **Risk:** Medium — Subdomain routing in development vs production is tricky. Must work with both patterns.

---

### Task: P1-24 Resident Portal Dashboard
- **Phase:** 1
- **Status:** Complete (implemented and verified on `main`)
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/dashboard/page.tsx, apps/web/src/components/dashboard/dashboard-welcome.tsx, dashboard-announcements.tsx, dashboard-meetings.tsx, dashboard-quick-links.tsx
- **Dependencies:** P0-03, P1-17, P1-16, P0-06
- **Blocks:** P3-48
- **Acceptance Criteria:**
  - Dashboard loads with personalized welcome message (user's first name)
  - Upcoming meetings section (next 5 meetings)
  - Recent announcements section (last 5 announcements)
  - Quick links to documents, settings, maintenance
  - All data scoped to user's community
- **Known Pitfalls:** None specific
- **Testing:** Component tests for each dashboard section. Scoping test: verify dashboard data comes from correct community only. Empty state test: new community with no meetings/announcements shows appropriate empty states.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P1-25 Resident Document Library
- **Phase:** 1
- **Status:** Complete (implemented, tested, and verified on `main`)
- **Files to Create/Modify:** packages/shared/src/access-policies.ts, packages/db/src/queries/document-access.ts, apps/web/src/components/documents/document-library.tsx, document-category-filter.tsx
- **Dependencies:** P1-14, P1-15, P0-06
- **Blocks:** P4-57
- **Acceptance Criteria:**
  - Residents see only documents allowed by access control matrix
  - Owner/board_member/board_president/property_manager_admin document access follows approved ADR-001 matrix
  - CAM/site_manager operational-document access follows ADR-001 community-type constraints
  - Tenant access is restricted to approved ADR-001 categories by community type
  - Category filtering and search work within access-controlled set
  - Download works (presigned URL for authorized users only)
- **Known Pitfalls:**
  - [AGENTS #34-37] Never check community_type directly in components — use CommunityFeatures config object. Enforce access control in Drizzle WHERE clauses (DB layer), not UI only.
  - [AGENTS #41] Ensure specific test coverage for role-based document filtering
- **Testing (CRITICAL — access control must be enforced at DB layer):**
  - Role matrix test: for each canonical role (owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin) × each document category → verify correct allow/deny per ADR-001
  - DB enforcement test: manually construct a query bypassing UI → verify DB-level WHERE clause still filters correctly
  - Cross-role test: user with "tenant" role queries for restricted category docs → verify zero results per ADR-001
  - Scoping test: verify documents from other communities are never visible regardless of role
  - Gate contract checklist: strict policy tests must assert restricted-role denials for disallowed known categories and unknown/unmapped categories; elevated-role tests must assert allow for unknown/unmapped categories.
- **Estimated Effort:** Medium
- **Risk:** High — Access control matrix is complex (role × community_type × document_category). Must be enforced at DB layer, not just UI.

---

### Task: P1-26 Notification Preferences
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged on `main`)
- **Files to Create/Modify:** packages/db/src/schema/notification-preferences.ts (verify table exists from P0-05), apps/web/src/app/(authenticated)/settings/page.tsx, apps/web/src/components/settings/notification-preferences.tsx, apps/web/src/lib/utils/email-preferences.ts, apps/web/__tests__/notification-preferences/
- **Dependencies:** P0-05, P1-18
- **Blocks:** P2-41
- **Acceptance Criteria:**
  - Preferences saved: email_announcements (boolean), email_documents (boolean), email_meetings (boolean), email_maintenance (boolean)
  - Email sending respects per-notification-type toggles
  - Settings page renders current preferences and saves changes
  - Default preference for new users: email_announcements=true + email_documents=true + email_meetings=true + email_maintenance=true
- **Known Pitfalls:**
  - [AGENTS #32] Verify notification preferences before sending any non-critical email. Critical emails (password reset, invitation) always send regardless of preference.
- **Testing:** Preference CRUD test. Default-values test. Update persistence test. Critical email test: disable all non-critical toggles and trigger password reset → verify email IS sent. Non-critical announcement-email suppression is validated in P1-17c integration tests (`email_announcements=false` case).
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P1-27 Audit Logging
- **Phase:** 1
- **Status:** Complete (infrastructure + endpoint adoption + Gate 2 hardening closeout verified on `main`)
- **Files to Create/Modify:** packages/db/src/schema/compliance-audit-log.ts, packages/db/src/utils/audit-logger.ts, apps/web/src/lib/middleware/audit-middleware.ts, packages/db/__tests__/audit-logging/
- **Dependencies:** P0-05, P0-06
- **Blocks:** P3-53
- **Acceptance Criteria:**
  - `compliance_audit_log` table is append-only (no UPDATE or DELETE allowed)
  - All mutations logged with: user_id, action (create/update/delete), resource_type, resource_id, timestamp, old_values (JSON), new_values (JSON)
  - `logAuditEvent()` utility function for manual logging
  - Middleware auto-injects audit logs on Route Handler mutations
  - Audit log queries are exempt from soft-delete filtering (returns ALL entries)
  - community_id scoping still applies to audit log reads (authorized canonical roles only, scoped to own/managed communities per ADR-001 matrix)
- **Known Pitfalls:**
  - [AGENTS #8] compliance_audit_log excluded from soft-delete filtering — append-only, never deleted
  - [AGENTS #44] Every mutation must call logAuditEvent for compliance-relevant actions
- **Progress Update (2026-02-11):**
  - `P1-27a` merged to `main` via `0c0bd22` (from `codex/p1-27a-audit-logging-foundation`) with audit schema/logger foundation.
  - `P1-27b` merged to `main` via `894f56c` (from `feature/p1-27b-audit-logging-middleware`) with append-only guards, middleware scaffolding, middleware tests, and request-id hardening.
  - Verification gate on `main` is green, including db integration tests.
  - Remaining work is endpoint adoption: ensure each new Batch 1 mutation route calls `logAuditEvent` directly or via `withAuditLog`.
  - Red-findings remediation merged to `main` via `18c356d` and added endpoint adoption/hardening for mutation routes (`upload`, `documents`, `compliance`) by removing trust in client `x-user-id` and enforcing Supabase session identity server-side.
  - Follow-up Issue #2 (labels: `security`, `multi-tenant`, `backend`) remained open by decision at this checkpoint; authorization-layer implementation/verification was required before Phase 1 Gate 2 sign-off.
  - [2026-02-12] Batch 2 route adoption and Issue #2 hardening landed on `main`: shared community-membership authorization checks were applied across authenticated mutation handlers (`announcements`, `residents`, `documents`, `upload`, `compliance`, `import-residents`, `invitations`, `meetings`, `notification-preferences`) and validated by route-level tests and db integration coverage.
  - [2026-02-13] Gate 2 hardening follow-up landed: document download audit logging now runs only after successful presigned URL generation, with regression coverage ensuring presign failures return `500` and do not emit `document_accessed` audit events.
- **Testing:** Append-only test: attempt UPDATE on `compliance_audit_log` → verify rejection. Mutation logging test: create a document → verify audit entry created with correct action and new_values. Update logging test: update a document → verify old_values and new_values captured. Soft-delete exemption test: soft-delete a resource → verify audit log for that resource still visible. Scoping test: verify community A board_president cannot see community B's audit trail.
- **Estimated Effort:** Medium
- **Risk:** Medium — Must be wired into every mutation route. Easy to miss one. Consider adding a lint rule or code review checklist.

---

### Task: P1-28 Email Infrastructure
- **Phase:** 1
- **Status:** Complete (implemented, tested, merged via `40497ea`)
- **Files to Create/Modify:** packages/email/src/templates/invitation-email.tsx, password-reset-email.tsx, meeting-notice-email.tsx, compliance-alert-email.tsx, announcement-email.tsx, packages/email/src/send.ts, packages/email/package.json
- **Dependencies:** P0-00
- **Blocks:** P2-41
- **Acceptance Criteria:**
  - Templates render correctly (test with React Email preview)
  - Email preview works in development (`pnpm --filter email dev`)
  - Emails send successfully via Resend SDK
  - All emails include List-Unsubscribe header
  - All emails include community branding (logo, name) in header
- **Known Pitfalls:**
  - [AGENTS #30] Set up SPF/DKIM/DMARC DNS records in Phase 1 — email deliverability degrades significantly without them
  - [AGENTS #31] Use Resend for ALL emails, not Supabase built-in email service
  - [AGENTS #33] Include List-Unsubscribe header on every non-transactional email — required by CAN-SPAM and Gmail 2024 sender requirements
- **Testing:** Template render test: render each template with test data, verify no errors and output contains expected content. List-Unsubscribe test: verify header present in rendered email metadata. Send test (integration): send to test inbox, verify delivery (can use Resend test mode).
- **Estimated Effort:** Medium
- **Risk:** Medium — Email deliverability requires DNS configuration. List-Unsubscribe header is mandatory.

---

### Task: P1-29 Demo Seed Data
- **Phase:** 1
- **Status:** Complete (implemented and verified on `main`)
- **Files to Create/Modify:** scripts/seed-demo.ts, scripts/config/demo-data.ts, packages/db/src/schema/demo-seed-registry.ts, packages/db/__tests__/seed-demo.integration.test.ts
- **Dependencies:** P1-09, P1-10, P1-11, P1-12
- **Blocks:** P2-44, P4-61
- **Acceptance Criteria:**
  - Script runs without error: `pnpm seed:demo`
  - Creates 3 demo communities: "Sunset Condos" (condo_718), "Palm Shores HOA" (hoa_720), "Bay View Apartments" (apartment)
  - Creates demo users with all 4 roles across communities
  - Creates demo documents and compliance checklists
  - Creates demo meetings with attached documents
  - Demo credentials documented in .env.example comments
- **Known Pitfalls:** None specific
- **Testing:** Seed idempotency test: run seed twice → verify no duplicate records (upsert or check-before-insert). Data verification test: after seeding, query each entity type and verify expected counts.
- **Estimated Effort:** Small
- **Risk:** Low

⚠️ **GATE 2: Compliance Core Verification** — After all Phase 1 tasks complete, run the Gate 2 checklist. See Quality Gates section.

---

## Phase 2 Tasks

### Task: P2-30 Subdomain Routing Middleware
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/middleware.ts (update), packages/shared/src/middleware/subdomain-router.ts, packages/shared/src/middleware/reserved-subdomains.ts
- **Dependencies:** P0-04, P0-06
- **Blocks:** P2-43
- **Acceptance Criteria:**
  - Subdomain extracted from request hostname and resolved to communityId
  - In development: `?tenant=x` query param used instead of subdomain
  - Tenant context set in request headers for downstream Route Handlers
  - Reserved subdomains (admin, api, www, mobile, pm, app, dashboard, login, signup, legal) return 404 or redirect to main site
  - Non-existent subdomain returns 404 with helpful message
- **Known Pitfalls:**
  - [AGENTS #21] Use query param `?tenant=x` in dev; hostname extraction in production. Use `process.env.NODE_ENV` to switch.
  - [AGENTS #22] Reserved subdomains: admin, api, www, mobile, pm, app, dashboard, login, signup, legal
- **Testing:** Resolution test: valid subdomain → correct communityId. Dev mode test: ?tenant=x → correct communityId. Reserved subdomain test: each reserved name → 404. Non-existent test: random subdomain → 404.
- **Estimated Effort:** Medium
- **Risk:** Medium — Dev/prod routing inconsistency is a known challenge.

---

### Task: P2-31 Marketing Landing Page
- **Phase:** 2
- **Status:** Complete (587 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** apps/web/src/app/(marketing)/page.tsx, apps/web/src/components/marketing/hero.tsx, pricing.tsx, features.tsx, footer.tsx
- **Dependencies:** P0-03
- **Blocks:** P2-33
- **Acceptance Criteria:**
  - Hero, features, pricing sections render
  - CTA buttons link to signup flow
  - Mobile responsive (test at 375px, 768px, 1024px)
  - Navigation works
- **Known Pitfalls:** None specific
- **Testing:** Component render tests. Mobile responsive snapshot tests at breakpoints.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-32 Legal Pages
- **Phase:** 2
- **Status:** Complete (587 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** apps/web/src/app/legal/terms/page.tsx, apps/web/src/app/legal/privacy/page.tsx, apps/web/src/content/legal/terms.md, privacy.md
- **Dependencies:** P0-00
- **Blocks:** None
- **Acceptance Criteria:**
  - Terms of Service and Privacy Policy pages render from Markdown content
  - Content formatted with proper headings and sections
  - Links between pages work
- **Known Pitfalls:** None specific
- **Testing:** Page render test. Link test.
- **Estimated Effort:** Small
- **Risk:** Low — Content creation, not engineering risk.

---

### Task: P2-32a Document Extraction Status & pdf-parse Integration
- **Phase:** 2 (can be implemented independently — no blockers from P2-33/34/35 chain)
- **Status:** Complete (570 tests, gate passed 2026-02-14; badge fix committed for missing React import in document-list.tsx)
- **Files to Create/Modify:** packages/db/src/schema/documents.ts (add extractionStatus column), packages/db/migrations/ (new migration), apps/web/src/lib/workers/pdf-extraction.ts (update to set status), apps/web/src/app/api/v1/documents/route.ts (set initial status on upload), apps/web/src/components/documents/document-list.tsx (surface extraction status), apps/web/package.json (add pdf-parse dependency)
- **Dependencies:** P1-11, P1-14 (both complete)
- **Blocks:** None (enhances existing functionality)
- **Rationale:** The current fire-and-forget extraction pipeline (`queuePdfExtraction`) silently swallows failures. A board president who uploads their declaration and can't find it via search will assume the product is broken. This task adds visible extraction status tracking and installs `pdf-parse` as a real dependency (the dynamic import path in `extract-pdf-text.ts` already supports it).
- **Schema Change:**
  - Add `extractionStatus` enum to `packages/db/src/schema/enums.ts`: `pending`, `completed`, `failed`, `not_applicable`, `skipped`
  - Add `extractionStatus` column to `documents` table (default: `not_applicable`)
  - Add `extractionError` text column (nullable, stores error message on failure)
  - Add `extractedAt` timestamp column (nullable, set on successful extraction)
- **Worker Changes:**
  - POST handler sets `extractionStatus = 'pending'` for PDFs, `'not_applicable'` for non-PDFs
  - Worker sets `extractionStatus = 'completed'` + `extractedAt = now()` on success
  - Worker sets `extractionStatus = 'failed'` + `extractionError = err.message` on failure
  - Worker sets `extractionStatus = 'skipped'` when `pdf-parse` returns empty text (scanned PDF with no extractable text layer)
- **UI Changes:**
  - Document list shows extraction status badge: "Searchable" (green, completed), "Processing" (yellow, pending), "Not searchable" (gray, failed/skipped)
  - Admin document detail view shows extraction error message if failed
  - No blocking UX — document is fully usable regardless of extraction status
- **Acceptance Criteria:**
  - [ ] PDF upload sets extractionStatus to `pending`, extraction worker updates to `completed` on success
  - [ ] Failed extraction sets status to `failed` with error message preserved in `extractionError`
  - [ ] Empty extraction (scanned PDF) sets status to `skipped`
  - [ ] Non-PDF uploads set status to `not_applicable`
  - [ ] Document list UI shows extraction status badge
  - [ ] `pdf-parse` installed as dependency and used as primary extraction path (fallback parser remains for environments where pdf-parse is unavailable)
  - [ ] Existing documents with null extractionStatus treated as `not_applicable` in UI (backward compatible)
  - [ ] pnpm test passes
- **Testing:** Unit test: mock pdf-parse success → verify status = completed. Unit test: mock pdf-parse failure → verify status = failed with error. Unit test: mock pdf-parse empty result → verify status = skipped. Integration test: upload PDF → verify extractionStatus column updated. Component test: verify status badges render correctly for each state.
- **Estimated Effort:** Small-Medium (1-2 days)
- **Risk:** Low — additive change, backward compatible, no breaking changes to existing queries. The `pdf-parse` library is well-maintained and handles most digital PDFs reliably.
- **Future Enhancement (Phase 4):** Add retry queue for `failed` extractions (Vercel Cron or Inngest). Add cloud OCR fallback (AWS Textract) for `skipped` extractions (scanned PDFs). See Phase 4 tech debt note in Progress Snapshot.

---

### Task: P2-33 Self-Service Signup
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(auth)/signup/page.tsx, apps/web/src/components/signup/signup-form.tsx, community-type-selector.tsx, subdomain-checker.tsx, apps/web/src/lib/actions/signup.ts
- **Dependencies:** P2-31, P0-04
- **Blocks:** P2-34
- **Acceptance Criteria:**
  - Signup form collects: email, password, community name, community type (apartment/condo/HOA)
  - Subdomain auto-suggested from community name (lowercase, hyphenated)
  - Subdomain availability checked in real-time (debounced)
  - Reserved subdomains rejected with clear message
  - Email verification sent via Resend
  - Initial community-admin user and community record created (board_president for condo_718/hoa_720, site_manager for apartment)
- **Known Pitfalls:**
  - [AGENTS #22] Reserved subdomains must be blocked during signup
- **Testing:** Signup flow integration test. Subdomain availability test: taken subdomain → unavailable, free subdomain → available. Reserved subdomain test: "admin" → rejected. Validation test: weak password, invalid email → rejected with clear messages.
- **Estimated Effort:** Medium
- **Risk:** Medium

---

### Task: P2-34 Stripe Integration
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/api/v1/webhooks/stripe/route.ts, apps/web/src/lib/actions/checkout.ts, apps/web/src/lib/services/stripe-service.ts, packages/db/src/schema/subscriptions.ts
- **Dependencies:** P2-33
- **Blocks:** P2-35
- **Acceptance Criteria:**
  - Checkout session created with correct plan and pricing
  - Webhook handler processes events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted
  - Subscription record created/updated in DB after successful payment
  - Invoice generated and accessible
  - Webhook signature verified before any processing
- **Known Pitfalls:**
  - [AGENTS #26] Webhook handlers MUST be idempotent — store processed event IDs and skip duplicates
  - [AGENTS #27] ALWAYS verify webhook signatures using Stripe's `constructEvent()` before processing any payload
  - [AGENTS #28] Inside webhook handlers, fetch latest state from Stripe API (`stripe.subscriptions.retrieve()`). Do NOT rely solely on webhook payload — it may be stale.
  - [AGENTS #29] Events can arrive out of order (e.g., invoice.paid before checkout.session.completed). Design handlers to be order-independent.
- **Testing (CRITICAL — payment processing must be correct):**
  - Idempotency test: send same webhook event twice → verify only one subscription record created
  - Signature test: send event with invalid signature → verify 400 rejection, no processing
  - Out-of-order test: send invoice.paid before checkout.session.completed → verify both processed correctly regardless of order
  - Subscription lifecycle test: create → upgrade → cancel → verify each state transition recorded correctly
  - Failed payment test: send invoice.payment_failed → verify subscription status updated to past_due
  - Graceful degradation test: subscription canceled → public site still accessible, admin routes return 403 with upgrade prompt
  - Email alert test: payment failure → verify email sent to all community_admin roles (board_president, cam, site_manager per community type)
- **Estimated Effort:** Large
- **Risk:** High — Stripe integration has 4 specific pitfalls in AGENTS.md. Payment processing must be bulletproof. Use Stripe CLI for local testing with `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.

#### P2-34a: Payment Failure Email Alerts & Graceful Degradation

This sub-task defines the customer-facing behavior when Stripe payments fail or subscriptions lapse. This is critical because a dark public website makes the association non-compliant with Florida statute, which is the exact problem they're paying us to solve.

**Subscription Status Lifecycle:**
```
active → past_due → canceled → expired
         │                      │
         └── payment succeeds ──┘ (reactivates to active)
```

**Graceful Degradation Rules by Status:**

| Status | Public Website | Owner Portal (Read) | Admin Dashboard (Write) | Document Upload | Email Alerts |
|--------|---------------|--------------------|-----------------------|----------------|-------------|
| `active` | Full access | Full access | Full access | Enabled | None |
| `trialing` | Full access | Full access | Full access | Enabled | None |
| `past_due` | Full access | Full access | Full access + banner warning | Enabled | Payment failure email to community admins (board_president, cam, or site_manager per community type) |
| `canceled` | **Read-only (public pages + documents remain visible)** | Read-only (documents viewable, no new submissions) | **Locked** — all mutation routes return 403 with `subscription_required` error code | Disabled | Cancellation confirmation email + "your public site remains live for 30 days" |
| `expired` (30 days post-cancel) | **Offline** — returns branded "This community's portal is temporarily unavailable" page | Locked | Locked | Disabled | Final warning email 7 days before expiry |

**Design rationale for `canceled` status:** The public website MUST stay readable during the canceled grace period. Taking it offline immediately would make the association non-compliant with §718.111(12)(g), which exposes them to $50/day damages and potential lawsuits from unit owners. This is the strongest re-activation incentive we have — "your site is still live, but you can't update it." Board members will reactivate when they realize they can't post meeting notices.

**Email Alert Sequence (on `invoice.payment_failed`):**
1. **Immediate (Day 0):** "Payment failed for [Association Name]" — sent to all users with community_admin permission profile (board_president, cam, site_manager depending on community type). Include: last 4 digits of card, amount, direct link to Stripe Customer Portal for card update. Subject: `Action Required: Payment failed for [Association Name]`
2. **Day 3 (if still past_due):** Follow-up reminder. Subject: `Reminder: Update payment method for [Association Name]`
3. **Day 7 (if still past_due):** Escalation warning with consequences. Subject: `Warning: [Association Name] subscription will be canceled in [X] days`
4. **On cancellation:** Confirmation with grace period timeline. Subject: `[Association Name] subscription canceled — your site remains live for 30 days`
5. **Day 23 post-cancel (7 days before expiry):** Final warning. Subject: `Final Notice: [Association Name] portal goes offline in 7 days`

**Implementation Notes:**
- Email sequence scheduling: Use Vercel Cron or Inngest for follow-up emails (Day 3, Day 7). Do NOT rely on webhook timing for follow-ups — Stripe may not send additional events on a predictable schedule.
- Community admin resolution: Use the existing `requireCommunityMembership` + permission profile logic to identify recipients. For condo_718/hoa_720 → board_president + cam. For apartment → site_manager + property_manager_admin.
- Stripe Customer Portal: Use `stripe.billingPortal.sessions.create()` to generate a direct link for card updates. Embed this link in every payment failure email.
- Subscription status column: Add `subscriptionStatus` enum to `communities` table (trialing, active, past_due, canceled, expired). Webhook handler updates this on every subscription event. Middleware reads this to enforce degradation rules.
- Admin route enforcement: Add `requireActiveSubscription` middleware check on all admin mutation endpoints. Returns `{ error: { code: 'subscription_required', message: '...', upgradeUrl: '...' } }` for non-active subscriptions.
- Public site enforcement: The public route handler checks `subscriptionStatus` — if `expired`, renders the branded unavailable page. All other statuses render normally.

**Files to Create/Modify (in addition to P2-34 base):**
- `apps/web/src/lib/middleware/subscription-guard.ts` — middleware for mutation route enforcement
- `packages/email/src/templates/payment-failed.tsx` — payment failure email template
- `packages/email/src/templates/subscription-canceled.tsx` — cancellation email template
- `packages/email/src/templates/subscription-expiry-warning.tsx` — final warning email template
- `apps/web/src/app/(public)/[slug]/unavailable/page.tsx` — branded unavailable page for expired communities
- `apps/web/src/lib/services/payment-alert-scheduler.ts` — schedules follow-up emails on Day 3/7/23

**Acceptance Criteria (P2-34a specific):**
- [ ] `invoice.payment_failed` webhook updates community status to `past_due` and sends immediate email to community admins
- [ ] `customer.subscription.deleted` webhook updates community status to `canceled`, sends cancellation email with grace period notice
- [ ] Admin mutation routes return 403 with `subscription_required` code when subscription is `canceled` or `expired`
- [ ] Public website remains fully accessible when subscription is `past_due` or `canceled`
- [ ] Public website renders branded unavailable page when subscription is `expired`
- [ ] Owner portal documents remain viewable (read-only) when subscription is `canceled`
- [ ] Payment failure email includes Stripe Customer Portal link for card update
- [ ] Follow-up emails sent on Day 3 and Day 7 if status remains `past_due`
- [ ] Final warning email sent 7 days before expiry (Day 23 post-cancel)
- [ ] `invoice.payment_succeeded` after `past_due` resets community status to `active` and cancels pending follow-up emails

---

### Task: P2-35 Provisioning Pipeline
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/lib/services/provisioning-service.ts, apps/web/src/lib/provisioning-idempotency.ts, packages/email/src/templates/welcome.tsx, packages/db/src/schema/provisioning-events.ts
- **Dependencies:** P2-34, P0-05, P0-06
- **Blocks:** P2-38, P2-39
- **Acceptance Criteria:**
  - Provisioning steps execute in order: create community → create storage bucket → create canonical initial user_role (board_president for condo_718/hoa_720, site_manager for apartment) → create Stripe customer → send welcome email
  - Each step is idempotent (can be safely retried)
  - Provisioning events table tracks each step's status (pending → completed → failed)
  - Partial failure: if step 3 fails, steps 1-2 are not rolled back but step 3 can be retried
  - Idempotency key (based on signup request ID) prevents duplicate provisioning
  - Welcome email sent after successful provisioning
- **Known Pitfalls:**
  - Idempotency is critical — retry safety must be guaranteed for every external service call
- **Testing:** Happy path test: full provisioning → verify all resources created. Idempotency test: run provisioning twice with same idempotency key → verify no duplicates. Partial failure test: mock Stripe failure at step 4 → verify steps 1-3 completed → retry → verify step 4 completes without re-running 1-3. Event tracking test: verify provisioning_events table records all step statuses.
- **Estimated Effort:** Large
- **Risk:** High — Multi-step provisioning with external services (Supabase, Stripe, Resend). Failure at any step must be recoverable.

---

### Task: P2-36 Apartment Operational Dashboard
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx, apps/web/src/components/dashboard/apartment-dashboard.tsx, apartment-metrics.tsx, apps/web/src/lib/queries/apartment-metrics.ts
- **Dependencies:** P0-03, P0-05, P0-06
- **Blocks:** P2-38, P2-44
- **Acceptance Criteria:**
  - Unit occupancy overview (occupied vs vacant)
  - Lease expiration alerts (expiring within 30, 60, 90 days)
  - Maintenance request summary (open, in-progress, resolved counts)
  - Revenue metrics (total rent, occupancy rate)
- **Known Pitfalls:**
  - [AGENTS #34] Use CommunityFeatures config to conditionally render apartment-specific features. Never check `community.type === 'apartment'` directly in components.
- **Testing:** Metrics accuracy test: seed known data → verify dashboard shows correct numbers. Feature flag test: verify dashboard does NOT render for condo/HOA community types.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-37 Lease Tracking
- **Phase:** 2
- **Status:** Complete (557 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** packages/db/src/schema/leases.ts, apps/web/src/app/api/v1/leases/route.ts, apps/web/src/lib/services/lease-expiration-service.ts, apps/web/src/lib/actions/leases.ts
- **Dependencies:** P0-05, P0-06
- **Blocks:** P2-38, P2-44
- **Acceptance Criteria:**
  - Lease CRUD: unit_id, resident_id, start_date, end_date, rent_amount, status (active, expired, renewed)
  - Lease expiration calculated correctly
  - Alerts generated for leases expiring within configurable windows (30, 60, 90 days)
  - Lease renewal creates new lease record linked to previous
- **Known Pitfalls:**
  - [AGENTS #16-17] UTC storage, date-fns for all date calculations
- **Testing:** Expiration calculation test with date edge cases. Renewal chain test: original → renewal → verify linkage. Alert threshold test: lease expiring in 29 days → alert triggered; 91 days → no alert.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-38 Apartment Onboarding Wizard
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/onboarding/apartment/page.tsx, apps/web/src/components/onboarding/apartment-wizard.tsx, apps/web/src/components/onboarding/steps/profile-step.tsx, units-step.tsx, rules-step.tsx
- **Dependencies:** P2-35, P2-36, P2-37
- **Blocks:** None
- **Acceptance Criteria:**
  - Multi-step wizard: Step 1 (community profile) → Step 2 (units configuration) → Step 3 (lease rules)
  - Data saved at each step (can resume if wizard abandoned mid-way)
  - Validation at each step before advancing
  - After completion, apartment dashboard shows configured data
- **Known Pitfalls:** None specific
- **Testing:** Step progression test. Validation test: invalid data at step 2 → cannot advance. Resume test: complete step 1, leave wizard, return → step 1 data preserved. End-to-end test: complete all steps → verify dashboard populated.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-39 Condo Onboarding Wizard
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/onboarding/condo/page.tsx, apps/web/src/components/onboarding/condo-wizard.tsx, apps/web/src/components/onboarding/steps/statutory-documents-step.tsx, community-profile-step.tsx, unit-roster-step.tsx
- **Dependencies:** P2-35, P1-09
- **Blocks:** None
- **Acceptance Criteria:**
  - Multi-step wizard: Step 1 (upload statutory documents) → Step 2 (community profile) → Step 3 (unit roster import)
  - Compliance checklist auto-generated after Step 1 documents uploaded
  - Unit roster supports manual entry and CSV import
  - Works for both condo_718 and hoa_720 community types
- **Known Pitfalls:** None specific
- **Testing:** Checklist generation test: upload docs at step 1 → verify checklist items created. Type test: verify wizard works for both condo and HOA. CSV import test at step 3.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-40 Community Features Config
- **Phase:** 2
- **Status:** Complete (593 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** packages/shared/src/features/community-features.ts, packages/shared/src/features/types.ts, packages/shared/src/features/get-features.ts
- **Dependencies:** P0-05
- **Blocks:** P3-45, P3-48
- **Acceptance Criteria:**
  - `getFeatures(communityType)` returns feature flags object
  - Feature matrix:
    - `hasComplianceChecklist`: true for condo_718 and hoa_720, false for apartment
    - `hasLeaseTracking`: true for apartment, false for condo_718 and hoa_720
    - `hasMeetingManagement`: true for all
    - `hasDocumentManagement`: true for all
    - `hasMaintenanceRequests`: true for all
  - Frontend components use `features.hasX` checks, NEVER `community.type === 'x'`
- **Known Pitfalls:**
  - [AGENTS #34] Never check community_type directly in components — use CommunityFeatures config
  - [AGENTS #35] Components check `features.hasCompliance`, `features.hasLeaseTracking`, etc.
- **Testing:** Feature matrix test: for each community type × each feature → verify correct boolean. Type safety test: verify TypeScript catches direct community_type comparisons (via lint rule or type constraint).
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P2-41 Email Notifications
- **Phase:** 2
- **Status:** Complete (557 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** packages/email/src/templates/meeting-notice.tsx, compliance-alert.tsx, announcement-blast.tsx, maintenance-update.tsx, apps/web/src/lib/services/email-service.ts
- **Dependencies:** P1-28, P1-26
- **Blocks:** None
- **Acceptance Criteria:**
  - Meeting notice, compliance alert, announcement blast, and maintenance update emails send correctly
  - HTML renders properly across email clients (tested in React Email preview)
  - Notification preferences respected (never send to users with frequency=never for non-critical emails)
  - Bulk sending works without rate limit issues (use Resend batch API)
  - List-Unsubscribe header on all non-transactional emails
- **Known Pitfalls:**
  - [AGENTS #32] Verify notification preferences before sending non-critical email
  - [AGENTS #33] List-Unsubscribe header required
- **Testing:** Preference gate test: user with frequency=never → no email sent. Bulk test: 100 recipients → all emails sent. Template render test for each template type.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P2-42 Rate Limiting
- **Phase:** 2
- **Status:** Complete (557 tests, gate passed 2026-02-14)
- **Files to Create/Modify:** apps/web/src/lib/middleware/rate-limit.ts, apps/web/src/lib/rate-limiter.ts, apps/web/src/lib/services/upstash-service.ts
- **Dependencies:** P0-07
- **Blocks:** None
- **Acceptance Criteria:**
  - Rate limit by IP for unauthenticated requests
  - Rate limit by user ID for authenticated requests
  - Sliding window algorithm (not fixed window)
  - Different limits per endpoint category: auth (5/min), API read (100/min), API write (30/min)
  - Returns 429 Too Many Requests with Retry-After header
- **Known Pitfalls:** None specific — requires Upstash Redis account with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars.
- **Testing:** Rate limit test: send N+1 requests → verify Nth succeeds, N+1th returns 429. Retry-After test: verify header contains correct reset time. Per-user test: user A at limit → user B still works. Sliding window test: wait partial window → verify new requests allowed proportionally.
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P2-43 Multi-Tenant Isolation Tests
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/__tests__/integration/multi-tenant-isolation.test.ts, apps/web/__tests__/fixtures/multi-tenant-communities.ts, multi-tenant-users.ts
- **Dependencies:** P0-06, P2-30
- **Blocks:** P4-55
- **Acceptance Criteria:**
  - Community A board_president cannot query community B data via any endpoint
  - Scoped query builder enforces isolation at DB level
  - Soft-delete filtering works correctly per tenant
  - All CRUD endpoints tested for cross-tenant access
  - Subdomain routing correctly isolates tenant context
- **Known Pitfalls:**
  - [AGENTS #15] Integration tests MUST verify cross-tenant isolation — this is a security requirement
  - [AGENTS #40] Missing cross-tenant isolation tests is explicitly flagged as a critical pitfall
- **Testing (COMPREHENSIVE — security critical):**
  - For EACH entity type (documents, meetings, announcements, residents, audit logs, compliance items): seed data in community A and B → query from community A → verify zero community B results
  - Direct ID access test: community A board_president requests /api/v1/documents/[communityB-doc-id] → verify 404 (not 403, to avoid information leakage)
  - Mutation test: community A board_president attempts to create record with communityB.id → verify rejection
  - Subdomain mismatch test: request to communityA subdomain with communityB auth token → verify tenant context from subdomain takes precedence
- **Estimated Effort:** Medium
- **Risk:** Medium — Critical for security. Must be thorough.

⚠️ **GATE 3: Multi-Tenant Verification** — After all Phase 2 tasks complete, run the Gate 3 checklist. See Quality Gates section.

---

### Task: P2-44 Apartment Demo Seed
- **Phase:** 2
- **Status:** Not Started
- **Files to Create/Modify:** scripts/seed-demo.ts (extend), scripts/fixtures/apartment-demo-data.ts, scripts/seed-apartment-demo.ts
- **Dependencies:** P2-36, P2-37, P1-29
- **Blocks:** P4-61
- **Acceptance Criteria:**
  - Demo apartment community seeded with 20+ units
  - Demo leases with various statuses (active, expiring soon, expired)
  - Demo residents assigned to units
  - Apartment dashboard displays seeded data correctly
- **Known Pitfalls:** None specific
- **Testing:** Seed run test. Dashboard display test after seeding.
- **Estimated Effort:** Small
- **Risk:** Low

---

## Phase 3 Tasks

### Task: P3-45 PM Portfolio Dashboard
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(pm)/dashboard/communities/page.tsx, apps/web/src/components/pm/CommunityCard.tsx, CommunityFilters.tsx, apps/web/src/lib/api/pm-communities.ts
- **Dependencies:** P0-03, P0-06, P2-40
- **Blocks:** P3-46, P3-47, P3-54
- **Acceptance Criteria:**
  - All communities managed by current PM user displayed as cards
  - Each card shows key metrics (resident count, open maintenance, compliance status)
  - Filter by community type and search by name
  - Click card navigates to community-specific dashboard
- **Known Pitfalls:** None specific
- **Testing:** Multi-community test: PM managing 3 communities → all 3 cards displayed. Filter test. Metrics accuracy test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-46 PM Community Switcher
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(pm)/dashboard/[community_id]/page.tsx, apps/web/src/components/pm/CommunitySwitcher.tsx, apps/web/src/lib/api/community-context.ts, apps/web/src/hooks/useSelectedCommunity.ts
- **Dependencies:** P3-45
- **Blocks:** P3-54
- **Acceptance Criteria:**
  - Dropdown in header shows all managed communities
  - Recently accessed communities appear first
  - Quick search/filter within dropdown
  - Switching community updates all data on current page without full navigation
- **Known Pitfalls:** None specific
- **Testing:** Switch test: switch community → verify data updates. Recency test: access community C, verify it moves to top of recent list.
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P3-47 White-Label Branding
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(pm)/settings/branding/page.tsx, apps/web/src/components/pm/BrandingForm.tsx, BrandingPreview.tsx, apps/web/src/lib/api/branding.ts, apps/web/src/lib/services/image-processor.ts
- **Dependencies:** P3-45, P0-05
- **Blocks:** P3-54
- **Acceptance Criteria:**
  - Logo upload (PNG/JPG, max 2MB, auto-resize to 200x200 and 40x40)
  - Primary and secondary color picker
  - Live preview of branding changes
  - Save persists to communities.branding JSONB column
  - Public site and resident portal reflect saved branding
- **Known Pitfalls:** None specific
- **Testing:** Upload test: valid logo → resized and saved. Color test: save colors → verify CSS variables updated. Preview test: changes reflected in real-time before save.
- **Estimated Effort:** Medium
- **Risk:** Medium — Image processing and dynamic CSS variable injection add complexity.

---

### Task: P3-48 Phone Frame Mobile Preview
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/components/mobile/PhoneFrame.tsx, apps/web/src/app/mobile/layout.tsx, apps/web/src/app/mobile/page.tsx, apps/web/src/app/mobile/documents/page.tsx, apps/web/src/app/mobile/meetings/page.tsx
- **Dependencies:** P0-03, P1-24, P2-40
- **Blocks:** P3-49, P3-54
- **Acceptance Criteria:**
  - iPhone (375×812) and Android (360×800) viewport simulation in iframe
  - Resident portal content displays within mobile frame
  - Zoom controls (50%, 75%, 100%)
  - Device rotation toggle (portrait/landscape)
- **Known Pitfalls:** None specific
- **Testing:** Frame render test. Viewport dimensions test. Zoom level test. Rotation test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-49 Mobile Layouts
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/components/mobile/BottomTabBar.tsx, CompactCard.tsx, apps/web/src/app/mobile/layout.tsx, apps/web/src/styles/mobile.css
- **Dependencies:** P3-48, P0-02, P0-03
- **Blocks:** None
- **Acceptance Criteria:**
  - Bottom tab bar with Home, Documents, Meetings, Settings tabs
  - Compact card layout for list views
  - Touch-friendly buttons (48×48px minimum touch target)
  - Readable text (minimum 16px body text on mobile)
- **Known Pitfalls:** None specific
- **Testing:** Touch target test: verify all interactive elements meet 48×48px minimum. Text size test. Tab navigation test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-50 Maintenance Request Submission
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** packages/db/src/schema/maintenance-requests.ts, apps/web/src/app/(authenticated)/maintenance/submit/page.tsx, apps/web/src/components/maintenance/SubmitForm.tsx, RequestCard.tsx, CommentThread.tsx, apps/web/src/lib/api/maintenance-requests.ts
- **Dependencies:** P0-05, P0-06, P0-03
- **Blocks:** P3-51
- **Acceptance Criteria:**
  - Maintenance request created with: title, description, priority (low/medium/high/urgent), location, category
  - Image upload via presigned URLs (max 5 images, max 10MB each)
  - Status tracking: submitted → acknowledged → in_progress → resolved → closed
  - Comment thread on each request
  - Email notification to community admin on new request
- **Known Pitfalls:**
  - [AGENTS #9] Use presigned URLs for image uploads (Vercel body limit)
- **Testing:** CRUD test. Image upload test. Status transition test: verify valid transitions, reject invalid ones (e.g., submitted → closed). Comment thread test. Notification test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-51 Maintenance Request Admin
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/maintenance/inbox/page.tsx, apps/web/src/components/maintenance/AdminInbox.tsx, AssignmentModal.tsx, StatusUpdateForm.tsx, apps/web/src/lib/api/admin-maintenance.ts
- **Dependencies:** P3-50
- **Blocks:** None
- **Acceptance Criteria:**
  - Admin inbox shows all maintenance requests for community
  - Filter by status, priority, location
  - Assign request to maintenance vendor (text field, not vendor management system)
  - Update status with optional note
  - Email notification to resident on status change
- **Known Pitfalls:** None specific
- **Testing:** Inbox rendering test. Filter test. Assignment test. Status update notification test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-52 Contract & Vendor Tracking
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** packages/db/src/schema/contracts.ts, apps/web/src/app/(authenticated)/contracts/page.tsx, apps/web/src/components/contracts/ContractForm.tsx, ContractTable.tsx, BidTracker.tsx, apps/web/src/lib/api/contracts.ts
- **Dependencies:** P0-05, P0-06
- **Blocks:** None
- **Acceptance Criteria:**
  - Contract CRUD: vendor_name, start_date, end_date, amount, renewal_date, description
  - Vendor bid tracking: multiple bids per contract opening
  - Contract renewal alerts (30, 60, 90 days before end_date)
  - Document attachment to contracts
- **Known Pitfalls:** None specific
- **Testing:** CRUD test. Renewal alert test. Bid comparison test. Document attachment test.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-53 Audit Trail Viewer
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/audit-trail/page.tsx, apps/web/src/components/audit/AuditTrailViewer.tsx, AuditFilters.tsx, AuditEntry.tsx, apps/web/src/lib/api/audit-trail.ts
- **Dependencies:** P1-27
- **Blocks:** None
- **Acceptance Criteria:**
  - Audit logs displayed in reverse chronological order
  - Filter by: user, action type (create/update/delete), resource type, date range
  - Each entry shows: timestamp, user, action, resource, before/after diff
  - Search by resource ID or user name
  - Pagination (50 entries per page)
- **Known Pitfalls:** None specific
- **Testing:** Rendering test with mock audit data. Filter test. Pagination test. Diff display test: verify before/after values shown correctly for updates.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P3-54 Performance Optimization
- **Phase:** 3
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/lib/performance/vitals-monitor.ts, apps/web/next.config.ts (update), apps/web/src/middleware.ts (update), component refactors for dynamic imports
- **Dependencies:** P3-45, P3-46, P3-47, P3-48
- **Blocks:** P4-63
- **Acceptance Criteria:**
  - LCP < 2.5s on dashboard pages
  - FID < 100ms
  - CLS < 0.1
  - JavaScript bundle < 200KB (first load)
  - Web Vitals reported to monitoring (Sentry or custom)
  - Heavy components lazy-loaded via `dynamic()` imports
- **Known Pitfalls:** None specific
- **Testing:** Web Vitals measurement test (can use Lighthouse CI). Bundle size test: verify main bundle under 200KB. Dynamic import test: verify lazy components not included in initial bundle.
- **Estimated Effort:** Large
- **Risk:** Medium — Performance targets may require significant refactoring of earlier code.

---

## Phase 4 Tasks

### Task: P4-55 Row-Level Security
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** packages/db/migrations/XXXX_add_rls_policies.sql, packages/db/src/schema/rls-config.ts, apps/web/__tests__/rls-validation.test.ts
- **Dependencies:** P0-06, P2-43
- **Blocks:** P4-56
- **Acceptance Criteria:**
  - RLS enabled on ALL tenant-scoped tables
  - SELECT policies: users can only read rows matching their community_id (derived from auth.uid() → user_roles → community_id)
  - INSERT policies: new rows automatically get community_id from user's context
  - UPDATE/DELETE policies: only allowed on own community's data
  - Audit logs: SELECT restricted to authorized canonical roles per ADR-001 matrix for own/managed communities
  - Service role bypasses RLS (for background jobs and migrations)
- **Known Pitfalls:**
  - [AGENTS #13] Defense-in-depth: RLS is the database-level complement to the scoped query builder. Both must enforce isolation.
- **Testing (CRITICAL — database-level security):**
  - For each table: connect as community A user → SELECT → verify zero community B rows
  - For each table: connect as community A user → INSERT with community B id → verify rejection
  - Audit log test: connect as tenant role → SELECT `compliance_audit_log` → verify rejection
  - Service role test: connect with service_role → verify RLS bypassed (can see all communities)
  - Policy coverage test: verify every tenant-scoped table has RLS enabled (query pg_tables for relrowsecurity)
- **Estimated Effort:** Large
- **Risk:** High — RLS policies must be correct. Misconfiguration either breaks the app (too restrictive) or leaks data (too permissive).

---

### Task: P4-56 Security Audit
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** docs/SECURITY_AUDIT.md, apps/web/src/middleware.ts (CORS, CSP headers), apps/web/src/lib/validation/zod-schemas.ts
- **Dependencies:** P4-55
- **Blocks:** P4-57
- **Acceptance Criteria:**
  - CORS configured: allow only known origins (production domain, subdomains)
  - CSP headers set: restrict script-src, style-src, img-src, connect-src
  - All user inputs validated via Zod schemas (no raw req.body usage)
  - All API responses sanitized (no stack traces, no internal IDs leaked to unauthorized users)
  - `npm audit` (or equivalent) shows zero critical/high vulnerabilities
  - Security audit document completed with findings and remediations
- **Known Pitfalls:** None specific
- **Testing:** CORS test: request from unauthorized origin → rejected. CSP test: verify headers present. Input validation test: send malformed JSON to each endpoint → verify 400 with structured error. Dependency scan: run `pnpm audit` and verify clean.
- **Estimated Effort:** Medium
- **Risk:** Medium

---

### Task: P4-57 RBAC Audit
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/lib/db/access-control.ts, apps/web/__tests__/rbac.test.ts, docs/RBAC_MATRIX.md
- **Dependencies:** P4-56, P1-25
- **Blocks:** P4-58
- **Acceptance Criteria:**
  - RBAC matrix fully documented: role (owner/tenant/board_member/board_president/cam/site_manager/property_manager_admin) × community_type (condo_718/hoa_720/apartment) × resource (documents/meetings/announcements/residents/settings/audit/compliance/maintenance/contracts) → permission (read/write/none) per ADR-001
  - `checkPermission(role, communityType, resource, action)` utility returns boolean
  - Unit test for EVERY cell in the RBAC matrix (no gaps)
  - Access control enforced at Route Handler level (not just UI conditional rendering)
- **Known Pitfalls:**
  - [AGENTS #36] Must have declarative policy matrix — not scattered if/else checks
  - [AGENTS #37] Enforce at DB query layer (WHERE clauses in Drizzle), not UI only. UI hides buttons; DB blocks queries.
- **Testing:** Matrix coverage test: generate test cases programmatically from the RBAC matrix → verify each combination. Negative test: for each "none" permission → verify 403 returned. Positive test: for each "read" or "write" permission → verify success. UI bypass test: call API directly without using UI → verify access control still enforced.
- **Estimated Effort:** Medium
- **Risk:** Medium — Combinatorial explosion (7 canonical roles × 3 types × 9 resources × 2 actions = 378 test cases per ADR-001). Automate test generation from the matrix.

---

### Task: P4-58 Integration Tests
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/__tests__/integration/signup-to-dashboard.test.ts, document-lifecycle.test.ts, compliance-flow.test.ts, role-isolation.test.ts, apps/web/__tests__/fixtures/community-fixtures.ts
- **Dependencies:** P4-57
- **Blocks:** P4-59
- **Acceptance Criteria:**
  - Full flow tests: signup → provision → login → upload document → check compliance → view dashboard
  - Document lifecycle: upload → extract text → search → download → delete (soft) → verify gone from search
  - Compliance flow: create community → auto-generate checklist → upload statutory doc → verify checklist item satisfied
  - Role isolation: board_president action succeeds → same action as tenant → rejected
  - Code coverage > 80% across apps/web/src/
- **Known Pitfalls:**
  - [AGENTS #38] Tests MUST exist before implementation is considered complete — this spec adds the comprehensive integration layer
  - [AGENTS #39] Never modify test assertions to make them pass — fix the implementation
- **Testing:** This IS the testing spec. Run full integration suite. Measure coverage. All tests must pass.
- **Estimated Effort:** Large
- **Risk:** Medium

---

### Task: P4-59 CI/CD Pipeline
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** .github/workflows/ci.yml, .github/workflows/deploy.yml, turbo.json (cache config update)
- **Dependencies:** P4-58
- **Blocks:** P4-60
- **Acceptance Criteria:**
  - CI runs on every PR: lint → typecheck → test → build (in that order, fail-fast)
  - Turbo remote cache enabled for faster builds
  - Staging deploy on merge to main branch
  - Branch protection: tests must pass before merge allowed
  - GitHub Actions uses Node 20 (matching .nvmrc)
- **Known Pitfalls:** None specific
- **Testing:** CI pipeline test: push a branch with a failing test → verify CI blocks merge. Cache test: run CI twice → verify second run is faster (cache hit).
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P4-60 Production Deployment
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** vercel.json, .env.example (document all required vars), docs/DEPLOYMENT.md
- **Dependencies:** P4-59
- **Blocks:** P4-62
- **Acceptance Criteria:**
  - Production deployment to Vercel successful
  - All environment variables configured in Vercel dashboard
  - Database migrations run successfully against production Supabase
  - Sentry monitoring active
  - Custom domain configured with wildcard subdomain (*.propertypro.com)
  - Rollback procedure documented and tested
- **Known Pitfalls:**
  - [AGENTS #21] Subdomain routing works differently in production vs development. Wildcard domain must be configured in Vercel.
- **Testing:** Smoke test: verify production site loads. Auth test: verify login works. Subdomain test: verify tenant resolution works with real subdomain. Monitoring test: trigger a test error, verify it appears in Sentry.
- **Estimated Effort:** Medium
- **Risk:** Medium — First production deploy always surfaces unexpected issues. DNS propagation for wildcard subdomain can take 24-48 hours.

---

### Task: P4-61 Demo Reset Script
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** scripts/reset-demo.ts, scripts/fixtures/demo-data.json, .github/workflows/reset-demo.yml (optional cron)
- **Dependencies:** P1-29, P2-44
- **Blocks:** None
- **Acceptance Criteria:**
  - Script deletes all user-created data while preserving schema and RLS policies
  - Demo data reseeded from fixtures
  - Idempotent: running twice produces same result
  - Optional: GitHub Actions cron runs nightly
- **Known Pitfalls:** None specific
- **Testing:** Reset test: create custom data → run reset → verify custom data gone + demo data present. Idempotency test: run reset twice → verify no errors.
- **Estimated Effort:** Small
- **Risk:** Low

---

### Task: P4-62 Load Testing
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** scripts/load-tests/k6-script.js, docs/LOAD_TEST_RESULTS.md
- **Dependencies:** P4-60
- **Blocks:** None
- **Acceptance Criteria:**
  - k6 scripts simulate 1000 concurrent users
  - Scenarios tested: signup flow, login, document upload, compliance dashboard query, search
  - P95 response time < 2s for all endpoints
  - No errors under sustained load (10 minutes)
  - Bottlenecks identified and documented with recommendations
- **Known Pitfalls:** None specific
- **Testing:** This IS the testing spec. Run k6 against staging/production and document results.
- **Estimated Effort:** Medium
- **Risk:** Low

---

### Task: P4-63 Accessibility Audit
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/__tests__/accessibility/axe-audit.test.ts, docs/ACCESSIBILITY.md
- **Dependencies:** P3-54
- **Blocks:** None
- **Acceptance Criteria:**
  - Automated axe-core tests pass on all pages (zero critical/serious violations)
  - WCAG 2.1 AA compliance verified
  - Keyboard navigation works throughout (Tab, Shift+Tab, Enter, Escape, Arrow keys)
  - Screen reader landmarks present (main, nav, complementary, banner)
  - Color contrast meets 4.5:1 ratio for text, 3:1 for large text
  - All form inputs have associated labels
  - All images have alt text
- **Known Pitfalls:** None specific
- **Testing:** Automated axe test for each page. Contrast ratio test. Keyboard navigation test for critical flows (login, document upload, compliance dashboard). ARIA landmark test.
- **Estimated Effort:** Medium
- **Risk:** Low

⚠️ **GATE 4: Pre-Deployment Verification** — After Phase 4 security tasks complete. See Quality Gates section.

---

### Task: P4-64 Data Export
- **Phase:** 4
- **Status:** Not Started
- **Files to Create/Modify:** apps/web/src/app/(authenticated)/export/page.tsx, apps/web/src/lib/api/export.ts, apps/web/src/lib/services/csv-generator.ts
- **Dependencies:** P0-06
- **Blocks:** None
- **Acceptance Criteria:**
  - Export entities: users, documents, audit logs, compliance items, meetings
  - Format options: CSV and JSON
  - Date range filtering
  - Export respects community_id scoping (only export own community's data)
  - Download as file (Content-Disposition: attachment)
- **Known Pitfalls:**
  - [AGENTS #13] Export queries must respect community_id scoping via scoped query builder
- **Testing:** Export test: seed data → export CSV → parse CSV → verify row count and content match. Scoping test: verify export from community A contains zero community B records. Date filter test. JSON export test.
- **Estimated Effort:** Small
- **Risk:** Low

---

## Blocked Tasks

No tasks are currently blocked by unmet *external* dependencies. Phase 0 closeout is complete and Phase 1 execution can proceed.

**Tasks blocked by Phase 0 completion (cannot start until Phase 0 is done):**

| Task | Blocked By | Reason |
|------|-----------|--------|
| P1-09 Compliance Engine | P0-05, P0-06, GATE 0 | Needs schema, scoped builder, and schema review |
| P1-11 Document Upload | P0-04, P0-06 | Needs Supabase storage and scoped builder |
| P1-16 Meeting Management | P0-05, P0-06, P1-09 | Needs schema, scoping, and compliance engine |
| P1-18 Resident Management | P0-04, P0-05, P0-06 | Needs auth, schema, and scoping |
| P1-22 Session Management | P0-04 | Needs Supabase auth |
| P1-27 Audit Logging | P0-05, P0-06 | Needs schema and scoping |
| P2-34 Stripe Integration | P2-33 → P2-31 → P0-03 | Long dependency chain |
| P4-55 RLS | P0-06, P2-43 | Needs scoped builder and isolation tests first |

---

## Stuck Tasks

**No stuck tasks identified.** This is a greenfield project with no prior implementation attempts in the codebase.

---

## Risk Register

### Critical Risk
| Risk | Spec(s) | Mitigation |
|------|---------|------------|
| Cross-tenant data leak | P0-06, P2-43, P4-55 | Three layers of defense: scoped query builder (P0-06), isolation tests (P2-43), RLS policies (P4-55). All three must be implemented. |
| Schema design error cascading | P0-05 | 17 specs depend on this schema. GATE 0 (schema review) is mandatory before proceeding. Run migrations on test database first. |

### High Risk
| Risk | Spec(s) | Mitigation |
|------|---------|------------|
| Auth in Server Components | P0-04, P1-22 | @supabase/ssr is required. Read AGENTS #1 carefully. Test session refresh exhaustively. |
| Stripe webhook reliability | P2-34 | Idempotent handlers, signature verification, fetch latest state from API. All 4 Stripe pitfalls apply. Test with Stripe CLI. |
| Compliance date calculations | P1-09 | DST transitions, leap years, weekends, Florida timezone split. Use date-fns exclusively. Mandatory edge case test suite (see P1-09 testing section). |
| Provisioning pipeline failure recovery | P2-35 | Multi-step process with external services. Idempotency keys required. Must handle partial failures with event-sourced tracking. |

### Medium Risk
| Risk | Spec(s) | Mitigation |
|------|---------|------------|
| Monorepo TypeScript configuration | P0-00 | transpilePackages, path aliases, workspace resolution. Known fiddly area. |
| Email deliverability | P1-20, P1-28 | SPF/DKIM/DMARC must be configured in Phase 1. Use Resend, not Supabase defaults. |
| Subdomain routing dev/prod gap | P1-23, P2-30 | Query param in dev, hostname in prod. Both patterns must be tested. |
| PDF text extraction memory | P1-13 | pdf-parse loads entire file into memory. Process asynchronously. Test with large files. |
| Access control matrix complexity | P1-25, P4-57 | role × community_type × document_category is 216+ combinations. Automate test generation from matrix. |

### Low Risk
| Risk | Spec(s) | Mitigation |
|------|---------|------------|
| Design system porting | P0-01 to P0-03 | Reference implementations exist. Mainly a translation exercise. |
| Legal pages | P2-32 | Content creation, not engineering. |
| Demo seed data | P1-29, P2-44 | Convenience scripts, not production-critical. |

---

## Dependency Graph

```
LEGEND: → = "must complete before"
        ═══ = critical path
        [G] = quality gate (must pass before continuing)

═══════════════════════════════════════════════════════════
PHASE 0: FOUNDATION
═══════════════════════════════════════════════════════════

P0-00 Monorepo Scaffold (ROOT - no dependencies)
  ║
  ╠══ P0-01 Design Tokens
  ║     ║
  ║     ╚══ P0-02 Core Primitives
  ║           ║
  ║           ╚══ P0-03 Priority Components ════════╗
  ║                                                  ║
  ╠══ P0-04 Supabase Setup                          ║
  ║     ║                                            ║
  ║     ╚══ P0-05 Drizzle Schema (17 dependents)    ║
  ║           ║                                      ║
  ║           ╚══ [GATE 0: Schema Review] ═══════════╬════╗
  ║                 ║                                ║    ║
  ║                 ╚══ P0-06 Scoped Query Builder ══╬════╬══╗
  ║                                                  ║    ║  ║
  ╠══ P0-07 Error Handling                           ║    ║  ║
  ║     ║                                            ║    ║  ║
  ║     ╚══ P0-08 Sentry Setup                      ║    ║  ║
  ║                                                  ║    ║  ║
  ╠══ P1-28 Email Infrastructure                     ║    ║  ║
  ╚══ P2-32 Legal Pages                              ║    ║  ║
                                                     ║    ║  ║
══════════════ [GATE 1: Foundation] ══════════════════╩════╩══╩═

═══════════════════════════════════════════════════════════
PHASE 1: COMPLIANCE CORE
═══════════════════════════════════════════════════════════

  P1-09 Compliance Engine (P0-05, P0-06)
    ║
    ╠══ P1-10 Compliance Dashboard UI (+ P0-03)
    ╚══ P1-16 Meeting Management (+ P0-05, P0-06)
         ║
         ╠══ P1-23 Public Website (+ P0-05, P0-03)
         ╚══ P1-24 Resident Portal (+ P0-03, P1-17)

  P1-11 Document Upload (P0-04, P0-06)
    ║
    ╠══ P1-12 Magic Bytes Validation
    ╠══ P1-13 Text Extraction (+ P0-05)
    ║     ║
    ║     ╚══ P1-14 Document Search (+ P0-06)
    ║           ║
    ║           ╚══ P1-15 Document Management UI (+ P1-11, P1-12, P0-03)
    ║                 ║
    ║                 ╚══ P1-25 Resident Document Library (+ P0-06)
    ║
    ╚══ P1-29 Demo Seed Data (+ P1-09, P1-10, P1-12)

  P1-17 Announcement System (P0-05, P0-06, P0-03)
  P1-18 Resident Management (P0-04, P0-05, P0-06)
    ║
    ╠══ P1-19 CSV Import
    ╠══ P1-20 Invitation Auth (+ P0-04)
    ╚══ P1-26 Notification Preferences (+ P0-05)

  P1-21 Password Reset (P0-04)
  P1-22 Session Management (P0-04)
  P1-27 Audit Logging (P0-05, P0-06)

══════════════ [GATE 2: Compliance Core] ═══════════════════

═══════════════════════════════════════════════════════════
PHASE 2: MULTI-TENANCY
═══════════════════════════════════════════════════════════

  P2-30 Subdomain Routing (P0-04, P0-06)
  P2-31 Marketing Landing (P0-03)
    ║
    ╚══ P2-33 Self-Service Signup (+ P0-04)
         ║
         ╚══ P2-34 Stripe Integration
              ║
              ╚══ P2-35 Provisioning Pipeline (+ P0-05, P0-06)
                   ║
                   ╠══ P2-38 Apartment Onboarding (+ P2-36, P2-37)
                   ╚══ P2-39 Condo Onboarding (+ P1-09)

  P2-36 Apartment Dashboard (P0-03, P0-05, P0-06)
  P2-37 Lease Tracking (P0-05, P0-06)
  P2-40 Community Features Config (P0-05)
  P2-41 Email Notifications (P1-28, P1-26)
  P2-42 Rate Limiting (P0-07)
  P2-43 Multi-Tenant Isolation Tests (P0-06, P2-30)
  P2-44 Apartment Demo Seed (P2-36, P2-37, P1-29)

══════════════ [GATE 3: Multi-Tenant] ═════════════════════

═══════════════════════════════════════════════════════════
PHASE 3: PM & MOBILE
═══════════════════════════════════════════════════════════

  P3-45 PM Portfolio Dashboard (P0-03, P0-06, P2-40)
    ║
    ╠══ P3-46 PM Community Switcher
    ╠══ P3-47 White-Label Branding (+ P0-05)
    ╚══ P3-54 Performance Optimization (+ P3-46, P3-47, P3-48)

  P3-48 Phone Frame Preview (P0-03, P1-24, P2-40)
    ║
    ╚══ P3-49 Mobile Layouts (+ P0-02, P0-03)

  P3-50 Maintenance Submission (P0-05, P0-06, P0-03)
    ║
    ╚══ P3-51 Maintenance Admin

  P3-52 Contract & Vendor Tracking (P0-05, P0-06)
  P3-53 Audit Trail Viewer (P1-27)

═══════════════════════════════════════════════════════════
PHASE 4: HARDENING
═══════════════════════════════════════════════════════════

  P4-55 Row-Level Security (P0-06, P2-43)
    ║
    ╚══ P4-56 Security Audit
         ║
         ╚══ P4-57 RBAC Audit (+ P1-25)
              ║
              ╚══ P4-58 Integration Tests
                   ║
                   ╚══ P4-59 CI/CD Pipeline
                        ║
                        ╚══ P4-60 Production Deployment
                             ║
                             ╚══ P4-62 Load Testing

  P4-61 Demo Reset Script (P1-29, P2-44)
  P4-63 Accessibility Audit (P3-54)
  P4-64 Data Export (P0-06)

══════════════ [GATE 4: Pre-Deployment] ═══════════════════
```

### Longest Dependency Chain (Critical Path to Production)
```
P0-00 → P0-04 → P0-05 → [GATE 0] → P0-06 → P2-30 → P2-43 → P4-55 → P4-56 → P4-57 → P4-58 → P4-59 → P4-60 → P4-62
(14 sequential steps from start to load testing, including schema review gate)
```

### Most-Depended-Upon Specs (Bottlenecks)
| Spec | Direct Dependents | Impact if Delayed |
|------|-------------------|-------------------|
| P0-05 Drizzle Schema | 17 specs | Blocks nearly everything in Phase 1+. GATE 0 exists to catch errors here. |
| P0-06 Scoped Query Builder | 19 specs | Blocks all data access in Phase 1+. Security-critical. |
| P0-03 Priority Components | 11 specs | Blocks all UI work in Phase 1+ |
| P0-04 Supabase Setup | 8 specs | Blocks auth and storage in Phase 1+ |
| P0-00 Monorepo Scaffold | 7 direct + all transitively | Blocks everything |

---

## Recommended Execution Order

Tasks are ordered by phase and dependency. No timeline estimates — work proceeds at whatever pace yields quality results. Quality gates are hard stops.

### Phase 0: Foundation
1. P0-00 Monorepo Scaffold
2. P0-04 Supabase Setup (can parallel with P0-01)
3. P0-01 Design Tokens (can parallel with P0-04)
4. P0-07 Error Handling (can parallel with P0-02)
5. P0-02 Core Primitives
6. P0-05 Drizzle Schema Core
7. **⚠️ GATE 0: Schema Review — STOP AND VERIFY**
8. P0-03 Priority Components (can parallel with P0-06)
9. P0-06 Scoped Query Builder
10. P0-08 Sentry Setup
11. **⚠️ GATE 1: Foundation Verification — STOP AND VERIFY**

### Phase 1: Compliance Core
12. P1-28 Email Infrastructure (light dependency, start early)
13. P1-09 Compliance Checklist Engine
14. P1-22 Session Management
15. P1-27 Audit Logging
16. P1-11 Document Upload Pipeline
17. P1-12 Magic Bytes Validation
18. P1-18 Resident Management
19. P1-13 Document Text Extraction
20. P1-10 Compliance Dashboard UI
21. P1-16 Meeting Management
22. P1-17 Announcement System
23. P1-14 Document Search
24. P1-21 Password Reset
25. P1-15 Document Management UI
26. P1-20 Invitation Auth Flow
27. P1-24 Resident Portal Dashboard
28. P1-25 Resident Document Library
29. P1-26 Notification Preferences
30. P1-19 CSV Import
31. P1-23 Public Website
32. P1-29 Demo Seed Data
33. **⚠️ GATE 2: Compliance Core Verification — STOP AND VERIFY**

### Phase 2: Multi-Tenancy
34. P2-30 Subdomain Routing Middleware
35. P2-31 Marketing Landing Page
36. P2-32 Legal Pages
37. P2-40 Community Features Config
38. P2-33 Self-Service Signup
39. P2-36 Apartment Operational Dashboard
40. P2-37 Lease Tracking
41. P2-34 Stripe Integration
42. P2-35 Provisioning Pipeline
43. P2-41 Email Notifications
44. P2-42 Rate Limiting
45. P2-38 Apartment Onboarding Wizard
46. P2-39 Condo Onboarding Wizard
47. P2-43 Multi-Tenant Isolation Tests
48. P2-44 Apartment Demo Seed
49. **⚠️ GATE 3: Multi-Tenant Verification — STOP AND VERIFY**

### Phase 3: PM & Mobile
50. P3-45 PM Portfolio Dashboard
51. P3-46 PM Community Switcher
52. P3-47 White-Label Branding
53. P3-48 Phone Frame Mobile Preview
54. P3-50 Maintenance Request Submission
55. P3-52 Contract & Vendor Tracking
56. P3-53 Audit Trail Viewer
57. P3-49 Mobile Layouts
58. P3-51 Maintenance Request Admin
59. P3-54 Performance Optimization

### Phase 4: Hardening & Deployment
60. P4-55 Row-Level Security
61. P4-56 Security Audit
62. P4-57 RBAC Audit
63. P4-58 Integration Tests
64. P4-64 Data Export
65. P4-61 Demo Reset Script
66. P4-59 CI/CD Pipeline
67. P4-60 Production Deployment
68. P4-62 Load Testing
69. P4-63 Accessibility Audit
70. **⚠️ GATE 4: Pre-Deployment Verification — STOP AND VERIFY**

---

*Plan generated by analyzing 65 specifications, 45 known pitfalls, and full codebase audit. Zero application code currently exists — this is a greenfield build. All architectural ambiguities have been resolved. Testing is integrated into every task, not deferred.*

# Portfolio Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an `operations_plus` PM save a community's branding (tokens + wordmark logo) as a named,
user-owned template and bulk-apply it across the communities they manage (one-time push).

**Architecture:** Six independently-shippable PRs. A user-owned `site_portfolio_templates` table +
shared capture/merge helpers + a reusable storage-copy helper land first (inert). Then the
service + CRUD routes, the bulk-apply route, and the PM UI. Branding writes reuse the existing
`createUnscopedClient` root-table pattern; logo copies reuse the presigned download→reupload pattern.

**Tech Stack:** Next 15 App Router · TypeScript · React 19 · Drizzle/Supabase · Vitest · Plan A1
(`defineRoute`/`runRoute`) · Supabase Storage (service-role admin client).

**Spec:** [docs/superpowers/specs/2026-06-04-portfolio-templates-design.md](../specs/2026-06-04-portfolio-templates-design.md)

**Reference before starting:** `.claude/rules/{api-patterns,tenant-isolation,migration-safety,design}.md`
and the custom-domain lineage memory (`session_2026_06_04_custom_domain_support.md`) for the
migration-snapshot, AUTHZ-comment, and component-guard traps.

---

## Cross-cutting conventions (every PR)

- Branch per PR off fresh main: `git fetch origin main --quiet && git checkout -b claude/<slug> origin/main`.
  After a squash-merge: `git checkout --detach` before the next branch.
- TDD: failing test → run → fail → minimal impl → green → commit.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- New `@propertypro/{shared,db}` exports → `pnpm --filter @propertypro/<pkg> build` before web resolves them.
- Final-verify gauntlet: affected `vitest`; `tsx scripts/verify-scoped-db-access.ts` + `verify-contracts.ts`;
  cache-free `pnpm --filter @propertypro/<pkg> exec tsc --noEmit`; `pnpm lint` when touching guards/migrations;
  real `pnpm --filter @propertypro/web build` when a client component or storage/edge code changes.
- Local-only failures to ignore (write tests, push, trust CI): `@propertypro/api-contract` "Failed to
  resolve entry" (build the pkg), DB-gated tests ("Missing DATABASE_URL").

---

## File structure (whole feature)

| File | PR | Responsibility |
|---|---|---|
| `packages/db/src/schema/site-portfolio-templates.ts` | 1 | Drizzle table (user-owned) |
| `packages/db/migrations/0013_site_portfolio_templates.sql` + `meta/0013_snapshot.json` + `_journal.json` | 1 | migration + RLS |
| `packages/shared/src/features/{plan-features,community-features}.ts` | 1 | enable flag on operations_plus / all types |
| `packages/shared/src/site/portfolio-template-branding.ts` | 2 | capture type + `extractTemplateBranding`/`mergeTemplateBranding` |
| `apps/web/src/lib/site-assets/copy-object.ts` | 3 | `copyStorageObject(bucket, fromPath, toPath)` |
| `apps/web/src/lib/services/site-portfolio-template-service.ts` | 4,5 | CRUD + apply orchestration (unscoped + AUTHZ) |
| `apps/web/src/app/api/v1/pm/portfolio/templates/{contract,route}.ts` | 4 | GET/POST/PATCH/DELETE |
| `apps/web/src/app/api/v1/pm/portfolio/templates/[id]/apply/{contract,route}.ts` | 5 | POST apply |
| `scripts/verify-scoped-db-access.ts` | 4 | allowlist the service for the unsafe import |
| `apps/web/src/hooks/use-portfolio-templates.ts` | 6 | react-query hooks |
| `apps/web/src/app/(authenticated)/pm/portfolio/templates/page.tsx` + components | 6 | UI |
| `apps/web/src/components/layout/nav-config.ts` | 6 | "Templates" nav entry |

---

## PR1 — Schema 0013 + flag enablement (inert)

**Branch:** `claude/portfolio-templates-1-schema`
- [ ] Drizzle table `site_portfolio_templates` in `packages/db/src/schema/site-portfolio-templates.ts`:
  `id` bigserial PK, `ownerUserId uuid('owner_user_id').notNull()`, `name text`, `branding jsonb`,
  `siteLogoPath text('site_logo_path')`, `createdAt`/`updatedAt` (notNull defaultNow), `deletedAt`.
  Register in the schema barrel.
- [ ] Hand-author `0013_site_portfolio_templates.sql`: CREATE TABLE + `ENABLE ROW LEVEL SECURITY` +
  4 RLS policies (`owner_user_id = auth.uid()` for select/insert/update/delete) — mirror
  `0011_user_preferences.sql` exactly.
- [ ] Run `drizzle-kit generate` (no DB needed) to produce `meta/0013_snapshot.json` + journal entry,
  rename the generated SQL to `0013_site_portfolio_templates.sql`, fix the journal `tag`. Confirm a
  second `drizzle-kit generate` reports "No schema changes". (Hand-authored-only fails migration-ordering CI.)
  > NOTE: drizzle-kit won't emit RLS — hand-append the `ENABLE ROW LEVEL SECURITY` + policies to the
  > generated SQL, then it's the authoritative file. The migration guard only needs `ENABLE ROW LEVEL SECURITY`.
- [ ] Enable `hasSitePortfolioTemplates: true` on `operations_plus` in `plan-features.ts` and on all 3
  types in `community-features.ts` (mirror how `hasSiteCustomCss`/`hasSiteCustomDomain` were enabled).
  Add a `getEffectiveFeatures` test: operations_plus → true; professional/essentials → false.
- [ ] Verify: `db:migrate` applies; `verify-scoped-db-access` RLS check clean; shared build + tests green.

## PR2 — Shared capture type + helpers

**Branch:** `claude/portfolio-templates-2-helpers`
- [ ] `packages/shared/src/site/portfolio-template-branding.ts`:
  - `PortfolioTemplateBranding` = Pick of `CommunityBranding` for the D2 token subset (NO logoPath,
    NO assetsBytesUsed) — note `siteLogoPath` is handled separately (template-owned copy), so the
    *branding jsonb* captured here excludes both logo paths; the logo lives in the row's `site_logo_path`.
  - `extractTemplateBranding(b: CommunityBranding): PortfolioTemplateBranding` — picks the token fields.
  - `mergeTemplateBranding(target: CommunityBranding, t: PortfolioTemplateBranding): CommunityBranding`
    — `{ ...target, ...t }` (captured tokens win; target's logoPath/assetsBytesUsed preserved).
  - Re-export from the shared barrel.
- [ ] Unit tests: extract drops logoPath/assetsBytesUsed; merge overrides only captured fields and
  preserves target-only fields. `pnpm --filter @propertypro/shared build`.

## PR3 — `copyStorageObject` helper

**Branch:** `claude/portfolio-templates-3-copy`
- [ ] `apps/web/src/lib/site-assets/copy-object.ts`: `copyStorageObject(bucket, fromPath, toPath): Promise<number>`
  — `createPresignedDownloadUrl` → fetch bytes → `createPresignedUploadUrl(..., {upsert:true})` → PUT;
  return byte length. Mirror the download/upload mechanics in `processAndStoreBrandingImage`
  (handle relative-vs-absolute signed URLs via `NEXT_PUBLIC_SUPABASE_URL`).
- [ ] Tests: mock `@propertypro/db` storage helpers + global `fetch`; assert download path, upload
  path+upsert, returned byte count, and a thrown error on a failed fetch.

## PR4 — Service + CRUD routes

**Branch:** `claude/portfolio-templates-4-crud`
- [ ] `site-portfolio-template-service.ts` (top-of-file AUTHZ docblock + `// AUTHZ:` line directly above
  the `@propertypro/db/unsafe` import; add the file to `WEB_UNSAFE_IMPORT_ALLOWLIST` in
  `scripts/verify-scoped-db-access.ts`):
  - `listTemplates(ownerUserId)`, `renameTemplate(ownerUserId, id, name)`,
  - `createFromCommunity(ownerUserId, communityId, name)` — read community branding via
    `getBrandingForCommunity`; `extractTemplateBranding`; INSERT row; if the community has a
    `siteLogoPath`, `copyStorageObject('documents', srcLogoPath, 'portfolio-templates/{id}/site-logo.webp')`
    and UPDATE the row's `site_logo_path`. (Authorize: caller must hold pm_admin in `communityId`.)
  - `deleteTemplate(ownerUserId, id)` — soft-delete (`deleted_at`); `deleteStorageObject` the template logo.
  - Every mutation `logAuditEvent` (`resourceType:'portfolio_template'`; add `portfolio_template_*`
    actions to the `AuditAction` union — TS union, no migration).
- [ ] A1 contracts + routes `GET/POST/PATCH/DELETE /api/v1/pm/portfolio/templates`. Gate (shared helper):
  `requireAuthenticatedUserId` → `isPmAdminInAnyCommunity` (403 if not) → assert the user holds
  `hasSitePortfolioTemplates` in ≥1 managed community (resolve managed set + `getEffectiveFeatures`).
  Single-object `{data}` envelopes.
- [ ] Route + service unit tests (mock service/storage/auth). Grep `vi.mock('@propertypro/db')` factories
  for any new export used by loaded test modules.

## PR5 — Bulk apply route

**Branch:** `claude/portfolio-templates-5-apply`
- [ ] Service `applyTemplate(ownerUserId, templateId, communityIds)`:
  - Load template (owner-scoped). Resolve managed set via `findManagedCommunitiesPortfolioUnscoped`;
    reject ids ∉ managed (ForbiddenError, listing the bad ids — mirror bulk/announcements).
  - `Promise.allSettled` per target: `mergeTemplateBranding(getBranding(target), template.branding)` →
    `updateBrandingForCommunity`; if template has a logo, `copyStorageObject('documents',
    templateLogoPath, 'communities/{target}/branding/site-logo.webp')` + set `siteLogoPath`;
    `logAuditEvent('portfolio_template_applied')`. Map to `{ communityId, communityName, status, reason? }`.
  - Return `{ results: [...] }`.
- [ ] `POST /api/v1/pm/portfolio/templates/[id]/apply` body `{ communityIds: number[] }`, same gate as PR4.
  `{data:{results}}` envelope (bulk shape).
- [ ] Tests: ids-not-managed → 403; happy path per-community results; one target failing leaves others
  applied (allSettled); logo-less template skips the copy.

## PR6 — PM templates UI

**Branch:** `claude/portfolio-templates-6-ui`
- [ ] `use-portfolio-templates.ts` hooks (mirror `use-custom-domain.ts`): list, create-from-community,
  rename, delete, apply. Canonical `{data}` envelope; raw fetch + `readJsonError`.
- [ ] `/pm/portfolio/templates/page.tsx` (server) gated by the user's effective feature; renders a
  `'use client'` templates list + "Save as template" (community picker) + apply flow (template select →
  community checkbox picker → confirm dialog naming what gets replaced → per-community result list).
  Design rules: status pills icon+text+color, EmptyState, loading Skeleton, error AlertBanner `role=alert`,
  focus rings. Client components import hooks + UI only (no server/db) — real `pnpm --filter @propertypro/web build`.
- [ ] Add the "Templates" entry to `PM_NAV_ITEMS` (`nav-config.ts`).
- [ ] Component tests (mock hooks). Manual smoke per the spec's verification.

---

## Self-review notes

- D1–D6 each map to a PR (ownership→PR1 table; capture→PR2/PR4; logo copy→PR3/PR4/PR5; one-time
  push→PR5; gating→PR1/PR4; live re-skin confirm→PR6).
- Known just-in-time confirmations: exact `getEffectiveFeatures`/managed-set gate composition (PR4);
  the audit `action` column is plain text (confirmed in custom-domain PR5); the `documents`-bucket
  logo path convention (PR3/PR4/PR5).

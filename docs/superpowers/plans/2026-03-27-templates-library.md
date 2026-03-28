# Templates Library — Implementation Plan

> **For agentic workers:** Use [$codex-superpowers](/Users/jphilistin/.codex/skills/codex-superpowers/SKILL.md) in `plan`, `execute`, and `review` modes. Implement this in small verified slices. Do not combine the schema migration and the demo-flow cutover until the library itself is working and at least one live template exists per community type.

**Goal:** Build a platform-admin Templates library for public site templates, with a gallery, draft/publish editor, server-backed preview, and demo-wizard integration. Public demo sites should read from per-community snapshots, while the global library becomes the canonical source for future template selection.

**Architecture:** Two-slice rollout.

1. Ship the global library, editor, preview pipeline, and platform-admin APIs.
2. After real live templates exist in the new library, cut the demo wizard and demo create/preview flows over from the code-backed registry to the database-backed library.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Supabase admin client, Drizzle ORM, Vitest, Sucrase, `react-dom/server`, `sanitize-html`

**Spec:** `docs/superpowers/specs/2026-03-27-templates-library-design.md`

---

## Locked Decisions

- `public_site_templates` is the runtime source of truth for public demo templates.
- There is no mobile template library. The tenant mobile view remains the existing tenant web app login experience.
- Preview and publish use the same server-side compile/sanitize pipeline.
- Demos remain snapshot-based. Creating a demo copies the selected published public template into the community's public `site_blocks` row.
- Later library edits do not mutate existing demos automatically.
- Platform-template data is platform-level and must use service-role/platform-admin access patterns, not scoped tenant DB helpers.
- Optimistic concurrency is required for draft save and publish.
- Slugs are stable identifiers created once. v1 does not expose slug editing.
- Do not keep the code-backed public template registry in the steady-state runtime path after cutover.
- Do not add version-history UI, rollback UI, usage explorer UI, or a mobile-template cleanup project to this feature.

## Release Strategy

### Slice A: Library Foundation

Ship the new table, service layer, APIs, and `/templates` UI without changing the demo wizard yet.

### Slice B: Demo Flow Cutover

After Slice A is verified and the library contains at least one live template per community type, switch demo preview/create to the DB-backed library and remove admin runtime dependencies on the old public-template registry.

This sequencing avoids hidden bootstrap logic, keeps rollout reversible, and prevents the demo wizard from depending on an empty library.

## Key Data Contracts

### `public_site_templates`

Use a platform-level table with a numeric primary key plus a stable unique slug.

- `id`
- `slug`
- `community_type`
- `sort_order`
- `name`
- `summary`
- `tags`
- `thumbnail_descriptor`
- `draft_jsx_source`
- `published_snapshot`
- `version`
- `published_payload_hash`
- `published_at`
- `published_by`
- `created_at`
- `updated_at`
- `archived_at`

Recommended `published_snapshot` shape:

- `name`
- `summary`
- `tags`
- `thumbnailDescriptor`
- `communityType`
- `jsxSource`
- `compiledHtml`
- `compiledAt`

### Demo Provenance

Persist global-template provenance in two places:

- `demo_instances.public_template_id`
- `demo_instances.public_template_version`

Also persist provenance in the snapshotted `site_blocks.content` payload:

- `templateProvenance.templateId`
- `templateProvenance.templateVersion`
- `templateProvenance.sourceHash`
- `templateProvenance.publishedAt`

### Preview Response

The transient preview endpoint should return:

- `html?: string`
- `errors?: Array<{ stage: 'compile' | 'runtime'; message: string; line?: number; column?: number; excerpt?: string }>`
- `compiledAt: string`

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `packages/db/src/schema/public-site-templates.ts` | Drizzle schema for the global public-template library |
| `packages/db/migrations/<next>_public_site_templates.sql` | Create `public_site_templates` and extend `demo_instances` |
| `apps/admin/src/lib/db/public-site-template-queries.ts` | Typed REST-wrapper queries for list/detail/save/publish/duplicate data access |
| `apps/admin/src/lib/templates/public-site-template-service.ts` | Lifecycle derivation, payload normalization, hashing, preview/publish orchestration |
| `apps/admin/src/lib/templates/template-scaffold.ts` | Server-owned default JSX scaffold and starter metadata defaults |
| `apps/admin/src/components/templates/TemplatesPageClient.tsx` | Gallery page client shell |
| `apps/admin/src/components/templates/TemplateGalleryToolbar.tsx` | Search, filters, result count, and primary action |
| `apps/admin/src/components/templates/TemplateGallery.tsx` | Template cards/list surface |
| `apps/admin/src/components/templates/TemplateEditorPage.tsx` | Editor screen composition |
| `apps/admin/src/components/templates/TemplateDetailsForm.tsx` | `Template details` section |
| `apps/admin/src/components/templates/TemplatePreviewPane.tsx` | Viewport presets, iframe preview, diagnostics, last-good-preview behavior |
| `apps/admin/src/components/templates/TemplateLifecycleBadge.tsx` | Shared lifecycle icon + text + color mapping for this feature |
| `apps/admin/src/app/templates/page.tsx` | Templates gallery route |
| `apps/admin/src/app/templates/loading.tsx` | Gallery loading state |
| `apps/admin/src/app/templates/[id]/page.tsx` | Template editor route |
| `apps/admin/src/app/templates/[id]/loading.tsx` | Editor loading state |
| `apps/admin/src/app/api/admin/templates/route.ts` | List + create templates |
| `apps/admin/src/app/api/admin/templates/[id]/route.ts` | Read + save draft |
| `apps/admin/src/app/api/admin/templates/[id]/publish/route.ts` | Publish route |
| `apps/admin/src/app/api/admin/templates/[id]/duplicate/route.ts` | Duplicate route |
| `apps/admin/src/app/api/admin/templates/preview/route.ts` | Server-backed preview compile route |
| `apps/admin/__tests__/public-site-template-service.test.ts` | Library service and lifecycle tests |
| `apps/admin/__tests__/api/admin/templates.test.ts` | Template API coverage |
| `apps/admin/__tests__/templates-ui.test.tsx` | Gallery/editor UI coverage |

### Modified Files
| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Export the new table |
| `packages/db/src/schema/demo-instances.ts` | Add template provenance columns |
| `packages/db/src/schema/rls-config.ts` | Add `public_site_templates` to global exclusions |
| `apps/admin/src/lib/site-template/compile-template.ts` | Reuse shared compile primitives for preview/publish parity |
| `apps/admin/src/components/Sidebar.tsx` | Add `Templates` nav item |
| `apps/admin/src/components/demo/ResizableSplit.tsx` | Bring splitter semantics up to spec |
| `apps/admin/src/app/api/admin/demos/preview/route.ts` | Cut over preview to DB-backed public templates and remove mobile payload |
| `apps/admin/src/app/api/admin/demos/route.ts` | Validate DB template selection, snapshot published template, stop mobile writes |
| `apps/admin/src/lib/db/demo-queries.ts` | Add template provenance fields to row type and helper writes |
| `apps/admin/src/app/demo/new/page.tsx` | Remove `mobileTemplateId`, fetch DB-backed public templates, update selection flow |
| `apps/admin/src/components/demo/BasicsStep.tsx` | Remove mobile-template config fields |
| `apps/admin/src/components/demo/PublicSiteStep.tsx` | Load and render DB-backed public templates |
| `apps/admin/src/components/demo/ReviewStep.tsx` | Reflect public-template-only model |
| `apps/admin/src/components/demo/TemplateCard.tsx` | Render v1 metadata from the library payload |
| `apps/admin/src/components/demo/PreviewPanel.tsx` | Consume public-only preview response |
| `apps/admin/src/components/demo/DemoListClient.tsx` | Keep mobile preview links framed as tenant-web preview, not template choice |
| `packages/shared/src/demo-templates/index.ts` and related files | Remove public-template runtime usage after cutover; delete only when fully unused |
| `apps/web/src/app/mobile/page.tsx` | No new template behavior; only touch if a targeted cleanup is proven safe |

---

## Task 1: Schema, Migration, and Platform Query Layer

**Files:**
- Create: `packages/db/src/schema/public-site-templates.ts`
- Modify: `packages/db/src/schema/demo-instances.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/rls-config.ts`
- Create: `packages/db/migrations/<next>_public_site_templates.sql`
- Create: `apps/admin/src/lib/db/public-site-template-queries.ts`

- [ ] Add `public_site_templates` as a platform-level table. Use the existing platform-table conventions from `access-plans`, `account-deletion-requests`, and `conversion-events`.
- [ ] Add `public_template_id` and `public_template_version` to `demo_instances`. Keep both nullable for backward compatibility.
- [ ] Store draft fields separately from the published snapshot so the editor can represent `Needs publish` cleanly without duplicate rows.
- [ ] Add `archived_at` now, but do not build archive UI in v1. List/detail queries should exclude archived rows.
- [ ] Add `public_site_templates` to `RLS_GLOBAL_TABLE_EXCLUSIONS`. Do not add it to tenant RLS lists.
- [ ] Build query helpers in `apps/admin/src/lib/db/public-site-template-queries.ts` that follow the current `demo-queries.ts` wrapper pattern and use `createAdminClient()`.
- [ ] Expose list/detail payloads with `lifecycleState`, `version`, `hasUnpublishedChanges`, `usageCount`, and `updatedAt`.
- [ ] Derive `usageCount` from `demo_instances.public_template_id`; do not store it in the template row.
- [ ] Create the migration with the next unique number greater than `0125`, then manually verify the journal ordering and `when` timestamp because the repo already has duplicate-number drift in the `0124` range.
- [ ] Run `pnpm --filter @propertypro/db db:migrate` before trusting any downstream test results.

## Task 2: Shared Template Service and Compile Parity

**Files:**
- Modify: `apps/admin/src/lib/site-template/compile-template.ts`
- Create: `apps/admin/src/lib/templates/public-site-template-service.ts`
- Create: `apps/admin/src/lib/templates/template-scaffold.ts`
- Create: `apps/admin/__tests__/public-site-template-service.test.ts`

- [ ] Keep `compileJsxToHtml()` as the shared low-level renderer unless a rename materially improves clarity. Do not create a second compiler.
- [ ] Move template-library-specific behavior into `apps/admin/src/lib/templates/public-site-template-service.ts`.
- [ ] Add helpers to normalize the publishable payload, derive lifecycle state, and hash the saved draft payload used for publish comparisons.
- [ ] Use SHA-256 over the normalized publishable draft payload to drive `published_current` vs `published_with_unpublished_changes`.
- [ ] Keep the authoring contract intentionally small. v1 supports JSX plus `PP_TEMPLATE.communityName`; branding continues to come from runtime CSS variables on the public site wrapper.
- [ ] Preview should compile with a placeholder `communityName` such as `Community Name`. Demo preview and demo creation should compile with the real prospect/community name.
- [ ] Return structured diagnostics for preview rather than raw thrown strings. Preserve last-good-preview behavior in the caller; do not bury UI state inside the service.
- [ ] Keep the server-owned default scaffold in `template-scaffold.ts`. Do not reuse the old code-backed registry as an ongoing runtime dependency.
- [ ] Strengthen sanitization coverage for disallowed tags, attributes, and protocols without drifting from the existing public render contract.

## Task 3: Platform Admin Template APIs

**Files:**
- Create: `apps/admin/src/app/api/admin/templates/route.ts`
- Create: `apps/admin/src/app/api/admin/templates/[id]/route.ts`
- Create: `apps/admin/src/app/api/admin/templates/[id]/publish/route.ts`
- Create: `apps/admin/src/app/api/admin/templates/[id]/duplicate/route.ts`
- Create: `apps/admin/src/app/api/admin/templates/preview/route.ts`

- [ ] `GET /api/admin/templates` returns list data for the gallery. Support `q`, `communityType`, and `lifecycle`. Keep v1 unpaginated unless performance proves otherwise.
- [ ] `POST /api/admin/templates` creates a new draft from the server-owned scaffold and a generated stable slug. v1 does not expose manual slug editing.
- [ ] `GET /api/admin/templates/:id` returns editable draft fields, publication metadata, lifecycle state, `usageCount`, and the concurrency token.
- [ ] `PUT /api/admin/templates/:id` saves draft changes with `expectedUpdatedAt`. Return `409` on stale writes.
- [ ] `POST /api/admin/templates/:id/publish` compiles the saved draft, updates the published snapshot, increments `version`, writes `publishedBy`, and refreshes the lifecycle state.
- [ ] `POST /api/admin/templates/:id/duplicate` creates a new draft named `Copy of {Template Name}` and returns the new template identity.
- [ ] `POST /api/admin/templates/preview` compiles arbitrary draft input through the same service used by publish. Return `200` with `html` and/or `errors`; use `400` only for malformed request payloads.
- [ ] Every route must use `requirePlatformAdmin()` and the service-role admin client patterns already used by the admin app.

## Task 4: Templates UI

**Files:**
- Create: `apps/admin/src/app/templates/page.tsx`
- Create: `apps/admin/src/app/templates/loading.tsx`
- Create: `apps/admin/src/app/templates/[id]/page.tsx`
- Create: `apps/admin/src/app/templates/[id]/loading.tsx`
- Create: `apps/admin/src/components/templates/*`
- Modify: `apps/admin/src/components/Sidebar.tsx`
- Modify: `apps/admin/src/components/demo/ResizableSplit.tsx`

- [ ] Add `Templates` to the admin sidebar after `Demos`.
- [ ] Build the gallery around the spec's fixed toolbar contract: search, community-type filter, lifecycle filter, result count, `Clear filters`, and `New Template`.
- [ ] Use design-system states instead of page-local placeholders: `Skeleton`, `EmptyState`, and `AlertBanner`.
- [ ] Build the editor as three stacked regions: page header, persistent publish-info banner, template details, and template workspace.
- [ ] Keep header actions fixed: primary `Publish`, secondary `Save Draft`, overflow `Duplicate`.
- [ ] Move metadata into `Template details`; do not overload the header.
- [ ] Keep the preview pane side-by-side with the code editor on desktop and stacked on narrow widths.
- [ ] Add preview viewport presets: `Desktop` 1440px, `Tablet` 768px, `Phone` 390px. Treat them as session-only UI state.
- [ ] Preserve the last successful preview when a later preview compile fails.
- [ ] Extend `ResizableSplit` to meet the spec's keyboard and WAI-ARIA expectations instead of creating a second splitter primitive.
- [ ] Keep lifecycle styling token-driven and shared inside the feature. Do not hand-roll color-only pills.
- [ ] Include the fixed publish helper copy in the info banner, the first-use empty state, and publish success feedback.

## Gate Between Slice A and Slice B

- [ ] Run targeted tests for schema helpers, the template service, template APIs, and templates UI.
- [ ] Manually create and publish at least one live public template per community type in dev/staging through the new UI.
- [ ] Verify gallery filtering, lifecycle state changes, preview parity, and `Used by N demos` rendering on real data.
- [ ] Do not cut the demo wizard over until the library has live templates available.

## Task 5: Demo Wizard and Demo Create/Preview Cutover

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx`
- Modify: `apps/admin/src/components/demo/BasicsStep.tsx`
- Modify: `apps/admin/src/components/demo/PublicSiteStep.tsx`
- Modify: `apps/admin/src/components/demo/ReviewStep.tsx`
- Modify: `apps/admin/src/components/demo/TemplateCard.tsx`
- Modify: `apps/admin/src/components/demo/PreviewPanel.tsx`
- Modify: `apps/admin/src/app/api/admin/demos/preview/route.ts`
- Modify: `apps/admin/src/app/api/admin/demos/route.ts`
- Modify: `apps/admin/src/lib/db/demo-queries.ts`

- [ ] Remove `mobileTemplateId` from wizard state, props, request payloads, and validation.
- [ ] Replace `packages/shared/src/demo-templates` reads with DB-backed template list/detail reads.
- [ ] Default wizard selection should be the first live template by `sortOrder` for the chosen community type.
- [ ] Update the preview route to validate the selected DB template, compile only the public template, and return a public-only preview response.
- [ ] Update the create-demo route to validate the selected DB template against the requested community type.
- [ ] Demo creation should compile the selected published JSX source with the real prospect/community name and snapshot the result into the community's public `site_blocks` row.
- [ ] Persist `public_template_id` and `public_template_version` on `demo_instances`.
- [ ] Include `templateProvenance` in the public `site_blocks.content` payload.
- [ ] Stop all new writes of `template_variant = 'mobile'`.
- [ ] Keep existing demo public rendering snapshot-based. Do not introduce a runtime dependency from the public site back to `public_site_templates`.

## Task 6: Legacy Registry Cleanup and Mobile Boundary Protection

**Files:**
- Modify or delete: `packages/shared/src/demo-templates/*`
- Modify: `apps/admin/src/components/demo/DemoListClient.tsx`
- Leave unchanged unless proven safe: `apps/web/src/app/mobile/page.tsx`

- [ ] Remove admin runtime dependencies on the old public-template registry after Slice B is complete.
- [ ] Delete public-template registry files and tests only after verifying no admin/demo code still imports them.
- [ ] Keep the admin `/demo/[id]/mobile` preview pages as previews of the existing tenant web/mobile experience. They are not part of the template library.
- [ ] Do not add new mobile-template reads, writes, or preview payloads anywhere in the new flow.
- [ ] Leave `apps/web/src/app/mobile/page.tsx` unchanged in this feature unless a targeted audit proves the legacy custom-mobile branch can be removed without affecting existing demos or previews.

## Task 7: Tests, Verification, and Rollout

**Files:**
- Modify: `apps/admin/__tests__/compile-template.test.ts`
- Create: `apps/admin/__tests__/public-site-template-service.test.ts`
- Create: `apps/admin/__tests__/api/admin/templates.test.ts`
- Create: `apps/admin/__tests__/templates-ui.test.tsx`
- Modify or delete: `packages/shared/src/__tests__/demo-templates.test.ts`

- [ ] Expand compile tests to cover the security matrix from the spec:
  - `<script>`
  - event-handler attributes
  - `javascript:` URLs
  - external `form` actions
  - `<iframe>`, `<object>`, and `<embed>`
  - SVG/MathML or any unsupported markup paths
  - oversized inputs and preview/publish parity
- [ ] Add service tests for lifecycle derivation, payload hashing, version bumps, structured diagnostics, and conflict handling.
- [ ] Add API tests for list/create/read/save/publish/duplicate/preview.
- [ ] Add UI tests for:
  - result counts
  - `Clear filters`
  - responsive action hierarchy
  - community-type read-only state after first publish
  - duplicate naming and name-field focus
  - viewport preset behavior
  - last-successful-preview persistence
  - live-region announcements
- [ ] Update demo-flow tests to cover the public-template-only model and the removal of `mobileTemplateId`.
- [ ] Remove or rewrite old registry tests once the registry is no longer part of the runtime path.
- [ ] Run the verification ladder in this order:
  - `pnpm --filter @propertypro/db db:migrate`
  - `pnpm lint`
  - `pnpm typecheck`
  - targeted `pnpm exec vitest` for new template-library tests
  - `pnpm test`
  - any focused integration coverage needed for demo snapshot behavior

## Manual QA Checklist

- [ ] Templates gallery loads with correct loading, empty, no-results, and error states.
- [ ] `Create Template` produces a usable draft scaffold.
- [ ] Draft save and publish follow the spec's lifecycle semantics: `Draft`, `Live`, `Needs publish`.
- [ ] Publish helper copy appears in the editor banner, first-use empty state, and publish success feedback.
- [ ] Preview remains stable while typing and preserves the last successful preview on compile failure.
- [ ] Viewport presets change preview width without mutating saved template data.
- [ ] Splitter works with mouse and keyboard and preserves focus-visible behavior.
- [ ] Demo wizard shows only public templates from the library.
- [ ] Creating a demo writes public template provenance and no longer writes a mobile template snapshot.
- [ ] Existing demos still render from their snapshotted public `site_blocks`.
- [ ] The tenant mobile login experience remains unchanged.

## Out of Scope

- No version-history explorer
- No rollback UI or restore API
- No template usage explorer
- No tenant/mobile template authoring surface
- No automatic migration of existing demo snapshots to new library versions
- No broad cleanup of legacy `/mobile` runtime behavior beyond blocking new mobile-template writes

## Exit Criteria

- `/templates` exists in the admin app and is fully functional for gallery, edit, save draft, preview, publish, and duplicate flows.
- The template library is backed by `public_site_templates`, not the code-backed registry.
- Demo preview and demo creation use published templates from the library.
- Demo creation snapshots the selected public template and records provenance.
- No new mobile-template data is created anywhere in the flow.
- Tests cover lifecycle, preview/publish parity, conflict handling, and the security matrix called out in the spec.

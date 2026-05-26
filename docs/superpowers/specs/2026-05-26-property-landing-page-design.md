# Property Landing Page — Design Spec

**Date:** 2026-05-26
**Status:** Draft
**Author:** Claude (brainstorming session)

---

## Overview

A managed compliance website system for PropertyPro communities. Each community gets a public-facing site at its subdomain (`[slug].getpropertypro.com`), auto-populated from the system of record (documents, meetings, announcements, contact info) and customizable by property managers within deliberate guardrails.

The system replaces a half-built mix of three competing implementations (a hardcoded `_site` page, an orphaned `(public)/[subdomain]` route, and a platform-admin-only JSX-source-to-HTML escape hatch) with a typed structured-block model that the existing `site_blocks` schema was originally designed for.

**Design goals:**

- A polished, Florida-residential aesthetic that anchors the "compliance website included" promise codex flagged from §718.111(12)(g) and §720.303.
- Self-serve site management for property managers (Essentials tier) without exposing layout/CSS authoring (cost & safety guardrail).
- A platform-admin catalog UI for managing layouts, theme presets, and starter packs — seamless CRUD with versioning, tier gating, and adoption metrics.
- Documentation as a first-class deliverable, in five surfaces.
- A vertical-slice rollout that matches the codebase's existing A1-drain cadence.

**Non-goals for v1** (explicit cuts to honor the "no significant expense" constraint):

- Drag-and-drop visual editor (forms + integer reorder controls only)
- Live preview iframe (Preview button opens subdomain in new tab with `?preview=draft`)
- Custom domain mapping (Pro+) — Phase 2
- A/B testing of layouts/presets — Phase 2
- Portfolio templates and bulk-apply (PM+) — Phase 2
- Visual diff of preset versions (text JSON diff only in v1)
- Photo cropping advanced features (basic JPG/PNG/WebP upload with required alt text only)

---

## Section 1: Tier Slicing & Product Framing

User-confirmed slicing: **Essentials editable, Pro = polish.**

| Surface                                     | Essentials ($199) | Professional ($349) | PM/Enterprise |
|---------------------------------------------|-------------------|---------------------|---------------|
| Subdomain (`[slug].getpropertypro.com`)     | ✓                 | ✓                   | ✓             |
| Branding (logo, hero image, theme preset)   | ✓                 | ✓                   | ✓             |
| Layout selection (Tidewater / Boulevard / Sable) | ✓            | ✓                   | ✓             |
| Content blocks: hero, text, image           | ✓                 | ✓                   | ✓             |
| SoR blocks: documents, meetings, announcements, contact | ✓     | ✓                   | ✓             |
| Section ordering + visibility               | ✓                 | ✓                   | ✓             |
| Draft / preview / publish workflow          | ✓                 | ✓                   | ✓             |
| Polish blocks: FAQ, gallery, amenities      | —                 | ✓                   | ✓             |
| Custom CSS variable overrides (within token boundaries) | —     | ✓                   | ✓             |
| Custom domain mapping                       | —                 | ✓ *(Phase 2)*       | ✓ *(Phase 2)* |
| Portfolio templates + bulk apply            | —                 | —                   | ✓ *(Phase 2)* |

Tier gating uses the existing `requirePlanFeature` runtime gate against `packages/shared/src/features/plan-features.ts`. New feature flags added in v1: `site_editor`, `site_polish_blocks`, `site_custom_css`. Phase 2 flags: `site_custom_domain`, `site_portfolio_templates`.

---

## Section 2: Architecture

### 2.1 Canonical Render Path

`apps/web/src/app/_site/page.tsx` remains canonical. Middleware at `apps/web/src/middleware.ts:678` already rewrites unauthenticated subdomain traffic to `/_site` — this stays.

**Retired in PR #9:**

- `apps/web/src/app/(public)/[subdomain]/page.tsx` — orphaned route, no traffic in the current setup.
- `apps/web/src/app/mobile/page.tsx` — migrated to the block model with a responsive render (no separate template variant). The `template_variant` column on `site_blocks` is dropped in PR #9's migration.
- `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts` and its sibling endpoints.
- `apps/web/src/lib/api/site-template.ts` and the `dangerouslySetInnerHTML` + Tailwind-CDN render path in `_site/page.tsx`.
- The four admin tests for compile-template / public-site-template-queries / public-site-template-service.
- The `jsx_template` block type removed from the CHECK constraint in a migration.

**Migrated:**

- The useful structural elements of the orphaned `apps/web/src/components/public/public-home.tsx` and `public-notices.tsx` get folded into the new block renderers (specifically the `announcements` SoR block in PR #3 and the `documents` SoR block in PR #4).

### 2.2 Block Model

The schema `site_blocks` table at `packages/db/src/schema/site-blocks.ts` already defines the shape: `(id, community_id, block_order, block_type, content jsonb, is_draft, template_variant, published_at, deleted_at)` with a unique constraint on `(community_id, block_order, is_draft, template_variant)`.

**Block types in v1** (CHECK constraint updated in PR #1's migration):

| Block type      | Category | Tier         | Renderer reads from         |
|-----------------|----------|--------------|-----------------------------|
| `hero`          | content  | Essentials   | `content` jsonb             |
| `text`          | content  | Essentials   | `content` jsonb             |
| `image`         | content  | Essentials   | `content` jsonb + Storage   |
| `documents`     | SoR      | Essentials   | `documents` table at render |
| `meetings`      | SoR      | Essentials   | `meetings` table at render  |
| `announcements` | SoR      | Essentials   | `announcements` at render   |
| `contact`       | SoR      | Essentials   | `communities` + board rows  |

**Block types in v1.5 (PR #10, gated to Pro+):**

| Block type      | Category | Tier         | Renderer reads from         |
|-----------------|----------|--------------|-----------------------------|
| `faq`           | content  | Professional | `content` jsonb             |
| `gallery`       | content  | Professional | `content` jsonb + Storage   |
| `amenities`     | content  | Professional | `content` jsonb             |

**Block schemas live in `packages/shared/src/site-blocks/`**, one file per type. Each exports a Zod schema typed as `ZodSchema<BlockTypeContent>`:

```
packages/shared/src/site-blocks/
  hero.ts         → heroBlockSchema
  text.ts         → textBlockSchema
  image.ts        → imageBlockSchema
  documents.ts    → documentsBlockSchema
  meetings.ts     → meetingsBlockSchema
  announcements.ts → announcementsBlockSchema
  contact.ts      → contactBlockSchema
  index.ts        → blockSchemaRegistry: Record<BlockType, ZodSchema>
```

A block row's `content` jsonb is validated against the matching schema at read time (via `safeParse`); invalid blocks are skipped from render and logged to Sentry with `community_id` + `block_id` for ops triage.

### 2.3 Renderer Registry

```
apps/web/src/components/public-site/blocks/
  HeroBlock.tsx
  TextBlock.tsx
  ImageBlock.tsx
  DocumentsBlock.tsx
  MeetingsBlock.tsx
  AnnouncementsBlock.tsx
  ContactBlock.tsx
  registry.ts        → blockRendererRegistry: Record<BlockType, FC<BlockRendererProps>>
```

Each block renderer is a server component receiving:

```ts
interface BlockRendererProps<T> {
  block: { id: number; content: T; blockOrder: number };
  community: PublicCommunity;     // immutable read-only community info
  theme: ResolvedTheme;            // tokens from packages/theme
  layout: LayoutId;                // 'tidewater' | 'boulevard' | 'sable'
}
```

SoR blocks (Documents/Meetings/Announcements/Contact) perform their own scoped reads at render via `createScopedClient(community.id)` — no client-side fetching, no data sync.

Client islands are forbidden except where genuine interactivity is required (e.g., a future calendar widget in `MeetingsBlock`). All v1 renderers are server components.

### 2.4 Layout System

```
apps/web/src/components/public-site/layouts/
  Tidewater.tsx
  Boulevard.tsx
  Sable.tsx
  registry.ts        → layoutRegistry: Record<LayoutId, FC<LayoutProps>>
  README.md          → engineer onboarding doc
```

A layout component:

- Owns the page chrome: header, footer, hero treatment, section spacing, typography rhythm.
- Receives the ordered list of blocks and the theme.
- Renders each block via the block registry, optionally wrapping with layout-specific section chrome (e.g., the Tidewater layout wraps each block in a thin-hairline-ruled container; the Boulevard layout uses numbered sections).
- Cannot be authored by customers. Adding a new layout = code + PR + docs entry.

Layout props:

```ts
interface LayoutProps {
  community: PublicCommunity;
  theme: ResolvedTheme;
  blocks: SiteBlock[];
}
```

The `_site/page.tsx` resolves the layout id from `communities.site_settings.layoutId` (new column — see Section 3.1), then defers entirely to the layout component. The page itself becomes ~30 lines.

### 2.5 Theme Presets

A new table `site_theme_presets` stores platform-level theme bundles:

```
site_theme_presets
  id           bigserial primary key
  slug         text unique not null    -- 'bay-light', 'midnight-coast', etc.
  display_name text not null
  description  text
  tokens       jsonb not null          -- { primaryColor, secondaryColor, accentColor, headingFont, bodyFont, ... }
  tier         text not null default 'essentials'  -- 'essentials' | 'professional' | 'pm'
  is_archived  boolean default false
  is_featured  boolean default false
  version      integer not null default 1
  created_at   timestamptz default now()
  updated_at   timestamptz default now()
```

No `community_id` — these are platform-level. Writes happen only through `apps/admin/`. Reads from the web app are unscoped (`createUnscopedClient()` with a documented authorization contract per the tenant-isolation rule).

Six presets ship in v1, extending `packages/theme/src/presets.ts`:

| Slug              | Theme                                              | Tier         |
|-------------------|----------------------------------------------------|--------------|
| `bay-light`       | Tidewater default — warm ivory, mineral teal       | Essentials   |
| `midnight-coast`  | Deep navy + sunlit ochre + seafoam                 | Essentials   |
| `palm-shadow`     | Cream paper + midnight + seafoam (Boulevard fit)   | Essentials   |
| `linen-bronze`    | Linen + oxidized bronze (Sable fit)                | Essentials   |
| `gulf-warm`       | Warm sand + terracotta + deep teal                 | Essentials   |
| `noir-coastal`    | Charcoal-warm + pale stone + brass accent          | Essentials   |

The community-level reference lives in `communities.site_settings.themePresetSlug` (text column).

### 2.6 Starter Packs

A new table `site_starter_packs` stores platform-level block-seed bundles:

```
site_starter_packs
  id             bigserial primary key
  slug           text unique not null     -- 'florida-condo-v1', 'florida-hoa-v1', 'apartment-v1'
  display_name   text not null
  community_type text not null            -- 'condo_718' | 'hoa_720' | 'apartment'
  description    text
  blocks         jsonb not null           -- array of { blockType, blockOrder, content }
  version        integer not null default 1
  is_archived    boolean default false
  created_at     timestamptz default now()
  updated_at     timestamptz default now()
```

Three starter packs ship in v1 (one per community type). The starter pack is applied during onboarding by inserting one `site_blocks` row per entry, with `is_draft=true` (the PM publishes them as part of the onboarding flow).

Versioning matters: rolling out `florida-condo-v2` doesn't disturb communities that adopted v1 — `site_blocks` rows are owned by the community after insertion. The starter pack is a one-time seed, not a live template.

### 2.7 Draft / Preview / Publish Workflow

**Atomic community-wide publish.** Honors the existing schema design:

1. PM edits trigger draft rows: `(community_id, block_order, is_draft=true, template_variant='public')`. Uniqueness enforced by the existing constraint.
2. "Preview Draft" button opens `https://[slug].getpropertypro.com/?preview=draft&token=<HMAC>` in a new tab. Middleware honors the token (5-minute TTL signed with `SUPABASE_AUTH_JWT_SECRET`) and renders draft blocks instead of published blocks. No new auth surface — token is reused from the existing preview-link pattern in demo routes.
3. "Publish Website" button atomically (in a single transaction):
   - Soft-deletes the currently-published block set (`UPDATE ... SET deleted_at=now() WHERE is_draft=false AND deleted_at IS NULL`).
   - Promotes draft blocks: `UPDATE ... SET is_draft=false, published_at=now() WHERE is_draft=true`.
   - Writes one `compliance_audit_log` row (action: `site_publish`).
4. Soft-deleted previous-published rows retained for 30 days, then hard-deleted by a daily lifecycle cron (extends the existing `internal/account-lifecycle` cron).

No per-block draft state. No partial publishes. The simplicity is intentional.

### 2.8 Image Handling

- Supabase Storage (already in stack). New bucket: `community-site-assets`. RLS enforces `community_id` in the path prefix.
- Cropping UI: `react-image-crop` (~30KB, MIT, zero deps) in the editor.
- Server-side transformation: `sharp` (already a transitive dep of Next.js image optimization). New API route `POST /api/v1/site/images` accepts the original + crop coordinates, stores three sizes (`original`, `1600w`, `800w`) and returns a Supabase Storage URL plus alt-text-required form.
- Validation at upload: max 5MB, accept `image/jpeg | image/png | image/webp`. Reject SVG (XSS vector), GIF (perceptual problem on hero blocks), HEIC (not universally supported by `sharp`).
- Alt text is a required field at the API boundary. The schema for `image` and `hero` blocks marks `altText` as required. Empty alt is allowed only when the block schema explicitly declares the image as decorative (e.g., a hero-overlay-graphic field).

---

## Section 3: Data Model Changes

### 3.1 New columns on `communities`

A new jsonb column or a small new table for site settings, depending on review preference. **Recommendation: extend `communities.branding` jsonb** to avoid migration sprawl:

```
communities.branding (jsonb)
  // existing keys preserved
  primaryColor       string?
  secondaryColor     string?
  logoPath           string?

  // new keys (PR #1)
  layoutId           'tidewater' | 'boulevard' | 'sable' | null  // null = use default
  themePresetSlug    string | null                                // FK-like ref to site_theme_presets.slug
  heroImagePath      string | null                                // Supabase Storage path
  customCssOverrides { primaryColor?, accentColor?, ... } | null  // Pro+ only; gated at write
  publishedAt        ISO-8601 string | null                       // last published timestamp (denormalized for fast read)
```

The `branding` column is already in the schema at `packages/db/src/schema/communities.ts:26`.

Defaults when no overrides exist:

- `layoutId`: derived from `community_type` (`condo_718` → `tidewater`, `hoa_720` → `boulevard`, `apartment` → `sable`). All three layouts are available at all tiers; defaults are suggestions, the PM can pick any layout during onboarding.
- `themePresetSlug`: derived from `layoutId` (each layout has a default preset).

### 3.2 New tables

- `site_theme_presets` (see Section 2.5)
- `site_starter_packs` (see Section 2.6)
- `site_layout_metadata` — platform-level catalog of layouts. Code-shipped layouts have a row here for admin metadata (display name, tagline, tier, is_archived, default_preset_slug, featured_in_onboarding). PR #1 seeds three rows; PR #7 adds admin CRUD on the metadata fields (not on the layout code itself).

```
site_layout_metadata
  id                     bigserial primary key
  slug                   text unique not null  -- 'tidewater' | 'boulevard' | 'sable'
  display_name           text not null
  tagline                text
  description            text
  tier                   text not null default 'essentials'
  is_archived            boolean default false
  is_featured            boolean default true
  default_preset_slug    text references site_theme_presets(slug)
  version                text not null            -- 'v1.2.0' — purely for display; bumped manually when layout code changes
  created_at             timestamptz default now()
  updated_at             timestamptz default now()
```

No `community_id` on any of the three new tables. All platform-level; admin-only writes.

### 3.3 Migration timing

- **PR #1 migration**: Add three new platform tables; extend the `block_type` CHECK constraint on `site_blocks` to include the new types; seed `site_layout_metadata` rows + initial six presets via INSERT. Migration number: next sequential (currently 0037+ on the main branch; coordinate with `meta/_journal.json`).
- **PR #9 migration**: Drop `template_variant` column from `site_blocks` (`mobile` variant retired in favor of responsive layouts); remove `jsx_template` from the CHECK constraint.

All migrations follow the rules in `.claude/rules/migration-safety.md` — including the write-scope trigger for new tenant-scoped tables (none of the three new tables are tenant-scoped, so the trigger is N/A; this is documented in the migration's header comment).

---

## Section 4: PM-Facing Surfaces

### 4.1 Onboarding Wizard

Route: `apps/web/src/app/(authenticated)/pm/onboarding/website/` (5 steps).

| Step | Title                          | Inputs                                                            |
|------|--------------------------------|-------------------------------------------------------------------|
| 1    | Pick a layout                  | Radio-card picker of 3 layouts with thumbnails + descriptions     |
| 2    | Pick a color/font mood         | Six preset cards showing a mini-preview of the layout applied     |
| 3    | Add your identity              | Logo upload (with crop), community name (pre-filled), tagline, hero image upload (with crop) |
| 4    | Welcome message                | Single rich-text-but-typed field for hero body copy               |
| 5    | Confirm content sections       | Checklist of SoR blocks with per-block "Configure" expand         |

A starter pack (selected by `community_type`) is applied between Step 1 and Step 2 — populating the block list with sensible defaults. Steps 3–5 modify those drafts. Step 5's "Publish" button performs the atomic-publish workflow (Section 2.7).

State persists between steps via a `site_onboarding_progress` jsonb on `communities` (so a PM can leave and return). Onboarding can be re-run via "Reset to starter" in the admin panel (admin-only action, gated to platform admin role).

### 4.2 Ongoing Editor

Route: `apps/web/src/app/(authenticated)/pm/settings/website/?communityId=X` (per-community, matching the existing `pm/settings/branding/?communityId=X` access pattern). The existing branding-only page is preserved through PR #8, then in PR #9 the `pm/settings/branding/` route is converted to a permanent redirect to `pm/settings/website/?communityId=X#branding` (anchor scrolls to the Branding tab). PM nav entries updated in PR #8 to point at the new route.

Five left-rail tabs mirroring the wizard step structure:

1. **Layout & Theme** — re-select layout, re-select preset, edit custom CSS overrides (Pro+).
2. **Branding** — logo, hero image, accent color overrides.
3. **Welcome** — hero block content (headline, body, CTA text).
4. **Content Sections** — list of all blocks in order. Per-block: ↑/↓ reorder, visibility toggle (`isDraft=true, content.visible=false`), "Edit" → opens per-block form.
5. **Custom Pages** (Pro+) — FAQ, Gallery, Amenities pages.

Top of every tab:

- "Last published: 2 hours ago by Sarah Chen" + "View Site" link.
- Floating bar appears when any draft block diverges from the published set: "You have unpublished changes" + "Preview Draft" + "Publish".

### 4.3 Tier Gating

- `site_editor`: granted to Essentials + above. Read access to `/pm/settings/website/` and `/pm/onboarding/website/`.
- `site_polish_blocks`: granted to Pro + above. Unlocks FAQ, Gallery, Amenities in the editor and Custom Pages tab.
- `site_custom_css`: granted to Pro + above. Unlocks the custom CSS overrides field on Layout & Theme tab.
- `site_custom_domain`: granted to Pro + above. **Phase 2** — not in v1.
- `site_portfolio_templates`: granted to PM/Enterprise. **Phase 2** — not in v1.

Each gate enforced via `requirePlanFeature(communityId, 'site_xxx')` at the route handler level and via conditional rendering at the component level (so disabled tabs are visible but locked, not hidden — supports upsell messaging).

---

## Section 5: Platform Admin Surfaces (`apps/admin/`)

Route tree: `apps/admin/src/app/site-templates/`.

### 5.1 Index — Layouts catalog

`/admin/site-templates/` (defaults to the Layouts tab). Table of three rows. Per-row: thumbnail, name + slug + version, status pill, tier badge, adoption count, last updated, ⋯ action menu. Selecting a row opens the right-side inspector with editable metadata + preview + documentation link + actions (Preview live, Save metadata, Disable). Inline-editable fields use dashed-underline visual treatment.

### 5.2 Theme Presets

`/admin/site-templates/theme-presets/` — full CRUD table. Form fields: slug, display name, description, tokens (color pickers + font dropdowns), tier, featured flag. Save creates a new version (immutable history); rollback restores a prior version. Adoption count visible per preset.

### 5.3 Starter Packs

`/admin/site-templates/starter-packs/` — full CRUD table. Editor is a structured-form-per-block-type interface, same forms used in the PM editor. Versioning is explicit ("Save as new version" creates `florida-condo-v2`; existing communities continue to be tied to their installed version). Per-community-type filtering.

### 5.4 Block Registry (read-only)

`/admin/site-templates/block-registry/` — reference page listing each supported block type, its Zod schema (rendered as a tree), its renderer file path, its tier, its documentation link. No write actions; informational only.

### 5.5 Documentation Tab

`/admin/site-templates/documentation/` — surfaces the three engineering documentation hubs as linked cards: design-system docs (templates + blocks), engineer README (layout authoring), PM-facing help articles (in the existing MDX help center per `project_help_center_already_exists.md`).

### 5.6 Admin API Routes

All under `apps/admin/src/app/api/admin/site-templates/`:

- `GET /layouts` — list with metadata
- `PATCH /layouts/[slug]` — update metadata fields (display_name, tagline, tier, is_archived, is_featured)
- `POST /layouts/[slug]/preview` — generate a preview URL bound to a specific community
- `GET/POST/PATCH/DELETE /theme-presets[/id]` — full CRUD
- `GET/POST/PATCH/DELETE /starter-packs[/id]` — full CRUD
- `POST /communities/[id]/reset-to-starter` — apply a starter pack to an existing community (admin-only escape hatch)

All routes follow the canonical pagination contract for list endpoints (`.claude/rules/api-patterns.md`).

---

## Section 6: Documentation Deliverables

Five surfaces, none optional in v1:

| Surface                                                | Audience          | Format                          | Lands in           |
|--------------------------------------------------------|-------------------|---------------------------------|--------------------|
| `docs/design-system/templates/{tidewater,boulevard,sable}.md` | Designers + engineers | Markdown — design intent, tokens consumed, accessibility constraints, photographic guidance, when to recommend | Each layout's PR   |
| `apps/web/src/components/public-site/layouts/README.md` | Engineers          | Markdown — how to add a new layout, registry pattern, testing requirements | PR #1 + updated per layout |
| `docs/design-system/blocks/{hero,text,image,documents,meetings,announcements,contact}.md` | Designers + engineers | Markdown — Zod schema, renderer props, editor form fields, tier gating | Each block's PR    |
| Help center MDX articles in `apps/web/src/content/help/website/` | Property managers | MDX — Choosing a layout, Customizing your theme, Adding content blocks, Publishing changes | PR #5 alongside the wizard |
| Inline help text on each admin panel page              | Platform admin (you) | React component with contextual one-liners + tooltip-expanded details | Each admin-panel PR |

The MDX help articles use the existing help center system (per memory: `project_help_center_already_exists.md` — substantial MDX-based system across PRs #98 → #219). No new docs infrastructure.

---

## Section 7: Tenant Isolation

Per `.claude/rules/tenant-isolation.md`:

- **Community-scoped reads** (`site_blocks`, `communities`, `documents`, `meetings`, `announcements`, contact data) — go through `createScopedClient(communityId)` from the block renderers. The community is passed in as a prop from the layout component; the layout receives it from `_site/page.tsx` which extracts community_id from the middleware-injected `x-community-id` header.
- **Platform-level reads** (`site_theme_presets`, `site_starter_packs`, `site_layout_metadata`) — `createUnscopedClient()` with a documented authorization contract in the file header. These are read-only on the web app; writes happen only in `apps/admin/` under platform-admin auth.
- **Public-context special case** — the `_site` route runs unauthenticated. Community resolution from header is the authoritative tenant key. No session, no RLS bypass; reads use `createUnscopedClient()` filtered by `community_id` in the WHERE clause, with the same authorization-contract docstring used at `apps/web/src/lib/api/site-template.ts:6` today. PR #1 establishes a shared helper `getPublicCommunityScopedReader(communityId)` to consolidate this pattern.

Every new table is reviewed against the CI guard (`pnpm guard:db-access`). None of the three new platform-level tables need RLS — they are deliberately not tenant-scoped — but the migration's header documents this and references this spec.

---

## Section 8: Testing & Observability

### 8.1 Test Coverage

- **Block schema tests** — for each block type, exhaustive `safeParse` cases covering valid input, all required-field-missing variants, all type-mismatch variants. Land alongside each block's PR.
- **Renderer registry tests** — confirms every `BlockType` enum value has an entry in `blockRendererRegistry`, statically (via a TypeScript `satisfies` constraint at registry definition) and at runtime (a registry-completeness test in PR #1).
- **Layout integration tests** — render each layout with a known seeded block set, snapshot the resulting HTML structure (not pixels). Land alongside each layout's PR.
- **Onboarding wizard integration test** — full flow happy path, plus the "PM leaves at step 3 and returns" case. PR #5.
- **Publish workflow integration test** — atomic publish + concurrent edit (last-write-wins on draft rows; no merge logic needed). PR #8.
- **Admin panel route tests** — list + CRUD + tier gating + audit log writes. PR #6, #7.
- **Visual regression** — out of scope for v1. Snapshot tests handle structural changes; visual regression is a Phase 2 add (Chromatic or Playwright screenshot diffs).

### 8.2 Observability

- **Sentry events** for: site publish failures, block schema validation failures (with `community_id` + `block_id`), image upload failures, custom CSS injection-attempt detections (Pro+).
- **Audit log writes** to `compliance_audit_log`: `site_publish`, `site_layout_changed`, `site_preset_changed`, `site_block_visibility_changed`. Existing audit log writer in `apps/web/src/lib/audit/`.
- **Adoption metrics** queryable from `apps/admin/` (existing `apps/admin/src/app/api/admin/metrics/` pattern): communities by layout, communities by preset, average blocks per community, % of communities with custom CSS.

---

## Section 9: PR Sequencing (Approach C — Vertical-Slice-First)

Estimated total: ~42 engineering days for v1 + v1.5 (Pro+ polish blocks). One engineer ≈ 8 weeks; two in parallel ≈ 4 weeks.

| #  | Title                                           | Effort | Scope |
|----|-------------------------------------------------|--------|-------|
| 1  | Foundation + Hero vertical slice                | ~5d    | Renderer registry, layout registry, hero block schema/renderer/editor form, Tidewater layout shipped, migration for new platform tables + extended CHECK, replaces hardcoded hero in `_site`, behind per-community feature flag. Documentation: blocks/hero.md, layouts README, tidewater.md. |
| 2  | Text & Image content blocks                     | ~3d    | Two block types in parallel. Reuses PR #1's registry + editor patterns. Storage bucket + image upload route. Documentation: blocks/text.md, blocks/image.md. |
| 3  | Announcements SoR block                         | ~3d    | First SoR block — establishes the pattern (config-only block, server-side fetch at render). Folds in the orphaned PublicNotices component logic. Documentation: blocks/announcements.md. |
| 4  | Documents + Meetings + Contact SoR blocks       | ~5d    | Three SoR blocks in a parallel-3 batch (matches the A1 drain cadence). Documentation for each. |
| 5  | Onboarding wizard + starter packs               | ~5d    | 5-step wizard. Three starter packs (one per community type). Help center MDX articles. Lives at `/pm/onboarding/website/`. |
| 6  | Theme preset CRUD admin panel                   | ~3d    | `/admin/site-templates/theme-presets/`. Six v1 presets seeded. |
| 7  | Layouts admin panel + Boulevard & Sable layouts | ~6d    | Admin metadata-editing panel for layouts, plus the two remaining layouts shipped as code. Documentation: boulevard.md, sable.md. |
| 8  | Reorder + publish workflow                      | ~3d    | Per-block ↑/↓ controls, "Publish website" button, draft/published soft-delete, preview-token middleware support. |
| 9  | Retirement PR                                   | ~2d    | Remove `jsx_template` flow, retire `(public)/[subdomain]/page.tsx`, migrate `mobile/page.tsx` to responsive single render, drop `template_variant` column. |
| 10 | Pro+ polish blocks (FAQ, Gallery, Amenities)    | ~5d    | Three blocks gated to `site_polish_blocks`. Documentation. |
| 11 | Custom CSS overrides (Pro+)                     | ~2d    | Token-bounded override fields on Layout & Theme tab. Sanitization at the API boundary (token allowlist, no arbitrary CSS). |

**Deferred to Phase 2:**

| #     | Title                              | Notes |
|-------|------------------------------------|-------|
| Ph2-1 | Custom domain mapping              | Vercel domains API + CNAME verification; ~8d. |
| Ph2-2 | Portfolio templates (PM+)          | Bulk-apply mechanism for PM-managed multi-community brands; ~5d. |
| Ph2-3 | Visual regression (Chromatic/PW)   | Once layout count grows past 3; ~3d. |
| Ph2-4 | A/B testing of layouts/presets     | Probably never; add only if requested. |
| Ph2-5 | Visual diff of preset versions     | Quality-of-life polish; ~2d. |

### 9.1 Per-PR Discipline (carrying forward A1-drain conventions)

- Each PR ships its own documentation entries (no "docs PR" follow-up).
- Each PR includes a feature flag where appropriate (PR #1's per-community block-rendering flag is the keystone). Block adoption follows the demo-community-first pattern from earlier drains.
- Each PR is reviewable in under 90 minutes per the project's recent cadence.
- No envelope changes ride alongside feature changes; if shape changes are needed they go in their own PR (lesson from the B1 envelope-migration session).
- Test sweep discipline (from the B1 Slice 2 lesson): when changing response shape on admin API routes, grep `apps/admin/__tests__/integration/` for both URL substrings and route-module calls.

---

## Section 10: Open Decisions & Recommended Defaults

Items the user did not explicitly decide; flagged with my recommendation. Override at spec review if any are wrong.

1. **Mobile variant**: drop `template_variant` column in PR #9; one responsive layout serves desktop + mobile. *Reason: maintaining two render paths doubles editor/admin surface for negligible benefit; modern responsive design handles this cleanly. The existing `mobile/page.tsx` migrates to a media-query-driven view from the same layout component.*
2. **Preset auto-update on layout swap**: persist the preset selection independently. *Reason: a PM choosing the "Bay Light" preset has made a deliberate choice; auto-switching it when they change layout would feel like data loss.*
3. **Hero block content schema**: structured fields (headline, sub, ctaText, ctaTarget, imagePath, altText) — not freeform markdown. *Reason: structured fields enforce accessibility (alt text required, heading hierarchy enforced) and make per-layout rendering deterministic. Markdown invites HTML injection and inconsistent styling.*
4. **Custom CSS override scope (Pro+)**: limited to a fixed allowlist of token-equivalent fields (primary/secondary/accent color, optional override of body font from a curated dropdown). No raw CSS, no class names, no selectors. *Reason: arbitrary CSS is the entry point to all the support / security / accessibility problems codex warned about.*
5. **Starter pack version semantics**: communities are linked to the starter pack they were installed from, but only for record-keeping. Updates to a starter pack do not propagate. *Reason: PM-authored content edits would be silently overwritten; explicit "Reset to starter" is the only path.*
6. **Image storage retention on community deletion**: assets in `community-site-assets/` follow the existing community soft-delete + 30-day-hard-delete lifecycle in `apps/web/src/app/api/v1/internal/account-lifecycle/`. No new lifecycle hook needed.

---

## Section 11: Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Block schema migration breaks an existing JSX template community | Low | No production seed data references `jsx_template`; verified pre-spec. PR #9's deletion is a no-op for prod data. |
| The new render path slows down public-site load | Medium | All renderers are server components; SoR queries use `LIMIT 5–10`; no client islands in v1. Performance baseline established in PR #1 via the existing `pnpm perf:check`. |
| Image upload + crop introduces a security regression | Medium | Strict MIME allowlist at API boundary (`image/jpeg|png|webp` only); `sharp` re-encodes (strips EXIF + reuploaded vectors); SVG explicitly rejected. No HTML in alt text (schema-enforced plain string ≤ 200 chars). |
| Admin panel template metadata edits not reflected in onboarding | Low | Admin writes invalidate a small in-memory cache (5-min TTL) on the web app's onboarding route. Documented in PR #7. |
| Custom CSS overrides allow CSS injection at render | Medium (Pro+) | No raw CSS accepted; token-allowlist-only schema. CSS variables generated server-side from a typed `CustomCssOverrides` zod object. |
| Migration timing collision with another in-flight branch | Medium | Per `.claude/rules/migration-safety.md`: check `meta/_journal.json` at PR-open time; coordinate via the next-migration-number lock the team has been using during the A1 drain cadence. |
| The 30-day soft-delete window of old published rows balloons site_blocks row count | Low | Existing daily lifecycle cron extended in PR #8 to hard-delete after 30 days. Adds ~5 rows × communities × publishes/month — bounded. |

---

## Section 12: Glossary

- **Layout** — A React component shipped in `apps/web/src/components/public-site/layouts/`. Owns page chrome and typography rhythm. Three in v1: Tidewater, Boulevard, Sable. PM-selectable, not PM-authorable.
- **Theme preset** — A platform-level row in `site_theme_presets`. Bundles color + font tokens under a named slug. Admin-CRUD. PM-selectable.
- **Starter pack** — A platform-level row in `site_starter_packs`. Bundles initial block content keyed by `community_type`. Admin-CRUD. Applied once during onboarding.
- **Content block** — PM-authored block (`hero`, `text`, `image`, `faq`, `gallery`, `amenities`). Content lives in the block row's `content` jsonb.
- **SoR block** — System-of-record block (`documents`, `meetings`, `announcements`, `contact`). Renderer reads from existing tables at render time. PM authors visibility + config only.
- **`_site`** — The canonical public-site Next.js route at `apps/web/src/app/_site/`, served via middleware rewrite on subdomain requests.
- **`compiledHtml` / `jsx_template`** — The retired escape hatch in `apps/admin/`. Removed in PR #9.

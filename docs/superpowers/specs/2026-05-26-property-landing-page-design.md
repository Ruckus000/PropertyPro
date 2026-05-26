# Property Landing Page — Design Spec

**Date:** 2026-05-26
**Status:** Draft (amended 2026-05-26 post-hostile-review)
**Author:** Claude (brainstorming session)

---

## Overview

A managed compliance website system for PropertyPro communities. Each community gets a public-facing site at its subdomain (`[slug].getpropertypro.com`), auto-populated from the system of record (documents, meetings, announcements, contact info) and customizable by property managers within deliberate guardrails.

The system replaces a half-built mix of three competing implementations (a hardcoded `_site` page, an orphaned `(public)/[subdomain]/page.tsx` home route that overlaps with `_site`, and a platform-admin-only JSX-source-to-HTML escape hatch) with a typed structured-block model that the existing `site_blocks` schema was originally designed for. Note: the `(public)/[subdomain]/` route group contains other statutory pages (`transparency`, `notices`, `request-access`) that are NOT retired — only the `page.tsx` home route overlaps with `_site` and is replaced.

**Design goals:**

- A polished, Florida-residential aesthetic that anchors the "compliance website included" promise codex flagged from §718.111(12)(g) and §720.303.
- Self-serve site management for property managers (Essentials tier) without exposing layout/CSS authoring (cost & safety guardrail).
- A platform-admin catalog UI for managing layouts, theme presets, and starter packs — seamless CRUD with versioning, tier gating, and adoption metrics.
- Documentation as a first-class deliverable, in five surfaces.
- A vertical-slice rollout that matches the codebase's existing A1-drain cadence.

**Non-goals for v1** (explicit cuts to honor the "no significant expense" constraint):

- Drag-and-drop visual editor (forms + integer reorder controls only)
- Live preview iframe (Preview button opens subdomain in new tab with `?preview=true` — reuses existing middleware pattern, see Section 2.7)
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

Tier gating uses the existing `requirePlanFeature` runtime gate at [apps/web/src/lib/middleware/plan-guard.ts:26](apps/web/src/lib/middleware/plan-guard.ts:26) against the `CommunityFeatures` interface at [packages/shared/src/features/types.ts](packages/shared/src/features/types.ts).

The existing flag `requiresPublicWebsite: true` is already set on Essentials and Professional in [packages/shared/src/features/plan-features.ts](packages/shared/src/features/plan-features.ts) — this spec leverages that existing semantic. The flags added in v1 follow the codebase's `has*` camelCase boolean convention:

- `hasSiteEditor` (Essentials+) — enables the block editor at `/pm/settings/website/`
- `hasSitePolishBlocks` (Pro+) — unlocks FAQ, Gallery, Amenities block types
- `hasSiteCustomCss` (Pro+) — unlocks token-allowlist custom CSS overrides

Phase 2 flags: `hasSiteCustomDomain` (Pro+), `hasSitePortfolioTemplates` (PM+).

---

## Section 2: Architecture

### 2.1 Canonical Render Path

`apps/web/src/app/_site/page.tsx` remains canonical. Middleware at `apps/web/src/middleware.ts:678` already rewrites unauthenticated subdomain traffic to `/_site` — this stays.

**Retired in PR #9 (precise scope):**

- `apps/web/src/app/(public)/[subdomain]/page.tsx` ONLY — the home route that overlaps with `_site`. The route file is deleted. **Preserved (NOT retired):** `(public)/[subdomain]/transparency/page.tsx`, `(public)/[subdomain]/notices/page.tsx`, `(public)/[subdomain]/request-access/page.tsx`, `(public)/[subdomain]/not-found.tsx`, `(public)/[subdomain]/unavailable/page.tsx`, and the entire `(public)/signup/` subtree. The transparency page is statutorily required per §718.111(12)(g); retiring it would be a compliance regression.
- `apps/web/src/app/mobile/page.tsx` — migrated to read from the block model with a responsive render (no separate template variant). The `template_variant` column on `site_blocks` is dropped in PR #9's migration. The mobile route remains; only its render path changes.
- `apps/admin/src/app/api/admin/communities/[id]/site-template/publish/route.ts` and its sibling endpoints (admin JSX template publish flow).
- `apps/web/src/lib/api/site-template.ts` and the `dangerouslySetInnerHTML` + Tailwind-CDN render path in `_site/page.tsx`.
- The four admin tests for compile-template / public-site-template-queries / public-site-template-service.
- The `jsx_template` block type removed from the CHECK constraint in a migration.
- The `--pp-primary`, `--pp-secondary`, `--pp-accent` CSS variable aliases in `_site/page.tsx`, `mobile/page.tsx`, and `demo/[slug]/page.tsx` — verified to have no consumers outside these three files (block renderers use the canonical `--theme-*` vars from `packages/theme`).

**Pre-retirement verification (gate on PR #9):** platform admin (user) confirms via DB query that no live community has a `site_blocks` row with `block_type='jsx_template' AND deleted_at IS NULL`. If any exist, those communities are migrated to block-model rows before PR #9 lands.

**Migrated:**

- The useful structural elements of the orphaned `apps/web/src/components/public/public-home.tsx` and `public-notices.tsx` get folded into the new block renderers (specifically the `announcements` SoR block in PR #3 and the `documents` SoR block in PR #4).

### 2.2 Block Model

The schema `site_blocks` table at `packages/db/src/schema/site-blocks.ts` already defines the shape: `(id, community_id, block_order, block_type, content jsonb, is_draft, template_variant, published_at, deleted_at)` with a unique constraint on `(community_id, block_order, is_draft, template_variant)`.

**Block types in v1** (CHECK constraint updated in PR #1a's migration):

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

SoR blocks (Documents/Meetings/Announcements/Contact) perform their own community-scoped reads at render. **Important:** the `_site` route runs in an unauthenticated context — there is no session and no `TenantContext`, so `createScopedClient()` at [packages/db/src/scoped-client.ts:33](packages/db/src/scoped-client.ts:33) would throw `TenantContextMissing`. Instead, SoR blocks use a shared helper `getPublicCommunityScopedReader(communityId)` introduced in PR #1a, which wraps `createUnscopedClient()` from [packages/db/src/unsafe.ts:70](packages/db/src/unsafe.ts:70) with explicit `eq(table.communityId, X) AND isNull(table.deletedAt)` predicates and an `// AUTHZ:` docstring matching the pattern at [apps/web/src/lib/api/site-template.ts:6](apps/web/src/lib/api/site-template.ts:6).

The helper signature:

```ts
// Public-site read helper. Bypasses TenantContext (none in unauthenticated
// public render) but constrains every query with community_id + deleted_at
// predicates. Only callable from block renderers in the public-site path.
// AUTHZ contract: caller MUST validate communityId via middleware-injected
// x-community-id header before invocation.
export function getPublicCommunityScopedReader(communityId: number): PublicScopedReader;
```

`PublicScopedReader` is a thin wrapper exposing typed read methods per SoR table (`listDocuments`, `listMeetings`, `listAnnouncements`, `getContactInfo`) — NOT a general-purpose drizzle client. Constraining the surface this way makes the CI guard at `scripts/verify-scoped-db-access.ts` enforceable.

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

**Constraint precondition — fixed in PR #1a's migration.** The existing UNIQUE constraint at [packages/db/migrations/0000_nappy_guardian.sql](packages/db/migrations/0000_nappy_guardian.sql) — `UNIQUE(community_id, block_order, is_draft, template_variant)` — is NOT partial and does not exclude soft-deleted rows. The naive "soft-delete published, promote drafts" publish flow would violate the constraint mid-transaction (two rows briefly share `is_draft=false, block_order=N` — one with `deleted_at` set, one freshly promoted). **PR #1a's migration drops the existing UNIQUE constraint and replaces it with a partial unique index:**

```sql
DROP INDEX site_blocks_community_order_draft_variant_unique;

CREATE UNIQUE INDEX site_blocks_community_order_draft_unique
  ON site_blocks (community_id, block_order, is_draft)
  WHERE deleted_at IS NULL;
```

(The `template_variant` column is also dropped in PR #9 per Section 2.1; the partial index uses the post-PR-9 shape with `template_variant` already gone. If PR #1a lands before PR #9, the partial index includes `template_variant` and is rewritten without it in PR #9's migration.)

**Atomic community-wide publish** runs as a single transaction:

1. PM edits write draft rows: `(community_id, block_order, is_draft=true)`. The partial unique index permits one live draft per `block_order` per community.
2. "Publish Website" button executes:
   ```
   BEGIN;
     UPDATE site_blocks
        SET deleted_at = now()
      WHERE community_id = $1 AND is_draft = false AND deleted_at IS NULL;
     UPDATE site_blocks
        SET is_draft = false, published_at = now()
      WHERE community_id = $1 AND is_draft = true AND deleted_at IS NULL;
     INSERT INTO compliance_audit_log (...) VALUES (...);  -- action: 'site_publish'
   COMMIT;
   ```
   The first UPDATE moves all previously-published rows out of the partial index (deleted_at IS NOT NULL). The second UPDATE then promotes drafts to published — no constraint conflict because the soft-deleted prior rows are no longer in the partial index.
3. Soft-deleted previous-published rows retained for 30 days, then hard-deleted by the existing `internal/account-lifecycle` cron at [apps/web/src/app/api/v1/internal/account-lifecycle/route.ts](apps/web/src/app/api/v1/internal/account-lifecycle/route.ts). PR #8 extends the cron with a `cleanupSoftDeletedSiteBlocks()` step.

No per-block draft state. No partial publishes. The simplicity is intentional.

**Preview workflow** uses the existing middleware pattern at [apps/web/src/middleware.ts:370](apps/web/src/middleware.ts:370). The "Preview Draft" button opens `https://[slug].getpropertypro.com/?preview=true` in a new tab. The middleware already handles `?preview=true` for the `/mobile` preview iframe path (line 476); PR #8 extends the existing handler to also bypass the published-blocks filter on `/` (rewriting to `/_site`) and pass `x-preview=true` through to the page. The page reads draft blocks instead of published blocks when this header is present.

**Security trade-off accepted:** the existing `?preview=true` pattern is token-free. The preview URL is share-shareable; any visitor knowing the URL can see drafts. The trade-off is acceptable in v1 because (a) drafts will be published shortly anyway, (b) draft URLs are not discoverable via crawl, (c) the existing mobile-preview pattern already accepts this trade-off without compromise. If we need authenticated previews later (e.g., a community wants to preview a major redesign in private), Phase 2 can add an HMAC token mechanism. v1 does not.

**Concurrent publish protection:** the publish transaction acquires `SELECT ... FOR UPDATE` on the community row before running. A second concurrent publish click waits, then sees no draft rows to promote (the first publish already moved them) and returns "Nothing new to publish." This eliminates lost-write hazards from two PMs hitting Publish simultaneously.

**Optimistic concurrency on the editor** (cheaper than locking): the floating publish bar shows `published_at` of the loaded state; on Publish, the request includes this value as an `If-Match`-style header. If the server's current `published_at` differs (another publish landed), the API returns 409 with the new state. The editor shows "Someone else published in the meantime — review changes and try again."

### 2.8 Image Handling

**Storage layer.** Supabase Storage (already in stack). New bucket: `community-site-assets`. Path layout: `{community_id}/{kind}/{uuid}-{filename}` where `kind ∈ {logo, hero, content}`.

**Two-step upload pattern (aligned to existing codebase pattern at [apps/web/src/app/api/v1/upload/route.ts:46](apps/web/src/app/api/v1/upload/route.ts:46)):**

1. **Presign:** `POST /api/v1/site/uploads/presign` — body: `{ kind, filename, mimeType, fileSize }`. Validates MIME allowlist, file size, storage quota (Section 8.3), and authorization (PM has `hasSiteEditor`). Returns presigned upload URL + final storage path. Reuses `createPresignedUploadUrl()` from `@propertypro/db` — same primitive as the existing document upload route.
2. **Client uploads directly** to Supabase Storage via the presigned URL. No bytes pass through the Next.js app server.
3. **Transform & finalize:** `POST /api/v1/site/images/finalize` — body: `{ storagePath, kind, cropBox: { x, y, w, h }, altText }`. Server downloads the original from Storage, runs `sharp` transformations (crop + resize to two variants: `1600w` and `800w`), writes the variants back to Storage at `{storagePath}.1600w.webp` and `{storagePath}.800w.webp`, then returns the canonical paths for the block content jsonb. Audit log entry: `site_image_uploaded`. Alt text required on this endpoint (the presign endpoint stores nothing in the DB; the finalize endpoint is the audited boundary).

Cropping UI uses `react-image-crop` (~30KB, MIT, zero deps) in the editor — added via `pnpm add react-image-crop` in PR #2. Cropping happens client-side for the preview; the authoritative crop runs server-side in step 3.

**Validation at upload:** max 5MB for logos, 10MB for hero/content images, accept `image/jpeg | image/png | image/webp`. Reject SVG (XSS vector), GIF (perceptual problem on hero blocks), HEIC (not universally supported by `sharp`). Validation runs at the presign endpoint AND server-side in finalize (defense-in-depth: a malicious actor cannot bypass MIME validation by uploading anything else through the presigned URL — finalize re-checks the actual file bytes via `sharp`'s decode).

**Alt text** is required at the finalize endpoint. The schema for `image` and `hero` blocks marks `altText` as required. Empty alt is allowed only when the block schema explicitly declares the image as decorative (e.g., a hero-overlay-graphic field).

**Rate limiting.** Both endpoints inherit the existing rate limiter at [apps/web/src/lib/middleware/rate-limiter.ts](apps/web/src/lib/middleware/rate-limiter.ts). Presign endpoint: 20 requests / 5 minutes / community. Finalize endpoint: 20 requests / 5 minutes / community. Matches the existing `auth` route category limits.

**Storage RLS policies (added in PR #2's migration):**

```sql
-- Allow service role to manage all objects (server-side transformations)
CREATE POLICY "site_assets_service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'community-site-assets')
  WITH CHECK (bucket_id = 'community-site-assets');

-- Allow authenticated PM to insert objects scoped to their community path
CREATE POLICY "site_assets_pm_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam')
         AND deleted_at IS NULL
    )
  );

-- Allow anonymous public read (the public site is unauthenticated)
CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-site-assets');

-- Allow PM to delete their community's assets
CREATE POLICY "site_assets_pm_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam')
         AND deleted_at IS NULL
    )
  );
```

The bucket is created with `public = true` at the bucket level (so the `SELECT` policy actually matters; cf. existing buckets in the project). The `service_role` policy lets the finalize endpoint write transformed variants back without inheriting PM auth.

### 2.9 SEO, OpenGraph & Page Metadata

Public community sites need proper page metadata so resident-shared links render correctly on Facebook / iMessage / SMS / search engine results. Currently `_site/page.tsx` and `(public)/[subdomain]/page.tsx` have ZERO `generateMetadata()` — verified by grep. Sharing a community URL on social produces an unbranded preview.

**PR #1b adds `generateMetadata()` to the `_site/page.tsx`** producing:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const community = await resolvePublicCommunityFromHeaders();
  if (!community) return { title: 'PropertyPro' };
  return {
    title: `${community.name} — Community Portal`,
    description: community.tagline ?? `Official site of ${community.name}, a Florida ${community.communityType === 'condo_718' ? 'condominium association' : community.communityType === 'hoa_720' ? 'homeowners association' : 'apartment community'} in ${community.city ?? 'Florida'}.`,
    openGraph: {
      title: community.name,
      description: community.tagline ?? undefined,
      url: `https://${community.slug}.getpropertypro.com`,
      siteName: community.name,
      images: community.heroImagePath ? [{ url: buildPublicAssetUrl(community.heroImagePath), width: 1600, height: 900, alt: `${community.name}` }] : [],
      locale: 'en_US',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: community.name, description: community.tagline ?? undefined },
    robots: { index: true, follow: true },
  };
}
```

The same helper is wired into the existing `(public)/[subdomain]/transparency/page.tsx` and `(public)/[subdomain]/notices/page.tsx` in PR #4 (one-line addition per file).

**A shared helper `buildCommunityMetadata(community, pageTitle?)` is added to `apps/web/src/lib/seo/community-metadata.ts` in PR #1b** so every public page uses the same metadata shape.

### 2.10 robots.txt and sitemap.xml

A public community site that fails to surface its statutory transparency content to search engines weakens the compliance promise. Today the repo has NO `robots.txt` or `sitemap.xml` route (verified by `find apps/web/src -name robots\* -o -name sitemap\*` — empty).

**PR #4 adds two Next.js Metadata Route handlers:**

- `apps/web/src/app/robots.ts` — Next 15 metadata-route export returning per-host robots policy. Subdomain hosts (community sites) allow indexing of `/`, `/transparency`, `/notices`, `/request-access`, and explicitly disallow `/auth/*`, `/dashboard/*`, `/pm/*`, `/api/*`. The marketing root host (`getpropertypro.com`) gets its own policy.
- `apps/web/src/app/sitemap.ts` — Next 15 metadata-route export. For subdomain hosts, returns the community's public URLs: home, transparency, notices, plus per-document URLs for the most recent N statutory documents (sourced via `getPublicCommunityScopedReader`). For the marketing root host, returns the marketing pages.

Both routes respect the existing middleware tenant resolution (the host header drives the community lookup). Cached with `revalidate: 3600` (1 hour) to bound DB load from crawlers.

Spec-explicit requirement: documents marked `public_access = false` are NEVER included in the sitemap. Verified at the DB query level.

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

  // new keys (PR #1a)
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
- `site_layout_metadata` — platform-level catalog of layouts. Code-shipped layouts have a row here for admin metadata (display name, tagline, tier, is_archived, default_preset_slug, featured_in_onboarding). PR #1a seeds three rows; PR #7 adds admin CRUD on the metadata fields (not on the layout code itself).

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

- **PR #1a migration**: (a) drop the existing `site_blocks_community_order_draft_variant_unique` UNIQUE constraint and replace with a partial unique index (Section 2.7); (b) extend the `block_type` CHECK constraint on `site_blocks` to include the new types; (c) add three new platform tables (`site_theme_presets`, `site_starter_packs`, `site_layout_metadata`); (d) seed `site_layout_metadata` rows + initial six presets + three starter packs via INSERT.
- **PR #9 migration**: Drop `template_variant` column from `site_blocks` (`mobile` variant retired in favor of responsive layouts); remove `jsx_template` from the CHECK constraint; rewrite the partial unique index to remove `template_variant` from the index columns.

**Migration journal verification (gate on PR-open):** the current worktree shows `packages/db/migrations/` containing only `0000_nappy_guardian.sql` through `0003_maintenance_unit_label.sql` (4 entries in `meta/_journal.json`), but the `_archive/` directory contains files up to `0149_*`. This indicates either a recent migration reset on the main branch or a worktree-specific state. **The PR #1a author MUST verify the current journal state via `git fetch && git diff origin/main -- packages/db/migrations/meta/_journal.json` at PR-open time and pick the next sequential migration number from the latest journal idx.** Do not rely on this spec's recollection of "0037" or any other absolute number.

All migrations follow the rules in `.claude/rules/migration-safety.md` — including the write-scope trigger for new tenant-scoped tables (none of the three new tables are tenant-scoped, so the trigger is N/A; this is documented in the migration's header comment).

---

## Section 4: PM-Facing Surfaces

### 4.0 The Pre-Setup State (the site is always live)

**Non-negotiable constraint:** a Florida condominium association with 25+ units that goes live without documents, notices, and meetings publicly posted is in statutory violation of §718.111(12)(g) the moment the community exists. The site **cannot** be gated behind a wizard the PM may never complete.

**Resolution:** the site is **always live** from the moment a community is created. The starter pack is applied automatically as part of community creation (in PR #5's modification to `pm/communities/new`), not as a step in the onboarding wizard. The defaults are:

- `communities.branding.layoutId` ← derived from `community_type` (`condo_718` → `tidewater`, `hoa_720` → `boulevard`, `apartment` → `sable`)
- `communities.branding.themePresetSlug` ← the layout's `default_preset_slug` from `site_layout_metadata`
- A draft block set inserted from the matching starter pack, then immediately published in the same transaction so the public site renders content from creation moment forward.
- `communities.site_onboarding_completed_at` left `NULL` — used to surface the "customize your site" prompt on the dashboard.

This shifts the wizard's framing from "set up your site" to **"customize the site we already built for you."** The PM never encounters a broken or empty site. If they never run the wizard, the site is generic-but-compliant.

### 4.1 Onboarding Wizard

Route: `apps/web/src/app/(authenticated)/pm/onboarding/website/?communityId=X` (5 steps).

**Entry points (four, ranked by usage frequency):**

1. **Post-community-creation modal** — when `pm/communities/new` succeeds, a modal renders: "Your site is live at `[slug].getpropertypro.com` · [View now] · [Customize now] · [Maybe later]". Most PMs click "Customize now."
2. **Dashboard banner** — for any community where `site_onboarding_completed_at IS NULL`, the PM dashboard shows a dismissible banner: "Your site at `[slug].getpropertypro.com` is using default settings — [Customize →]". Dismissal stored in `user_preferences` per (user, community).
3. **Communities table action** — for PMs with multiple communities, `/pm/dashboard/communities` gets a new "Site" column showing one of three pills: `Customized` / `Default` / `Draft saved`. The pill is a link to the wizard for that community.
4. **Settings menu** — `/pm/settings/website/?communityId=X` is always accessible; from there a "Re-run onboarding" link launches the wizard against the same community.

**Role gating:** only `property_manager_admin` and `cam` roles can run the wizard. Board members and board presidents see the editor in read-only mode in v1 (Phase 2 may grant board roles edit access). Enforced via a small new helper `requireRole(membership, roles)` added in PR #5 at `apps/web/src/lib/api/role-guard.ts` — this helper does NOT exist today (verified by grep; existing role checks are scattered ad-hoc, e.g., [apps/web/src/lib/services/onboarding-checklist-service.ts:69](apps/web/src/lib/services/onboarding-checklist-service.ts:69) does `if (role === 'pm_admin' || role === 'property_manager_admin')`). The helper consolidates the pattern and is reused by PR #6's admin endpoints and PR #11's custom-CSS gate. Note: `pm_admin` and `property_manager_admin` are aliases (confirmed in [packages/shared/src/default-faqs.ts:15-17](packages/shared/src/default-faqs.ts:15)); the helper accepts either string.

**The wizard, step by step:**

**Step 0 — Welcome (not counted in the 5)**

Single screen: "Customize your community site. About 5 minutes. You can come back anytime — your site stays live with default settings until you publish changes." Shows current public URL with "Open current site" link. Buttons: [Get started] · [Save and exit].

**Step 1 — Choose a layout** (1 of 5)

Three layout cards (Tidewater / Boulevard / Sable) with thumbnails generated from `/api/v1/admin/site-templates/layouts/[slug]/preview?communityId=X`. Default pre-selected based on `community_type`. Each card has a "Preview" link opening a full sample render in a new tab. "Skip — keep default" link present. The chosen layout persists immediately to `communities.branding.layoutId` on Continue (not on field-blur — this is a one-click action). Mid-wizard exit retains the choice.

**Step 2 — Choose a color & font preset** (2 of 5)

Six preset cards in a 2×3 grid. Each card renders a live mini-preview using the layout chosen in step 1. Hover reveals: heading font name + body font name + token swatches. Below the grid: a larger live preview area showing the hero block of the chosen layout × preset combination, using the community's real name. Continue saves to `communities.branding.themePresetSlug`.

**Step 3 — Add your community identity** (3 of 5)

Four sub-fields, all autosaved on blur:

- **Logo** — drag-and-drop or click-to-upload. Cropping via `react-image-crop`. Min 200×60, max 5MB, formats `image/jpeg | image/png | image/webp`. Alt text auto-set to community name. "Skip — show community name as wordmark" link.
- **Community name** — pre-filled from `communities.name`, editable. Edits write through to `communities.name` (with audit log entry).
- **Tagline** — one-liner, max 80 chars (visible counter). Placeholder: "A welcoming Florida community since {year-from-DB}" where year derives from `communities.created_at` year if no `established_year` is set, else `established_year`.
- **Hero image** — drag-and-drop + crop. Min 1600×900, max 10MB. Alt text REQUIRED if image provided (not optional). "Skip — use solid color from preset" link.
- **Stock photo gallery** (deferrable nice-to-have): an inline "Or pick one of these" expander with 8-12 curated Florida residential photos (Unsplash-licensed). PM clicks one to use. *Flagged as deferrable to v1.5 if v1 effort runs over budget.*

**Step 4 — Welcome message** (4 of 5)

Single typed textarea for the hero block body. Max 280 chars, soft warning at 200, hard cap at 280. Placeholder: "Welcome to {community}, a {community_type} on Florida's {region} coast. Find documents, meeting notices, and resident resources here." A "Suggested copy" expander shows 3-4 template variants the PM can click to populate. Live preview to the right shows the hero block with current state.

**Step 5 — Confirm what's shown** (5 of 5)

Checklist of SoR blocks — Documents, Meetings, Announcements, Contact — all pre-checked. Per-block:

- A "Configure" expand with advanced settings (limit count, category filter, time-window). Defaults are reasonable; most PMs never expand.
- A drag handle for reorder. **Keyboard accessibility:** each row has visible "Move up" / "Move down" buttons (screen-reader-friendly labels). Drag-and-drop is augmentation, not replacement.

Primary button: "Publish my site." Secondary: "Save as draft (publish later)." Publish runs the atomic-publish transaction from Section 2.7 and writes `communities.site_onboarding_completed_at = now()`.

**Confirmation screen — after publish**

"Your site is live at `[slug].getpropertypro.com`" with [View site] · [Copy URL] · [Share with residents → templated SMS + email text]. Continue to dashboard closes the wizard.

**State persistence model:**

- Each field saves immediately on blur (not on Continue). Storage targets:
  - Layout/preset choices → `communities.branding` jsonb (existing column)
  - Hero block content + media paths → draft `site_blocks` rows (existing table)
  - Wizard-flow position (last completed step) → `communities.site_onboarding_progress` jsonb
- Returning mid-wizard: PM lands on the last completed step + 1. A small "Resume customizing" banner at the top with [Continue] · [Start over]. Choosing "Start over" snapshots current drafts to a 30-day soft-delete bucket (so reverting is recoverable for 30 days).

**Error handling per step:**

- Image upload failure: inline error + [Try again] · [Skip] buttons. Underlying error logged to Sentry with `community_id` + image MIME.
- Image too small: inline error stating actual vs required dimensions: "Your image is 800×450, we need at least 1600×900."
- Required field missing: prevent Continue, focus the missing field, show inline message.
- Backend save failure: yellow banner "We couldn't save your progress. Try again or come back later." Typed content kept in form state so the PM doesn't lose work.

**Accessibility floor (not negotiable):**

- All steps keyboard-navigable end-to-end.
- Focus management on step transitions (focus the first interactive element on the new step).
- Screen reader announcement on step change ("Step 2 of 5: Choose a color and font preset").
- Image upload + crop accessible via keyboard (uses `react-image-crop`'s built-in keyboard support).
- All form fields have associated `<label>` elements; no placeholder-as-label.
- Color contrast on every step ≥ WCAG AA.

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

Feature flags follow the `has*` camelCase boolean convention used throughout `CommunityFeatures` at [packages/shared/src/features/types.ts](packages/shared/src/features/types.ts). The existing `requiresPublicWebsite: true` flag on Essentials and Professional is the semantic anchor for "this plan includes a public website" — the new flags extend that.

- `hasSiteEditor` (Essentials + above) — read+write access to `/pm/settings/website/` and `/pm/onboarding/website/`. Enables editing of content blocks (hero/text/image) and SoR block configuration.
- `hasSitePolishBlocks` (Pro + above) — unlocks FAQ, Gallery, Amenities block types and the "Custom Pages" tab.
- `hasSiteCustomCss` (Pro + above) — unlocks the token-allowlist custom CSS overrides on the Layout & Theme tab.
- `hasSiteCustomDomain` (Pro + above) — **Phase 2**, not in v1.
- `hasSitePortfolioTemplates` (PM/Enterprise) — **Phase 2**, not in v1.

PR #1a adds these flag keys to `CommunityFeatures` and sets defaults on `PLAN_FEATURES` per tier in [packages/shared/src/features/plan-features.ts](packages/shared/src/features/plan-features.ts).

Each gate enforced via `requirePlanFeature(communityId, 'hasSiteXxx')` at the route handler level (matching the existing pattern at [apps/web/src/lib/esign/esign-route-helpers.ts:21](apps/web/src/lib/esign/esign-route-helpers.ts:21)) and via conditional rendering at the component level (disabled tabs are visible but locked, not hidden — supports upsell messaging).

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
- `POST /communities/[id]/reset-to-starter` — apply a starter pack to an existing community (admin-only escape hatch).

**Reset-to-starter UX (not a one-click destructive button):**

1. Action invoked from the community detail page in `apps/admin/`. Opens a confirmation modal.
2. Modal requires the admin to type the community slug verbatim (e.g., `sunset-condos`) to enable the destructive button. Same pattern used by the existing deletion-requests flow.
3. Before the reset runs, the current published block set is snapshotted to a new soft-deleted-row set (NOT hard-deleted) with a 30-day retention window. The snapshot is identifiable via a new `compliance_audit_log` entry referencing the snapshot's `site_blocks.id` range.
4. The reset then applies the requested starter pack as new draft rows (NOT auto-published — the PM publishes them after review).
5. `compliance_audit_log` writes a `site_reset_to_starter` action with `actor_user_id`, `target_community_id`, `starter_pack_slug`, `snapshot_block_ids`.
6. If a snapshot needs to be restored within the 30-day window, a `POST /communities/[id]/restore-from-snapshot` endpoint (added in PR #6 alongside reset) un-soft-deletes the snapshot and re-soft-deletes the post-reset rows. Adds an audit log entry mirroring the reset.

All routes follow the canonical pagination contract for list endpoints (`.claude/rules/api-patterns.md`).

---

## Section 6: Documentation Deliverables

Five surfaces, none optional in v1:

| Surface                                                | Audience          | Format                          | Lands in           |
|--------------------------------------------------------|-------------------|---------------------------------|--------------------|
| `docs/design-system/templates/{tidewater,boulevard,sable}.md` | Designers + engineers | Markdown — design intent, tokens consumed, accessibility constraints, photographic guidance, when to recommend | Each layout's PR   |
| `apps/web/src/components/public-site/layouts/README.md` | Engineers          | Markdown — how to add a new layout, registry pattern, testing requirements | PR #1a + updated per layout |
| `docs/design-system/blocks/{hero,text,image,documents,meetings,announcements,contact}.md` | Designers + engineers | Markdown — Zod schema, renderer props, editor form fields, tier gating | Each block's PR    |
| Help center MDX articles in `apps/web/src/content/help/website/` | Property managers | MDX — Choosing a layout, Customizing your theme, Adding content blocks, Publishing changes | PR #5 alongside the wizard |
| Inline help text on each admin panel page              | Platform admin (you) | React component with contextual one-liners + tooltip-expanded details | Each admin-panel PR |

The MDX help articles use the existing help center system (per memory: `project_help_center_already_exists.md` — substantial MDX-based system across PRs #98 → #219). No new docs infrastructure.

---

## Section 7: Tenant Isolation

Per `.claude/rules/tenant-isolation.md`:

- **Public-site community reads** (`site_blocks`, `documents`, `meetings`, `announcements`, board/contact info on the public render path) — go through `getPublicCommunityScopedReader(communityId)` introduced in PR #1a (Section 2.3). This helper wraps `createUnscopedClient()` at [packages/db/src/unsafe.ts:70](packages/db/src/unsafe.ts:70) with explicit `eq(table.communityId, X)` + `isNull(table.deletedAt)` predicates baked into typed read methods. The helper file carries an `// AUTHZ:` docstring matching the pattern at [apps/web/src/lib/api/site-template.ts:6](apps/web/src/lib/api/site-template.ts:6).
- **Authenticated PM/editor reads** (the editor at `/pm/settings/website/` runs in an authenticated context) — these continue to use `createScopedClient(communityId)` from `@propertypro/db`, since `TenantContext` is available from middleware. Writes from the editor also go through the scoped client.
- **Platform-level reads** (`site_theme_presets`, `site_starter_packs`, `site_layout_metadata`) — `createUnscopedClient()` with a documented authorization contract in the file header. These are read-only on the web app; writes happen only in `apps/admin/` under platform-admin auth.

The CI guard at `scripts/verify-scoped-db-access.ts` is extended in PR #1a to allowlist the new `getPublicCommunityScopedReader` location and the new platform-level helper files. New table imports outside the allowlist trigger CI failure as today.

Every new table is reviewed against the CI guard (`pnpm guard:db-access`). None of the three new platform-level tables need RLS — they are deliberately not tenant-scoped — but the migration's header documents this and references this spec.

---

## Section 8: Testing & Observability

### 8.1 Test Coverage

- **Block schema tests** — for each block type, exhaustive `safeParse` cases covering valid input, all required-field-missing variants, all type-mismatch variants. Land alongside each block's PR.
- **Renderer registry tests** — confirms every `BlockType` enum value has an entry in `blockRendererRegistry`, statically (via a TypeScript `satisfies` constraint at registry definition) and at runtime (a registry-completeness test in PR #1a).
- **Layout integration tests** — render each layout with a known seeded block set, snapshot the resulting HTML structure (not pixels). Land alongside each layout's PR.
- **Onboarding wizard integration test** — full flow happy path, plus the "PM leaves at step 3 and returns" case. PR #5.
- **Publish workflow integration test** — atomic publish + concurrent edit (last-write-wins on draft rows; no merge logic needed). PR #8.
- **Admin panel route tests** — list + CRUD + tier gating + audit log writes. PR #6, #7.
- **Visual regression** — out of scope for v1. Snapshot tests handle structural changes; visual regression is a Phase 2 add (Chromatic or Playwright screenshot diffs).

### 8.2 Observability

- **Sentry events** for: site publish failures, block schema validation failures (with `community_id` + `block_id`), image upload failures, custom CSS injection-attempt detections (Pro+), reset-to-starter executions (informational, includes acting admin and target community).
- **Audit log writes** to `compliance_audit_log`: `site_publish`, `site_layout_changed`, `site_preset_changed`, `site_block_visibility_changed`, `site_reset_to_starter`, `site_restore_from_snapshot`. Existing audit log writer in `apps/web/src/lib/audit/`.
- **Adoption metrics** queryable from `apps/admin/` (existing `apps/admin/src/app/api/admin/metrics/` pattern): communities by layout, communities by preset, average blocks per community, % of communities with custom CSS, % of communities with `site_onboarding_completed_at IS NOT NULL`.

### 8.3 Storage Quotas

Image uploads consume Supabase Storage. Without a quota, a Pro+ community using the Gallery block could upload arbitrary amounts. v1 ships per-plan byte quotas to bound costs and surface usage visibly.

**Per-plan quotas (added to `PlanFeatureConfig` in PR #1a):**

| Plan          | `siteAssetsQuotaBytes` | Approx. images @ 500KB avg |
|---------------|------------------------|-----------------------------|
| Essentials    | 100 MB                 | ~200                        |
| Professional  | 500 MB                 | ~1,000                      |
| PM/Enterprise | 2 GB                   | ~4,000                      |

**Enforcement:**

- Each upload to `POST /api/v1/site/images` checks the current bucket usage for the community against the quota. Over-quota uploads return HTTP 413 with a structured error code (`SITE_ASSETS_QUOTA_EXCEEDED`).
- Usage tracked in `communities.site_settings.assetsBytesUsed` (jsonb field), updated transactionally on upload and on hard-delete (the 30-day soft-delete cron decrements the counter when assets are finalized for deletion).
- Editor surface: the Layout & Theme tab shows a small usage bar ("78 MB of 100 MB used"). At 80%+, an inline warning suggests removing unused images. The image picker in each block editor surfaces a "Delete unused" action.
- Hard-delete cascade on community deletion: assets in `community-site-assets/{community_id}/` removed by the existing community-deletion lifecycle hook (extends [apps/web/src/app/api/v1/internal/account-lifecycle/route.ts](apps/web/src/app/api/v1/internal/account-lifecycle/route.ts) in PR #2 alongside the storage bucket creation).

**Observability hook:** PR #2 adds a daily metric in `apps/admin/api/admin/metrics/` exposing top-N communities by `assetsBytesUsed`, for cost-monitoring.

### 8.4 CSRF & Rate Limiting

**CSRF.** All editor mutation routes under `/api/v1/site/*` and `/api/v1/pm/site/*` inherit the codebase's existing CSRF posture: Supabase Auth session cookies are `SameSite=Lax` (verified at [apps/web/src/lib/api/reauth-guard.ts:49](apps/web/src/lib/api/reauth-guard.ts:49)). This is the same protection the rest of the authenticated app relies on; no per-route CSRF token logic is introduced. The spec does not add a new CSRF mechanism — it inherits.

**Rate limiting.** Three new routes are added to the existing rate limiter's `auth` route category (where the per-IP / per-user limits already apply):

| Route                                            | Limit                                  |
|--------------------------------------------------|----------------------------------------|
| `POST /api/v1/site/uploads/presign`              | 20 req / 5 min / community             |
| `POST /api/v1/site/images/finalize`              | 20 req / 5 min / community             |
| `POST /api/v1/site/publish`                      | 10 req / 5 min / community             |
| `POST /admin/site-templates/communities/[id]/reset-to-starter` | 5 req / 1 hour / admin user |

Rate limits are added to [apps/web/src/lib/middleware/rate-limiter.ts](apps/web/src/lib/middleware/rate-limiter.ts)'s route classifier in PR #2 (images) and PR #8 (publish) and PR #6 (reset-to-starter).

### 8.5 Performance Budget & N+1 Analysis

**Current baseline.** The existing `_site/page.tsx` performs:
1. One read for `community` (via `getCommunityPublicInfo`)
2. One read for `branding` (via `getBrandingForCommunity`)
3. One read for the JSX template (via `getPublishedTemplate`)
4. No SoR queries (the hardcoded page doesn't display documents/meetings/announcements)

**Target architecture.** The new `_site/page.tsx` performs:
1. One read for `community` (unchanged)
2. One read for `branding` + layout/preset resolution (consolidated)
3. One read for the ordered block list from `site_blocks` (new, replaces step 3 above)
4. **Per SoR block**: one read for the underlying data (typically 4 SoR blocks → 4 additional reads)

**Net delta: +1 to +4 reads per public page render**, depending on how many SoR blocks the community has enabled. At 50ms p95 per scoped read, this adds 50-200ms to public-site server render time.

**Performance budget for v1:**

- Server render p95 < 500ms (was: ~200ms for the hardcoded page).
- Initial page payload size < 100 KB gzipped (excluding hero image).
- Lighthouse Performance score ≥ 85 on a mid-tier mobile device with the default starter pack content.

**N+1 mitigation strategy.** Each SoR block's read is intentionally separate (preserves the renderer registry boundary). Two mitigations:

1. **Limit is enforced at the schema level.** Documents SoR block has `limit: z.number().int().min(1).max(20).default(5)` — caps each read at 20 rows. Same for meetings (`max(20).default(10)`) and announcements (`max(20).default(5)`).
2. **Per-block parallel execution.** The layout component issues block reads via `Promise.all(blocks.map(...))` rather than awaiting sequentially. The 4 SoR queries execute concurrently, so wall-clock is bounded by the slowest, not their sum.

**No caching layer in v1.** Public pages are not cached at the CDN or app layer. Deferred to Phase 2 if traffic genuinely warrants it (would need cache invalidation on publish, hero image rotation, etc.). For 1000 communities × 100 page-views/day, the uncached load is ~400k DB reads/day — well within Supabase's free-tier quota and not a meaningful cost driver.

**PR #1b establishes the baseline.** A new check is added to `scripts/perf-check.ts` that loads a seeded demo community's public site and asserts p95 < 500ms. CI fails if the budget is busted.

---

## Section 9: PR Sequencing (Approach C — Vertical-Slice-First)

Estimated total: ~51 engineering days for v1 + v1.5 (Pro+ polish blocks). One engineer ≈ 10 weeks; two in parallel ≈ 5 weeks. Revised upward from the post-hostile-review ~47d to reflect the 8 additional amendments from the verification checklist: presigned-URL upload pattern, SEO metadata helper, robots.ts + sitemap.ts routes, existing-test inventory and updates, `requireRole` helper, storage RLS policies (added explicitly), CSRF + rate-limiting notes (no new code, just discipline), performance budget + N+1 mitigation (explicit limit enforcement + parallel reads).

**Migration journal coordination:** before each PR with a migration (#1a, #1b — partial-unique-index split, #9), the PR author runs `git fetch && git diff origin/main -- packages/db/migrations/meta/_journal.json` to lock in the next sequential migration number. This spec does NOT name absolute numbers (e.g., "0037") because the journal state on main may have moved since spec authorship.

| #   | Title                                              | Effort | Scope |
|-----|----------------------------------------------------|--------|-------|
| 1a  | Foundation — block registry + platform tables      | ~4d    | Block schema registry (Zod schemas for all 7 v1 block types), layout registry, `getPublicCommunityScopedReader` helper, the partial-unique-index migration on `site_blocks` (Section 2.7), new platform tables (`site_theme_presets`, `site_starter_packs`, `site_layout_metadata`), extended `block_type` CHECK constraint, seed rows for layouts + 6 presets + 3 starter packs, new `has*` feature flags in `CommunityFeatures` + `PLAN_FEATURES`, CI-guard allowlist update. **No PM-facing UI yet.** Pre-existing `_site/page.tsx` keeps rendering hardcoded content (unchanged). |
| 1b  | Hero vertical slice — Tidewater + Hero block + SEO | ~5d    | Tidewater layout component, Hero block schema + renderer + editor form, `_site/page.tsx` switched to layout-registry rendering (Tidewater only; gated behind a per-community feature flag column added in PR #1a). PM editor surface for the Hero block at `/pm/settings/website/?communityId=X` (Welcome tab only). **NEW: `generateMetadata()` + `buildCommunityMetadata` helper at `apps/web/src/lib/seo/community-metadata.ts` (Section 2.9). Performance budget check added to `scripts/perf-check.ts` (Section 8.5).** Documentation: `blocks/hero.md`, `layouts/README.md`, `templates/tidewater.md`. Existing tests touched: see Section 9.0. |
| 2   | Text & Image content blocks + storage + uploads    | ~4d    | Two block types in parallel. Storage bucket `community-site-assets` + RLS policies (Section 2.8), **two-step presigned-URL upload pattern: `POST /api/v1/site/uploads/presign` + `POST /api/v1/site/images/finalize`** with `sharp` server-side transform + `react-image-crop` in editor, per-plan storage quota enforcement (Section 8.3), rate limits registered (Section 8.4), asset cleanup hook in `internal/account-lifecycle`. Documentation: `blocks/text.md`, `blocks/image.md`. |
| 3   | Announcements SoR block                            | ~3d    | First SoR block — establishes the pattern (config-only block, server-side fetch at render via `getPublicCommunityScopedReader`). Folds in the orphaned `PublicNotices` component logic. Documentation: `blocks/announcements.md`. |
| 4   | Documents + Meetings + Contact SoR blocks + robots/sitemap | ~6d    | Three SoR blocks in a parallel-3 batch (matches the A1 drain cadence). **NEW: `apps/web/src/app/robots.ts` and `apps/web/src/app/sitemap.ts` Next 15 metadata routes (Section 2.10), per-host policies, statutory documents indexed (only `public_access=true`).** Documentation for each block. |
| 5   | Onboarding wizard + auto-applied starter packs + requireRole | ~6d    | 5-step wizard at `/pm/onboarding/website/?communityId=X`. **Modification to `pm/communities/new` to auto-apply starter pack on community creation (Section 4.0).** All four entry points (post-creation modal, dashboard banner, communities table action, settings link). **NEW: `apps/web/src/lib/api/role-guard.ts` with `requireRole(membership, roles[])` helper consolidating the ad-hoc role checks across the codebase.** Help center MDX articles. Snapshot-on-mid-wizard-reset (30-day retention). |
| 6   | Theme preset CRUD admin panel + reset-to-starter   | ~4d    | `/admin/site-templates/theme-presets/` (full CRUD). Reset-to-starter destructive action with confirm-by-slug + snapshot + audit log + 30-day restore window. `POST /communities/[id]/restore-from-snapshot` endpoint. |
| 7   | Layouts admin panel + Boulevard & Sable layouts    | ~6d    | Admin metadata-editing panel for layouts at `/admin/site-templates/`, plus the two remaining layouts shipped as code. Documentation: `templates/boulevard.md`, `templates/sable.md`. |
| 8   | Reorder + publish workflow                         | ~4d    | Per-block ↑/↓ controls with keyboard support, "Publish website" button (executes the transaction from Section 2.7), optimistic-concurrency `If-Match`-style header, preview-route middleware extension to honor `?preview=true` on `/`. Extends the `internal/account-lifecycle` cron with `cleanupSoftDeletedSiteBlocks()`. |
| 9   | Retirement PR (scope-limited)                      | ~2d    | Remove `jsx_template` block type from CHECK constraint (migration). Delete `apps/web/src/lib/api/site-template.ts`. Delete the admin-side JSX template compile + publish + duplicate endpoints in `apps/admin/src/app/api/admin/communities/[id]/site-template/` + their four test files. Delete `apps/web/src/app/(public)/[subdomain]/page.tsx` ONLY (preserve `transparency`, `notices`, `request-access`, `not-found`, `unavailable`, and the entire `(public)/signup/` subtree). Drop `template_variant` column from `site_blocks` (after migrating `mobile/page.tsx` to read from the block model in this same PR). Remove `--pp-*` CSS variable aliases from the three page files. Permanently redirect `pm/settings/branding/` → `pm/settings/website/?communityId=X#branding`. **Pre-PR gate: verify no live community has a `jsx_template` block row via DB query (Section 2.1).** |
| 10  | Pro+ polish blocks (FAQ, Gallery, Amenities)       | ~5d    | Three blocks gated to `hasSitePolishBlocks`. Documentation. |
| 11  | Custom CSS overrides (Pro+)                        | ~2d    | Token-bounded override fields on Layout & Theme tab. Sanitization at the API boundary (token allowlist, no arbitrary CSS). Gated to `hasSiteCustomCss`. |

**Deferred to Phase 2:**

| #     | Title                              | Notes |
|-------|------------------------------------|-------|
| Ph2-1 | Custom domain mapping              | Vercel domains API + CNAME verification; ~8d. |
| Ph2-2 | Portfolio templates (PM+)          | Bulk-apply mechanism for PM-managed multi-community brands; ~5d. |
| Ph2-3 | Visual regression (Chromatic/PW)   | Once layout count grows past 3; ~3d. |
| Ph2-4 | A/B testing of layouts/presets     | Probably never; add only if requested. |
| Ph2-5 | Visual diff of preset versions     | Quality-of-life polish; ~2d. |

### 9.0 Existing tests affected per PR

The current public-site test surface is non-empty. Each PR that touches a render path or removes a route must explicitly update or delete the tests listed below.

| PR    | Tests touched                                                                              | Action |
|-------|--------------------------------------------------------------------------------------------|--------|
| #1b   | `apps/web/__tests__/public/public-website.test.tsx`                                        | Update assertions to match the new layout-registry render path (Tidewater shell + hero block) |
| #1b   | `apps/web/__tests__/public-site/community-resolution.test.ts`                              | Verify middleware test still passes; extend to assert `_site` receives `x-community-id` for the new render path |
| #1b   | `apps/web/__tests__/theme/theme-injection-mobile.test.tsx`                                 | Update theme-injection assertions to cover the new layout-component path (no functional change to mobile yet) |
| #2    | NEW tests — image upload presign + finalize, quota enforcement (boundary 5MB exact, over-quota 413) | Add |
| #3    | NEW test for `announcements` SoR block; verify orphan `PublicNotices` component logic is folded in cleanly | Add |
| #4    | NEW tests for `documents`, `meetings`, `contact` SoR blocks; NEW tests for robots.ts + sitemap.ts | Add |
| #5    | NEW integration tests for onboarding wizard (happy path + mid-wizard exit + role-gating); NEW tests for `requireRole` helper | Add |
| #8    | NEW tests for publish workflow (atomic publish + concurrent publish + optimistic-concurrency 409); NEW test for `cleanupSoftDeletedSiteBlocks` cron | Add |
| #9    | `apps/web/__tests__/mobile/mobile-home.test.ts`                                            | Rewrite — current test asserts JSX template render; PR #9 changes mobile to render from block model |
| #9    | `apps/web/__tests__/mobile/mobile-home-content.test.tsx`                                   | Rewrite assertions to match block-model render |
| #9    | `apps/web/__tests__/mobile/phone-frame.test.tsx`                                           | Verify still passes (UI chrome only; should be untouched by PR #9's mobile migration) |
| #9    | `apps/web/__tests__/mobile/mobile-settings-content.test.tsx`                               | Verify still passes (settings page; should be untouched) |
| #9    | `apps/admin/__tests__/compile-template.test.ts`                                            | Delete (JSX template flow being retired) |
| #9    | `apps/admin/__tests__/templates/public-site-template-queries.test.ts`                      | Delete (JSX template flow) |
| #9    | `apps/admin/__tests__/templates/public-site-template-service.test.ts`                      | Delete (JSX template flow) |
| #9    | `apps/admin/__tests__/templates/compile-template-detailed.test.ts`                         | Delete (JSX template flow) |

**Discovery method:** `find apps/web/__tests__ -path '*public*' -o -path '*mobile*' -o -path '*theme*'` and `grep -rln 'jsx_template\|site_blocks\|getPublishedTemplate' apps/web/__tests__ apps/admin/__tests__`. Run this same discovery in each PR before opening to catch any tests added since spec authorship.

### 9.1 Per-PR Discipline (carrying forward A1-drain conventions)

- Each PR ships its own documentation entries (no "docs PR" follow-up).
- Each PR includes a feature flag where appropriate (the per-community block-rendering flag added in PR #1a is the keystone — PR #1b is the first to flip it on for the Tidewater + Hero slice). Block adoption follows the demo-community-first pattern from earlier drains.
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
| Block schema migration breaks an existing JSX template community | Low | No production seed data references `jsx_template`; verified pre-spec. PR #9 has an explicit pre-merge gate: platform admin (user) queries DB to confirm zero `block_type='jsx_template' AND deleted_at IS NULL` rows before merging. |
| The partial-unique-index migration in PR #1a fails on a community that has duplicate `(community_id, block_order, is_draft)` rows already | Low-Medium | The migration uses `CREATE UNIQUE INDEX CONCURRENTLY` first to detect duplicates without locking; if it fails, the migration aborts cleanly and lists the offending rows for manual cleanup. The existing UNIQUE constraint should have prevented duplicates, so this is belt-and-suspenders. |
| Migration journal number assumed in spec is stale by PR-open time | High (the spec was written against a worktree state that doesn't match main) | All migration PRs include a journal-fetch step in their PR description. Migration filenames use the actual next-sequential number, not a number from this spec. |
| Reset-to-starter accidentally invoked, destroying PM content | Low (gated by confirm-by-slug) | Snapshot-before-reset with 30-day restore window; audit log entry; restore endpoint shipped in the same PR (#6). |
| Storage quota exceeded silently during onboarding image upload | Medium | Pre-upload check at the API boundary returns 413 with `SITE_ASSETS_QUOTA_EXCEEDED`; editor displays usage bar at all times; warning banner at 80% usage. |
| The new render path slows down public-site load | Medium | All renderers are server components; SoR queries use `LIMIT 5–10`; no client islands in v1. Performance baseline established in PR #1b (first PR that changes rendering) via the existing `pnpm perf:check`. |
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
- **`getPublicCommunityScopedReader`** — A helper introduced in PR #1a wrapping `createUnscopedClient()` with explicit `community_id` predicates, used by SoR block renderers in the unauthenticated public-site context where `createScopedClient()` cannot apply.
- **Auto-applied starter pack** — The community-type-specific seed inserted into `site_blocks` at community creation time (in PR #5's modification to `pm/communities/new`), not during onboarding. Guarantees statutory compliance from the moment the community exists.
- **Snapshot** — A soft-deleted-row set retained for 30 days. Created automatically by reset-to-starter (Section 5.6) and by mid-wizard "Start over" (Section 4.1). Restorable via `POST /communities/[id]/restore-from-snapshot`.

# Property Landing Page — PR #1a Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation layer for the structured block model — Zod schemas per block type, renderer + layout registry skeletons, the `getPublicCommunityScopedReader` helper, the partial-unique-index migration on `site_blocks`, three new platform tables (`site_theme_presets`, `site_starter_packs`, `site_layout_metadata`) with seed data, new `has*` feature flags, and the CI guard allowlist update. **No user-visible changes** — existing `_site/page.tsx` continues rendering its hardcoded content. This PR is reviewable and shippable on its own but produces no rendered behavior change.

**Architecture:** The block model is split across three layers — typed Zod schemas in `packages/shared/src/site-blocks/` (one file per block type), a renderer registry in `apps/web/src/components/public-site/blocks/registry.ts` (empty in 1a, populated in 1b+), and a public-context read helper at `apps/web/src/lib/db/public-community-reader.ts` that wraps `createUnscopedClient()` with explicit `community_id` predicates (the public site runs unauthenticated, so `createScopedClient` cannot apply). New platform tables are admin-only-writable and unscoped; they get a documented `// AUTHZ:` contract instead of RLS.

**Tech Stack:** Drizzle ORM, Zod, Vitest, Next.js 15, Drizzle Kit (migrations), pnpm + Turbo. Existing patterns to follow: `packages/db/src/schema/site-blocks.ts` for Drizzle schemas, `apps/web/src/lib/api/site-template.ts` for the unscoped-with-AUTHZ-contract pattern, `packages/shared/src/features/types.ts` for the `has*` feature flag convention, and `scripts/verify-scoped-db-access.ts` for the import-guard allowlist.

**Spec reference:** [docs/superpowers/specs/2026-05-26-property-landing-page-design.md](../specs/2026-05-26-property-landing-page-design.md) — commit `a52fca5e`. This plan implements Section 9's PR #1a row, plus the foundation prereqs from Sections 2.2, 2.3, 2.5, 2.6, 2.7 (partial-index migration only), 3, 4.3, 7, 8.3 (quota fields only).

---

## File Structure

**New files:**

| Path | Responsibility |
|------|----------------|
| `packages/db/migrations/0004_site_blocks_foundation.sql` | Drop existing UNIQUE on `site_blocks`, replace with partial unique index; extend `block_type` CHECK; create 3 platform tables; seed `site_layout_metadata` + 6 presets + 3 starter packs. |
| `packages/db/src/schema/site-theme-presets.ts` | Drizzle schema for `site_theme_presets` table. |
| `packages/db/src/schema/site-starter-packs.ts` | Drizzle schema for `site_starter_packs` table. |
| `packages/db/src/schema/site-layout-metadata.ts` | Drizzle schema for `site_layout_metadata` table. |
| `packages/shared/src/site-blocks/types.ts` | `BlockType` union, `SiteBlockContent<T>` discriminated union, shared primitives (e.g., `imagePathSchema`, `altTextSchema`). |
| `packages/shared/src/site-blocks/hero.ts` | `heroBlockSchema` (Zod) + inferred type. |
| `packages/shared/src/site-blocks/text.ts` | `textBlockSchema`. |
| `packages/shared/src/site-blocks/image.ts` | `imageBlockSchema`. |
| `packages/shared/src/site-blocks/documents.ts` | `documentsBlockSchema` (config-only — limits, category filters). |
| `packages/shared/src/site-blocks/meetings.ts` | `meetingsBlockSchema`. |
| `packages/shared/src/site-blocks/announcements.ts` | `announcementsBlockSchema`. |
| `packages/shared/src/site-blocks/contact.ts` | `contactBlockSchema`. |
| `packages/shared/src/site-blocks/index.ts` | `blockSchemaRegistry: Record<BlockType, ZodSchema>` + re-exports. |
| `apps/web/src/lib/db/public-community-reader.ts` | `getPublicCommunityScopedReader(communityId)` — wraps `createUnscopedClient()` with explicit `community_id` + `deletedAt` predicates, exposes typed read methods (stubbed in 1a; real implementations added in PRs #3 + #4). |
| `apps/web/src/components/public-site/blocks/types.ts` | `BlockRendererProps<T>` interface. |
| `apps/web/src/components/public-site/blocks/registry.ts` | `blockRendererRegistry: Record<BlockType, FC<BlockRendererProps>>` — empty in 1a, populated starting PR #1b. |
| `apps/web/src/components/public-site/layouts/types.ts` | `LayoutProps` interface + `LayoutId` union. |
| `apps/web/src/components/public-site/layouts/registry.ts` | `layoutRegistry: Record<LayoutId, FC<LayoutProps>>` — empty in 1a, populated starting PR #1b. |
| `apps/web/src/components/public-site/layouts/README.md` | Engineer docs for layout authoring. |
| `docs/design-system/blocks/README.md` | Landing page for block-type docs (per-block files added in PRs #1b–#4). |
| `docs/design-system/templates/README.md` | Landing page for layout-template docs (per-layout files added in PRs #1b + #7). |

**Modified files:**

| Path | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Add exports for the three new schemas. |
| `packages/db/migrations/meta/_journal.json` | Append entry for migration `0004_site_blocks_foundation` (drizzle-kit auto-modifies). |
| `packages/shared/src/features/types.ts` | Add new `hasSiteEditor`, `hasSitePolishBlocks`, `hasSiteCustomCss`, `hasSiteCustomDomain`, `hasSitePortfolioTemplates` to `CommunityFeatures`; add `siteAssetsQuotaBytes` to `PlanFeatureConfig`. |
| `packages/shared/src/features/plan-features.ts` | Set the new flags + quota per plan (Essentials/Pro/PM). |
| `scripts/verify-scoped-db-access.ts` | Allowlist additions: `apps/web/src/lib/db/public-community-reader.ts` may import from `@propertypro/db/unsafe`; new schema files exported from `@propertypro/db`. |
| `packages/db/src/index.ts` | Re-export new schema types. |

**Tests:**

| Path | Coverage |
|------|----------|
| `packages/shared/__tests__/site-blocks/hero.test.ts` | Happy path + each required field missing + each type mismatch. |
| `packages/shared/__tests__/site-blocks/text.test.ts` | Same pattern. |
| `packages/shared/__tests__/site-blocks/image.test.ts` | Same + alt-text-required + decorative-image edge case. |
| `packages/shared/__tests__/site-blocks/documents.test.ts` | Same + limit boundary (min 1, max 20) + default 5. |
| `packages/shared/__tests__/site-blocks/meetings.test.ts` | Same + default 10. |
| `packages/shared/__tests__/site-blocks/announcements.test.ts` | Same. |
| `packages/shared/__tests__/site-blocks/contact.test.ts` | Same. |
| `packages/shared/__tests__/site-blocks/registry-completeness.test.ts` | Every `BlockType` enum value has an entry in `blockSchemaRegistry` (runtime check). |
| `apps/web/__tests__/lib/db/public-community-reader.test.ts` | Helper returns a reader bound to the supplied communityId; reader methods are stubbed but type-correct. |
| `packages/shared/__tests__/features/plan-features-site.test.ts` | Each plan has the expected `hasSite*` defaults + correct `siteAssetsQuotaBytes`. |

---

## Task Overview

| # | Task | Files | Expected duration |
|---|------|-------|--------------------|
| 1 | Add the migration (partial unique index + CHECK + 3 tables + seed) | migration SQL, journal | 45m |
| 2 | Drizzle schema: `site_theme_presets` | schema + index + index.ts | 15m |
| 3 | Drizzle schema: `site_starter_packs` | schema + index | 15m |
| 4 | Drizzle schema: `site_layout_metadata` | schema + index | 15m |
| 5 | Block primitives (`types.ts`) | types | 15m |
| 6 | Hero block schema + tests | hero.ts + test | 25m |
| 7 | Text block schema + tests | text.ts + test | 15m |
| 8 | Image block schema + tests | image.ts + test | 25m |
| 9 | Documents SoR block schema + tests | documents.ts + test | 20m |
| 10 | Meetings SoR block schema + tests | meetings.ts + test | 15m |
| 11 | Announcements SoR block schema + tests | announcements.ts + test | 15m |
| 12 | Contact SoR block schema + tests | contact.ts + test | 15m |
| 13 | Block schema registry + completeness test | site-blocks/index.ts + test | 20m |
| 14 | Block renderer registry skeleton | blocks/types.ts + registry.ts | 15m |
| 15 | Layout registry skeleton | layouts/types.ts + registry.ts + README.md | 20m |
| 16 | `getPublicCommunityScopedReader` helper + tests | public-community-reader.ts + test | 30m |
| 17 | Feature flags + storage quota in `CommunityFeatures` | features/types.ts + plan-features.ts + test | 30m |
| 18 | CI guard allowlist update | verify-scoped-db-access.ts + sanity-check | 15m |
| 19 | Documentation landing pages | design-system/blocks/README.md + templates/README.md | 15m |
| 20 | Run full validation: typecheck, lint, tests, migrate, build | (no file changes) | 20m |

Total: ~6 hours (matches the spec's "~4d" estimate accounting for context-switching and review cycles).

---

### Task 1: Add the foundation migration

**Files:**
- Create: `packages/db/migrations/0004_site_blocks_foundation.sql`
- Modify: `packages/db/migrations/meta/_journal.json` (appended by `drizzle-kit generate` OR manually if writing the SQL by hand)

- [ ] **Step 1: Verify the next migration number is `0004`**

Run:
```bash
ls packages/db/migrations/*.sql | tail -1
cat packages/db/migrations/meta/_journal.json | python3 -c "import json, sys; print(json.load(sys.stdin)['entries'][-1]['idx'])"
```

Expected: last file is `0003_maintenance_unit_label.sql`; last idx is `3`. If anything else, this plan is out of date — `git fetch origin main && git diff origin/main -- packages/db/migrations/meta/_journal.json` to reconcile.

- [ ] **Step 2: Write the migration file**

Create `packages/db/migrations/0004_site_blocks_foundation.sql`:

```sql
-- Migration 0004: site_blocks foundation
--
-- (a) Replace the non-partial UNIQUE constraint on site_blocks with a partial
--     unique index that excludes soft-deleted rows. Required so the atomic
--     publish flow (Section 2.7 of the spec) can soft-delete published rows
--     and promote drafts in a single transaction without constraint violation.
--
-- (b) Extend the block_type CHECK constraint to include the 7 v1 block types.
--     The existing constraint only allows the old "jsx_template" + a few
--     other legacy types. (Note: jsx_template is retired in PR #9 — this
--     migration does NOT drop it yet, only adds the new ones.)
--
-- (c) Create three new platform-level tables (site_theme_presets,
--     site_starter_packs, site_layout_metadata). These are NOT tenant-
--     scoped — they're catalog data managed by platform admin.
--     AUTHZ: writes only from apps/admin/ under platform-admin auth;
--     reads from apps/web/ via createUnscopedClient() with documented
--     authorization contracts.
--
-- (d) Seed 3 layout metadata rows + 6 theme presets + 3 starter packs.

BEGIN;

-- (a) Partial unique index replaces the non-partial UNIQUE constraint
ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_community_order_draft_variant_unique;

CREATE UNIQUE INDEX site_blocks_community_order_draft_variant_partial
  ON site_blocks (community_id, block_order, is_draft, template_variant)
  WHERE deleted_at IS NULL;

-- (b) Extend block_type CHECK constraint
-- (note: the existing constraint name comes from migration 0033 in the archive;
-- if a CHECK named differently exists on this branch, run \d+ site_blocks to find it)
ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN (
    'jsx_template',     -- retained for v1; retired in PR #9
    'hero', 'text', 'image',
    'documents', 'meetings', 'announcements', 'contact'
  ));

-- (c) site_theme_presets
CREATE TABLE site_theme_presets (
  id            bigserial PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  description   text,
  tokens        jsonb NOT NULL,
  tier          text NOT NULL DEFAULT 'essentials'
    CHECK (tier IN ('essentials', 'professional', 'pm')),
  is_archived   boolean NOT NULL DEFAULT false,
  is_featured   boolean NOT NULL DEFAULT false,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_theme_presets IS
  'Platform-level theme bundles. NOT tenant-scoped. Admin-only writes from apps/admin/.';

-- (c) site_starter_packs
CREATE TABLE site_starter_packs (
  id              bigserial PRIMARY KEY,
  slug            text UNIQUE NOT NULL,
  display_name    text NOT NULL,
  community_type  text NOT NULL
    CHECK (community_type IN ('condo_718', 'hoa_720', 'apartment')),
  description     text,
  blocks          jsonb NOT NULL,
  version         integer NOT NULL DEFAULT 1,
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_starter_packs IS
  'Platform-level block-seed bundles applied at community creation. NOT tenant-scoped.';

-- (c) site_layout_metadata
CREATE TABLE site_layout_metadata (
  id                   bigserial PRIMARY KEY,
  slug                 text UNIQUE NOT NULL,
  display_name         text NOT NULL,
  tagline              text,
  description          text,
  tier                 text NOT NULL DEFAULT 'essentials'
    CHECK (tier IN ('essentials', 'professional', 'pm')),
  is_archived          boolean NOT NULL DEFAULT false,
  is_featured          boolean NOT NULL DEFAULT true,
  default_preset_slug  text REFERENCES site_theme_presets(slug),
  version              text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_layout_metadata IS
  'Platform-level catalog of code-shipped layouts. NOT tenant-scoped. Admin edits metadata only; layout code lives in apps/web/src/components/public-site/layouts/.';

-- (d) Seed 6 theme presets
INSERT INTO site_theme_presets (slug, display_name, description, tokens, tier, is_featured) VALUES
  ('bay-light', 'Bay Light',
   'Tidewater default — warm ivory ground, deep mineral teal ink, terracotta accent.',
   '{"primaryColor":"#0e3338","secondaryColor":"#f6f1e6","accentColor":"#c66f49","headingFont":"Fraunces","bodyFont":"Manrope"}'::jsonb,
   'essentials', true),
  ('midnight-coast', 'Midnight Coast',
   'Deep navy + sunlit ochre + seafoam — coastal evening palette.',
   '{"primaryColor":"#1f2a44","secondaryColor":"#f4ede1","accentColor":"#d68a2a","headingFont":"Newsreader","bodyFont":"Manrope"}'::jsonb,
   'essentials', true),
  ('palm-shadow', 'Palm Shadow',
   'Cream paper + midnight + seafoam — Boulevard layout''s default fit.',
   '{"primaryColor":"#1f2a44","secondaryColor":"#f4ede1","accentColor":"#a8c6b6","headingFont":"Newsreader","bodyFont":"Bricolage Grotesque"}'::jsonb,
   'essentials', true),
  ('linen-bronze', 'Linen Bronze',
   'Linen ground + oxidized bronze accent — Sable layout''s default fit.',
   '{"primaryColor":"#2b2a27","secondaryColor":"#ede8e0","accentColor":"#8c7355","headingFont":"Cormorant Garamond","bodyFont":"Manrope"}'::jsonb,
   'essentials', true),
  ('gulf-warm', 'Gulf Warm',
   'Warm sand + terracotta + deep teal — gulf-coast residential.',
   '{"primaryColor":"#0e3338","secondaryColor":"#dccdb1","accentColor":"#c66f49","headingFont":"Fraunces","bodyFont":"Manrope"}'::jsonb,
   'essentials', false),
  ('noir-coastal', 'Noir Coastal',
   'Charcoal-warm + pale stone + brass accent — refined evening register.',
   '{"primaryColor":"#2b2a27","secondaryColor":"#d4cbb6","accentColor":"#8c7355","headingFont":"Cormorant Garamond","bodyFont":"Manrope"}'::jsonb,
   'essentials', false);

-- (d) Seed 3 layout metadata rows (the actual React components ship in PR #1b and #7)
INSERT INTO site_layout_metadata (slug, display_name, tagline, description, tier, is_featured, default_preset_slug, version) VALUES
  ('tidewater', 'Tidewater', 'Coastal editorial · for the waterfront',
   'Coastal editorial. Golden-hour palette, Fraunces italic display set against warm ivory, hairline rules, dated entries laid out like a printed program. Best for waterfront condominium associations.',
   'essentials', true, 'bay-light', '1.0.0'),
  ('boulevard', 'Boulevard', 'Mid-century Floridian · for established HOAs',
   'Mid-century Floridian. MiMo architectural moods — bold geometry, seafoam + ochre, condensed sans display paired with Newsreader italic. Best for established HOAs and postwar communities.',
   'essentials', true, 'palm-shadow', '1.0.0'),
  ('sable', 'Sable', 'Refined contemporary · for newer-build communities',
   'Refined contemporary. Linen and oxidized bronze, Cormorant Garamond hairline italic, generous negative space. Best for newer-build communities and apartment portfolios.',
   'essentials', true, 'linen-bronze', '1.0.0');

-- (d) Seed 3 starter packs (block content is a placeholder skeleton; PR #5 replaces with real curated content)
INSERT INTO site_starter_packs (slug, display_name, community_type, description, blocks, version) VALUES
  ('florida-condo-v1', 'Florida Condo Starter', 'condo_718',
   'Default block set for §718-governed condominium associations.',
   '[
     {"blockType":"hero","blockOrder":1,"content":{"headline":"Welcome","subtitle":"A welcoming Florida community.","ctaText":"Resident Login","ctaTarget":"/auth/login"}},
     {"blockType":"announcements","blockOrder":2,"content":{"limit":5,"timeWindowDays":30}},
     {"blockType":"meetings","blockOrder":3,"content":{"limit":10,"timeWindowDays":30}},
     {"blockType":"documents","blockOrder":4,"content":{"limit":5,"includeCategories":["budget","minutes","financial"]}},
     {"blockType":"contact","blockOrder":5,"content":{"showBoard":true,"showManagement":true}}
   ]'::jsonb,
   1),
  ('florida-hoa-v1', 'Florida HOA Starter', 'hoa_720',
   'Default block set for §720-governed homeowners associations.',
   '[
     {"blockType":"hero","blockOrder":1,"content":{"headline":"Welcome","subtitle":"A welcoming Florida community.","ctaText":"Resident Login","ctaTarget":"/auth/login"}},
     {"blockType":"announcements","blockOrder":2,"content":{"limit":5,"timeWindowDays":30}},
     {"blockType":"meetings","blockOrder":3,"content":{"limit":10,"timeWindowDays":30}},
     {"blockType":"documents","blockOrder":4,"content":{"limit":5,"includeCategories":["budget","minutes","rules"]}},
     {"blockType":"contact","blockOrder":5,"content":{"showBoard":true,"showManagement":true}}
   ]'::jsonb,
   1),
  ('apartment-v1', 'Apartment Community Starter', 'apartment',
   'Default block set for apartment rental communities.',
   '[
     {"blockType":"hero","blockOrder":1,"content":{"headline":"Welcome","subtitle":"Your residence portal.","ctaText":"Resident Login","ctaTarget":"/auth/login"}},
     {"blockType":"announcements","blockOrder":2,"content":{"limit":5,"timeWindowDays":30}},
     {"blockType":"contact","blockOrder":3,"content":{"showBoard":false,"showManagement":true}}
   ]'::jsonb,
   1);

COMMIT;
```

- [ ] **Step 3: Append to the migration journal**

Modify `packages/db/migrations/meta/_journal.json`. The file is a JSON object with an `entries` array. Append a new entry copying the format of the existing entries:

```json
{
  "idx": 4,
  "version": "7",
  "when": <Unix timestamp in milliseconds at the time of PR creation>,
  "tag": "0004_site_blocks_foundation",
  "breakpoints": true
}
```

Get the timestamp with: `date +%s%3N` (Linux/macOS).

- [ ] **Step 4: Run the migration against a local Supabase**

Run:
```bash
pnpm --filter @propertypro/db db:migrate
```

Expected output: migration succeeds, prints `[+] migrations applied: 1`. No errors.

If the migration fails on the constraint drop because the constraint name differs on your branch, run `\d+ site_blocks` in psql to find the actual name and adjust the `DROP CONSTRAINT IF EXISTS` line.

- [ ] **Step 5: Verify the partial index exists**

Run in psql against your local Supabase:
```sql
\d+ site_blocks
```

Expected: a `site_blocks_community_order_draft_variant_partial` index appears with `Predicate: deleted_at IS NULL`. The original `site_blocks_community_order_draft_variant_unique` constraint should NOT appear.

- [ ] **Step 6: Verify seed data**

Run:
```sql
SELECT slug, display_name, tier FROM site_theme_presets ORDER BY slug;
SELECT slug, display_name FROM site_starter_packs ORDER BY slug;
SELECT slug, display_name, default_preset_slug FROM site_layout_metadata ORDER BY slug;
```

Expected: 6 preset rows, 3 starter rows, 3 layout rows. The `default_preset_slug` foreign keys all resolve.

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/0004_site_blocks_foundation.sql packages/db/migrations/meta/_journal.json
git commit -m "feat(db): site_blocks foundation migration (PR #1a · 1/20)

- Drop existing non-partial UNIQUE constraint on site_blocks; replace
  with partial unique index excluding soft-deleted rows. Required for
  the atomic publish flow.
- Extend block_type CHECK constraint to include hero/text/image and
  the 4 SoR block types.
- Create site_theme_presets, site_starter_packs, site_layout_metadata
  platform-level tables (NOT tenant-scoped — admin-only writes).
- Seed 6 theme presets, 3 layout metadata rows, 3 starter packs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Drizzle schema for `site_theme_presets`

**Files:**
- Create: `packages/db/src/schema/site-theme-presets.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/db/src/schema/site-theme-presets.ts`:

```typescript
/**
 * Site theme presets — platform-level catalog of theme token bundles.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/ under
 * platform-admin auth. Reads from apps/web/ via createUnscopedClient()
 * with a documented authorization contract.
 */
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const siteThemePresets = pgTable('site_theme_presets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  tokens: jsonb('tokens').notNull(),
  tier: text('tier').notNull().default('essentials'),
  isArchived: boolean('is_archived').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiteThemePreset = typeof siteThemePresets.$inferSelect;
export type NewSiteThemePreset = typeof siteThemePresets.$inferInsert;

/**
 * Tokens jsonb shape — kept loose at the DB layer; validated at the
 * application layer (see packages/theme/src/types.ts for the typed shape).
 */
export interface ThemePresetTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}
```

- [ ] **Step 2: Export the schema from `index.ts`**

Modify `packages/db/src/schema/index.ts`. Find the section that imports `siteBlocks` (around line 130 per my exploration). Add the new import next to it:

```typescript
import type { siteThemePresets } from './site-theme-presets';
```

And in the type-export section (around line 341):

```typescript
export type SiteThemePreset = typeof siteThemePresets.$inferSelect;
export type NewSiteThemePreset = typeof siteThemePresets.$inferInsert;
```

Also add the table re-export so application code can import via `from '@propertypro/db'`:

```typescript
export { siteThemePresets, type ThemePresetTokens } from './site-theme-presets';
```

- [ ] **Step 3: Verify the schema typechecks**

Run:
```bash
pnpm --filter @propertypro/db typecheck
```

Expected: no errors. If the index.ts location of imports/exports doesn't match exactly, search for the existing `siteBlocks` references and place your new ones adjacent.

- [ ] **Step 4: Verify drizzle-kit can pull a snapshot without diff**

Run:
```bash
pnpm --filter @propertypro/db exec drizzle-kit check
```

Expected: "Everything's fine" — no schema drift detected. The migration in Task 1 already created the table; the Drizzle schema now matches.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/site-theme-presets.ts packages/db/src/schema/index.ts
git commit -m "feat(db): Drizzle schema for site_theme_presets (PR #1a · 2/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Drizzle schema for `site_starter_packs`

**Files:**
- Create: `packages/db/src/schema/site-starter-packs.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/db/src/schema/site-starter-packs.ts`:

```typescript
/**
 * Site starter packs — platform-level catalog of block-seed bundles.
 * Applied during community creation to populate the initial site.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/.
 * Reads from apps/web/ via createUnscopedClient().
 */
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const siteStarterPacks = pgTable('site_starter_packs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  communityType: text('community_type').notNull(),
  description: text('description'),
  blocks: jsonb('blocks').notNull(),
  version: integer('version').notNull().default(1),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiteStarterPack = typeof siteStarterPacks.$inferSelect;
export type NewSiteStarterPack = typeof siteStarterPacks.$inferInsert;

/**
 * Starter pack blocks jsonb shape — array of (blockType, blockOrder, content) tuples.
 * The content shape is validated against the matching block schema at apply-time
 * (see packages/shared/src/site-blocks/).
 */
export interface StarterPackBlock {
  blockType: string;
  blockOrder: number;
  content: Record<string, unknown>;
}
```

- [ ] **Step 2: Export from `index.ts`**

Add to `packages/db/src/schema/index.ts`:

```typescript
import type { siteStarterPacks } from './site-starter-packs';

export type SiteStarterPack = typeof siteStarterPacks.$inferSelect;
export type NewSiteStarterPack = typeof siteStarterPacks.$inferInsert;

export { siteStarterPacks, type StarterPackBlock } from './site-starter-packs';
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @propertypro/db typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/site-starter-packs.ts packages/db/src/schema/index.ts
git commit -m "feat(db): Drizzle schema for site_starter_packs (PR #1a · 3/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Drizzle schema for `site_layout_metadata`

**Files:**
- Create: `packages/db/src/schema/site-layout-metadata.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/db/src/schema/site-layout-metadata.ts`:

```typescript
/**
 * Site layout metadata — platform-level catalog row per code-shipped layout.
 * Admins edit the metadata fields (display name, tier, featured, etc.);
 * the layout code itself lives in apps/web/src/components/public-site/layouts/
 * and ships via PR.
 *
 * AUTHZ: NOT tenant-scoped. Admin-only writes from apps/admin/.
 */
import {
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const siteLayoutMetadata = pgTable('site_layout_metadata', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  tagline: text('tagline'),
  description: text('description'),
  tier: text('tier').notNull().default('essentials'),
  isArchived: boolean('is_archived').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(true),
  defaultPresetSlug: text('default_preset_slug'),
  version: text('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiteLayoutMetadata = typeof siteLayoutMetadata.$inferSelect;
export type NewSiteLayoutMetadata = typeof siteLayoutMetadata.$inferInsert;
```

- [ ] **Step 2: Export from `index.ts`**

Add to `packages/db/src/schema/index.ts`:

```typescript
import type { siteLayoutMetadata } from './site-layout-metadata';

export type SiteLayoutMetadata = typeof siteLayoutMetadata.$inferSelect;
export type NewSiteLayoutMetadata = typeof siteLayoutMetadata.$inferInsert;

export { siteLayoutMetadata } from './site-layout-metadata';
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @propertypro/db typecheck && pnpm --filter @propertypro/db exec drizzle-kit check
```

Expected: no errors; no schema drift.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/site-layout-metadata.ts packages/db/src/schema/index.ts
git commit -m "feat(db): Drizzle schema for site_layout_metadata (PR #1a · 4/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Block primitives (shared types)

**Files:**
- Create: `packages/shared/src/site-blocks/types.ts`

- [ ] **Step 1: Create the primitives file**

Create `packages/shared/src/site-blocks/types.ts`:

```typescript
/**
 * Block type primitives — shared Zod fragments + the BlockType union.
 *
 * Each block type's content schema lives in its own file in this directory
 * (e.g., ./hero.ts). The registry at ./index.ts wires them together.
 */
import { z } from 'zod';

/** The 7 v1 block types. PR #10 adds 'faq' | 'gallery' | 'amenities'. */
export const BLOCK_TYPES = [
  'hero',
  'text',
  'image',
  'documents',
  'meetings',
  'announcements',
  'contact',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/** Supabase Storage path for site assets. */
export const imagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\d+\/(logo|hero|content)\/[a-zA-Z0-9._/-]+$/, {
    message: 'Must be a path under {community_id}/{kind}/...',
  });

/** Alt text — required for non-decorative images. */
export const altTextSchema = z.string().min(1).max(200);

/** Common CTA target — internal path or external URL (https only). */
export const ctaTargetSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) => v.startsWith('/') || v.startsWith('https://'),
    'CTA target must be an internal path (starting with /) or an https URL',
  );

/** SoR block configuration limits used across documents/meetings/announcements. */
export const sorLimitSchema = z.number().int().min(1).max(20);
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @propertypro/shared typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/site-blocks/types.ts
git commit -m "feat(shared): block primitives — BlockType union + shared Zod fragments (PR #1a · 5/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hero block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/hero.ts`
- Create: `packages/shared/__tests__/site-blocks/hero.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/hero.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { heroBlockSchema, type HeroBlockContent } from '../../src/site-blocks/hero';

describe('heroBlockSchema', () => {
  const valid: HeroBlockContent = {
    headline: 'Welcome to Sunset Condos',
    subtitle: 'A welcoming Florida community since 1987.',
    ctaText: 'Resident Login',
    ctaTarget: '/auth/login',
  };

  it('accepts a minimally valid hero', () => {
    const minimal = { headline: 'Welcome' };
    expect(heroBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a fully-populated hero', () => {
    expect(heroBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when headline is missing', () => {
    const { headline: _, ...withoutHeadline } = valid;
    const result = heroBlockSchema.safeParse(withoutHeadline);
    expect(result.success).toBe(false);
  });

  it('rejects when headline is empty', () => {
    const result = heroBlockSchema.safeParse({ ...valid, headline: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when headline exceeds 120 chars', () => {
    const result = heroBlockSchema.safeParse({ ...valid, headline: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });

  it('rejects when subtitle exceeds 280 chars', () => {
    const result = heroBlockSchema.safeParse({ ...valid, subtitle: 'a'.repeat(281) });
    expect(result.success).toBe(false);
  });

  it('rejects ctaTarget with non-https scheme', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: 'http://evil.com' });
    expect(result.success).toBe(false);
  });

  it('accepts ctaTarget as internal path', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '/auth/login' });
    expect(result.success).toBe(true);
  });

  it('accepts ctaTarget as https URL', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: 'https://example.com/portal' });
    expect(result.success).toBe(true);
  });

  it('rejects when ctaText is provided without ctaTarget', () => {
    const result = heroBlockSchema.safeParse({ headline: 'X', ctaText: 'Click' });
    expect(result.success).toBe(false);
  });

  it('rejects when ctaTarget is provided without ctaText', () => {
    const result = heroBlockSchema.safeParse({ headline: 'X', ctaTarget: '/x' });
    expect(result.success).toBe(false);
  });

  it('accepts a hero image path with required alt text', () => {
    const withImage = { ...valid, heroImagePath: '42/hero/abc-def.webp', heroImageAlt: 'The building at sunset' };
    expect(heroBlockSchema.safeParse(withImage).success).toBe(true);
  });

  it('rejects a hero image path without alt text', () => {
    const result = heroBlockSchema.safeParse({ ...valid, heroImagePath: '42/hero/abc.webp' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/hero.test.ts
```

Expected: ALL tests fail with module-not-found (`heroBlockSchema` not exported / file does not exist).

- [ ] **Step 3: Implement `hero.ts`**

Create `packages/shared/src/site-blocks/hero.ts`:

```typescript
/**
 * Hero block — PM-authored welcome panel with headline, optional subtitle,
 * optional CTA, optional hero image (with required alt text).
 *
 * Rendered first on every public site; carries the strongest visual weight.
 */
import { z } from 'zod';
import { altTextSchema, ctaTargetSchema, imagePathSchema } from './types';

export const heroBlockSchema = z
  .object({
    headline: z.string().min(1).max(120),
    subtitle: z.string().min(1).max(280).optional(),
    ctaText: z.string().min(1).max(40).optional(),
    ctaTarget: ctaTargetSchema.optional(),
    heroImagePath: imagePathSchema.optional(),
    heroImageAlt: altTextSchema.optional(),
  })
  .strict()
  .refine(
    (data) => (data.ctaText == null) === (data.ctaTarget == null),
    { message: 'ctaText and ctaTarget must both be present or both absent.' },
  )
  .refine(
    (data) => (data.heroImagePath == null) || (data.heroImageAlt != null),
    { message: 'heroImageAlt is required when heroImagePath is set.' },
  );

export type HeroBlockContent = z.infer<typeof heroBlockSchema>;
```

- [ ] **Step 4: Run the test, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/hero.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/hero.ts packages/shared/__tests__/site-blocks/hero.test.ts
git commit -m "feat(shared): hero block schema + tests (PR #1a · 6/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Text block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/text.ts`
- Create: `packages/shared/__tests__/site-blocks/text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/text.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { textBlockSchema, type TextBlockContent } from '../../src/site-blocks/text';

describe('textBlockSchema', () => {
  const valid: TextBlockContent = {
    heading: 'About Our Community',
    body: 'We are a 412-residence association on the gulf coast.',
  };

  it('accepts a valid text block', () => {
    expect(textBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a text block without heading', () => {
    const result = textBlockSchema.safeParse({ body: 'Just the body.' });
    expect(result.success).toBe(true);
  });

  it('rejects when body is missing', () => {
    const result = textBlockSchema.safeParse({ heading: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects when body is empty', () => {
    const result = textBlockSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when body exceeds 2000 chars', () => {
    const result = textBlockSchema.safeParse({ body: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects when heading exceeds 120 chars', () => {
    const result = textBlockSchema.safeParse({ ...valid, heading: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = textBlockSchema.safeParse({ ...valid, htmlBody: '<script>alert(1)</script>' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/text.test.ts
```

Expected: all tests fail.

- [ ] **Step 3: Implement `text.ts`**

Create `packages/shared/src/site-blocks/text.ts`:

```typescript
/**
 * Text block — plain-text body with optional heading. No HTML, no markdown.
 * Sanitization-free by construction.
 */
import { z } from 'zod';

export const textBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    body: z.string().min(1).max(2000),
  })
  .strict();

export type TextBlockContent = z.infer<typeof textBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/text.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/text.ts packages/shared/__tests__/site-blocks/text.test.ts
git commit -m "feat(shared): text block schema + tests (PR #1a · 7/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Image block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/image.ts`
- Create: `packages/shared/__tests__/site-blocks/image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/image.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { imageBlockSchema, type ImageBlockContent } from '../../src/site-blocks/image';

describe('imageBlockSchema', () => {
  const valid: ImageBlockContent = {
    imagePath: '42/content/abc-pool.webp',
    altText: 'The pool deck at golden hour',
    caption: 'Renovated 2024.',
  };

  it('accepts a valid image block', () => {
    expect(imageBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when imagePath is missing', () => {
    const result = imageBlockSchema.safeParse({ altText: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects when altText is missing (non-decorative)', () => {
    const result = imageBlockSchema.safeParse({ imagePath: '42/content/x.webp' });
    expect(result.success).toBe(false);
  });

  it('allows explicit decorative image (no alt text required)', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '42/content/divider.webp',
      decorative: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when decorative is true AND altText is set', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '42/content/x.webp',
      decorative: true,
      altText: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an imagePath outside the expected community path layout', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: '../../../etc/passwd',
      altText: 'evil',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an imagePath with absolute scheme', () => {
    const result = imageBlockSchema.safeParse({
      imagePath: 'https://evil.com/x.webp',
      altText: 'evil',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when caption exceeds 200 chars', () => {
    const result = imageBlockSchema.safeParse({ ...valid, caption: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/image.test.ts
```

Expected: all tests fail.

- [ ] **Step 3: Implement `image.ts`**

Create `packages/shared/src/site-blocks/image.ts`:

```typescript
/**
 * Image block — single image with required alt text (unless explicitly decorative).
 * Path must conform to the {community_id}/{kind}/... Supabase Storage layout.
 */
import { z } from 'zod';
import { altTextSchema, imagePathSchema } from './types';

export const imageBlockSchema = z
  .object({
    imagePath: imagePathSchema,
    altText: altTextSchema.optional(),
    decorative: z.literal(true).optional(),
    caption: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Either decorative=true (and no alt) OR altText provided (and no decorative flag).
      if (data.decorative === true) return data.altText == null;
      return data.altText != null;
    },
    {
      message:
        'altText is required unless decorative:true is set. decorative:true and altText cannot coexist.',
    },
  );

export type ImageBlockContent = z.infer<typeof imageBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/image.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/image.ts packages/shared/__tests__/site-blocks/image.test.ts
git commit -m "feat(shared): image block schema + tests (PR #1a · 8/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documents SoR block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/documents.ts`
- Create: `packages/shared/__tests__/site-blocks/documents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/documents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { documentsBlockSchema, type DocumentsBlockContent } from '../../src/site-blocks/documents';

describe('documentsBlockSchema', () => {
  it('accepts an empty config (defaults apply)', () => {
    const result = documentsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });

  it('accepts a limit of 1', () => {
    expect(documentsBlockSchema.safeParse({ limit: 1 }).success).toBe(true);
  });

  it('accepts a limit of 20', () => {
    expect(documentsBlockSchema.safeParse({ limit: 20 }).success).toBe(true);
  });

  it('rejects a limit of 0', () => {
    expect(documentsBlockSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects a limit of 21', () => {
    expect(documentsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(documentsBlockSchema.safeParse({ limit: 5.5 }).success).toBe(false);
  });

  it('accepts an empty includeCategories array', () => {
    expect(documentsBlockSchema.safeParse({ includeCategories: [] }).success).toBe(true);
  });

  it('accepts known category names', () => {
    const config: DocumentsBlockContent = {
      includeCategories: ['budget', 'minutes', 'financial', 'rules', 'other'],
    };
    expect(documentsBlockSchema.safeParse(config).success).toBe(true);
  });

  it('rejects unknown category names', () => {
    const result = documentsBlockSchema.safeParse({ includeCategories: ['budgett'] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = documentsBlockSchema.safeParse({ communityId: 1 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/documents.test.ts
```

Expected: all tests fail.

- [ ] **Step 3: Implement `documents.ts`**

Create `packages/shared/src/site-blocks/documents.ts`:

```typescript
/**
 * Documents SoR block — configuration only. The renderer reads from the
 * documents table at render time, filtered to public_access=true.
 */
import { z } from 'zod';
import { sorLimitSchema } from './types';

const documentCategorySchema = z.enum([
  'budget',
  'minutes',
  'financial',
  'rules',
  'other',
]);

export const documentsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    includeCategories: z.array(documentCategorySchema).optional(),
  })
  .strict();

export type DocumentsBlockContent = z.infer<typeof documentsBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/documents.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/documents.ts packages/shared/__tests__/site-blocks/documents.test.ts
git commit -m "feat(shared): documents SoR block schema + tests (PR #1a · 9/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Meetings SoR block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/meetings.ts`
- Create: `packages/shared/__tests__/site-blocks/meetings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/meetings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { meetingsBlockSchema } from '../../src/site-blocks/meetings';

describe('meetingsBlockSchema', () => {
  it('defaults limit to 10 and timeWindowDays to 30', () => {
    const result = meetingsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.timeWindowDays).toBe(30);
    }
  });

  it('accepts limit 1-20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ limit: 20 }).success).toBe(true);
  });

  it('rejects limit > 20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('accepts timeWindowDays 1-365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 365 }).success).toBe(true);
  });

  it('rejects timeWindowDays > 365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 366 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(meetingsBlockSchema.safeParse({ includeCancelled: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/meetings.test.ts
```

- [ ] **Step 3: Implement `meetings.ts`**

Create `packages/shared/src/site-blocks/meetings.ts`:

```typescript
/**
 * Meetings SoR block — configuration only. The renderer reads upcoming
 * meetings from the meetings table at render time, filtered by time window.
 */
import { z } from 'zod';
import { sorLimitSchema } from './types';

export const meetingsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(10),
    timeWindowDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();

export type MeetingsBlockContent = z.infer<typeof meetingsBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/meetings.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/meetings.ts packages/shared/__tests__/site-blocks/meetings.test.ts
git commit -m "feat(shared): meetings SoR block schema + tests (PR #1a · 10/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Announcements SoR block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/announcements.ts`
- Create: `packages/shared/__tests__/site-blocks/announcements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/announcements.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { announcementsBlockSchema } from '../../src/site-blocks/announcements';

describe('announcementsBlockSchema', () => {
  it('defaults to limit 5, timeWindowDays 30', () => {
    const result = announcementsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
      expect(result.data.timeWindowDays).toBe(30);
    }
  });

  it('rejects limit 0', () => {
    expect(announcementsBlockSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit 21', () => {
    expect(announcementsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('rejects timeWindowDays 0', () => {
    expect(announcementsBlockSchema.safeParse({ timeWindowDays: 0 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(announcementsBlockSchema.safeParse({ pinnedOnly: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/announcements.test.ts
```

- [ ] **Step 3: Implement `announcements.ts`**

Create `packages/shared/src/site-blocks/announcements.ts`:

```typescript
/**
 * Announcements SoR block — configuration only. Renderer pulls published,
 * non-expired announcements from the announcements table at render time.
 */
import { z } from 'zod';
import { sorLimitSchema } from './types';

export const announcementsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    timeWindowDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();

export type AnnouncementsBlockContent = z.infer<typeof announcementsBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/announcements.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/announcements.ts packages/shared/__tests__/site-blocks/announcements.test.ts
git commit -m "feat(shared): announcements SoR block schema + tests (PR #1a · 11/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Contact SoR block schema + tests

**Files:**
- Create: `packages/shared/src/site-blocks/contact.ts`
- Create: `packages/shared/__tests__/site-blocks/contact.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/contact.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { contactBlockSchema } from '../../src/site-blocks/contact';

describe('contactBlockSchema', () => {
  it('defaults to showBoard:true and showManagement:true', () => {
    const result = contactBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showBoard).toBe(true);
      expect(result.data.showManagement).toBe(true);
    }
  });

  it('accepts both flags false (renders nothing, but valid config)', () => {
    expect(contactBlockSchema.safeParse({ showBoard: false, showManagement: false }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(contactBlockSchema.safeParse({ showBoard: true, includeOwners: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/contact.test.ts
```

- [ ] **Step 3: Implement `contact.ts`**

Create `packages/shared/src/site-blocks/contact.ts`:

```typescript
/**
 * Contact SoR block — configuration only. Renderer assembles the contact
 * block from the community row + board member rows + management contact
 * rows at render time.
 */
import { z } from 'zod';

export const contactBlockSchema = z
  .object({
    showBoard: z.boolean().default(true),
    showManagement: z.boolean().default(true),
  })
  .strict();

export type ContactBlockContent = z.infer<typeof contactBlockSchema>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/contact.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/contact.ts packages/shared/__tests__/site-blocks/contact.test.ts
git commit -m "feat(shared): contact SoR block schema + tests (PR #1a · 12/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Block schema registry + completeness test

**Files:**
- Create: `packages/shared/src/site-blocks/index.ts`
- Create: `packages/shared/__tests__/site-blocks/registry-completeness.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export the site-blocks namespace)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/site-blocks/registry-completeness.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, blockSchemaRegistry } from '../../src/site-blocks';

describe('blockSchemaRegistry', () => {
  it('has an entry for every BlockType', () => {
    for (const blockType of BLOCK_TYPES) {
      expect(blockSchemaRegistry[blockType]).toBeDefined();
    }
  });

  it('has no extra entries beyond BlockType', () => {
    const registryKeys = Object.keys(blockSchemaRegistry);
    expect(registryKeys.sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it('each registry entry is a valid Zod schema (has safeParse)', () => {
    for (const blockType of BLOCK_TYPES) {
      const schema = blockSchemaRegistry[blockType];
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/registry-completeness.test.ts
```

Expected: tests fail (registry not exported).

- [ ] **Step 3: Implement the registry**

Create `packages/shared/src/site-blocks/index.ts`:

```typescript
/**
 * Block schema registry — single source of truth mapping BlockType to its
 * Zod content schema. Used at:
 *   - read time: validate block.content before render (skip + Sentry on fail)
 *   - write time: validate PM-submitted block content at the editor API
 *   - test time: registry-completeness assertion
 */
import type { z } from 'zod';
import { BLOCK_TYPES, type BlockType } from './types';
import { heroBlockSchema } from './hero';
import { textBlockSchema } from './text';
import { imageBlockSchema } from './image';
import { documentsBlockSchema } from './documents';
import { meetingsBlockSchema } from './meetings';
import { announcementsBlockSchema } from './announcements';
import { contactBlockSchema } from './contact';

export const blockSchemaRegistry = {
  hero: heroBlockSchema,
  text: textBlockSchema,
  image: imageBlockSchema,
  documents: documentsBlockSchema,
  meetings: meetingsBlockSchema,
  announcements: announcementsBlockSchema,
  contact: contactBlockSchema,
} satisfies Record<BlockType, z.ZodType>;

export { BLOCK_TYPES, blockTypeSchema } from './types';
export type { BlockType } from './types';
export { heroBlockSchema, type HeroBlockContent } from './hero';
export { textBlockSchema, type TextBlockContent } from './text';
export { imageBlockSchema, type ImageBlockContent } from './image';
export { documentsBlockSchema, type DocumentsBlockContent } from './documents';
export { meetingsBlockSchema, type MeetingsBlockContent } from './meetings';
export { announcementsBlockSchema, type AnnouncementsBlockContent } from './announcements';
export { contactBlockSchema, type ContactBlockContent } from './contact';
```

- [ ] **Step 4: Re-export from the top-level shared package**

Open `packages/shared/src/index.ts` and add (place near other domain re-exports):

```typescript
export * as siteBlocks from './site-blocks';
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/registry-completeness.test.ts
pnpm --filter @propertypro/shared typecheck
```

Expected: 3 tests pass; no typecheck errors. If TypeScript complains the `satisfies` constraint fails, check that every schema's `z.infer<typeof X>` is a valid content shape (no never types).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/site-blocks/index.ts packages/shared/__tests__/site-blocks/registry-completeness.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): block schema registry + completeness test (PR #1a · 13/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Block renderer registry skeleton

**Files:**
- Create: `apps/web/src/components/public-site/blocks/types.ts`
- Create: `apps/web/src/components/public-site/blocks/registry.ts`

- [ ] **Step 1: Create the renderer prop types**

Create `apps/web/src/components/public-site/blocks/types.ts`:

```typescript
/**
 * Block renderer prop types. Each block renderer is a server component
 * accepting these props and returning JSX.
 *
 * The block.content type is widened to unknown here — the registry consumer
 * narrows it per-renderer via the schema registry's safeParse before passing
 * the validated content into the renderer.
 */
import type { ReactNode } from 'react';
import type { BlockType } from '@propertypro/shared/site-blocks';

export interface PublicCommunity {
  id: number;
  slug: string;
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  timezone: string;
}

export interface ResolvedTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}

export type LayoutId = 'tidewater' | 'boulevard' | 'sable';

export interface BlockRendererProps<TContent = unknown> {
  block: {
    id: number;
    blockType: BlockType;
    blockOrder: number;
    content: TContent;
  };
  community: PublicCommunity;
  theme: ResolvedTheme;
  layout: LayoutId;
}

/** A block renderer is a React server component. */
export type BlockRenderer<TContent = unknown> = (
  props: BlockRendererProps<TContent>,
) => Promise<ReactNode> | ReactNode;
```

- [ ] **Step 2: Create the empty registry**

Create `apps/web/src/components/public-site/blocks/registry.ts`:

```typescript
/**
 * Block renderer registry — maps BlockType to its React server component.
 *
 * Empty in PR #1a. Populated incrementally:
 *   - PR #1b: hero
 *   - PR #2: text, image
 *   - PR #3: announcements
 *   - PR #4: documents, meetings, contact
 *
 * Once a block type has both a schema entry AND a renderer entry, it is
 * "live" — the page renderer in PR #1b+ uses the registry to dispatch.
 *
 * Unknown block types in a community's site_blocks row are skipped at
 * render time with a Sentry warning (block-type-missing-renderer).
 */
import type { BlockType } from '@propertypro/shared/site-blocks';
import type { BlockRenderer } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer<any>>> = {
  // populated in PR #1b and beyond
};

/**
 * Returns true if a renderer is registered for the given block type.
 */
export function hasRenderer(blockType: BlockType): boolean {
  return blockType in blockRendererRegistry;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: no errors. The `Partial<Record<...>>` allows the registry to be empty in 1a; PRs that add renderers will narrow this to required entries when the type is firmed up.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/public-site/blocks/types.ts apps/web/src/components/public-site/blocks/registry.ts
git commit -m "feat(web): block renderer registry skeleton (PR #1a · 14/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Layout registry skeleton

**Files:**
- Create: `apps/web/src/components/public-site/layouts/types.ts`
- Create: `apps/web/src/components/public-site/layouts/registry.ts`
- Create: `apps/web/src/components/public-site/layouts/README.md`

- [ ] **Step 1: Create the layout types**

Create `apps/web/src/components/public-site/layouts/types.ts`:

```typescript
/**
 * Layout component prop types and the LayoutId union.
 *
 * A layout component owns the page chrome (header, footer, hero treatment,
 * section spacing, typography rhythm) and renders an ordered list of blocks
 * via the block renderer registry.
 */
import type { ReactNode } from 'react';
import type { PublicCommunity, ResolvedTheme, LayoutId } from '../blocks/types';

export type { LayoutId };

export interface SiteBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

export interface LayoutProps {
  community: PublicCommunity;
  theme: ResolvedTheme;
  blocks: SiteBlock[];
}

export type LayoutComponent = (
  props: LayoutProps,
) => Promise<ReactNode> | ReactNode;
```

- [ ] **Step 2: Create the layout registry**

Create `apps/web/src/components/public-site/layouts/registry.ts`:

```typescript
/**
 * Layout component registry — maps LayoutId to the React server component
 * that renders the page for that layout.
 *
 * Empty in PR #1a. Populated:
 *   - PR #1b: tidewater
 *   - PR #7: boulevard, sable
 *
 * The default layout for a community is resolved from
 * communities.branding.layoutId; if no entry exists, falls back to
 * community_type → layout default (condo_718 → tidewater, etc.).
 */
import type { LayoutId, LayoutComponent } from './types';

export const layoutRegistry: Partial<Record<LayoutId, LayoutComponent>> = {
  // populated in PR #1b and beyond
};

/**
 * Returns the layout component for the given id, or undefined if the
 * layout is not yet implemented. Callers must handle the undefined case
 * (typically by falling back to the hardcoded current renderer in PR #1a;
 * after PR #1b lands, by falling back to tidewater).
 */
export function getLayout(id: LayoutId): LayoutComponent | undefined {
  return layoutRegistry[id];
}
```

- [ ] **Step 3: Create the engineer README**

Create `apps/web/src/components/public-site/layouts/README.md`:

```markdown
# Public-Site Layouts

Layouts own the page chrome of public community sites. Three ship in v1:

| Slug      | File             | Brand fit                                                                                  |
|-----------|------------------|--------------------------------------------------------------------------------------------|
| tidewater | `Tidewater.tsx`  | Coastal editorial — golden-hour palette, Fraunces italic display, hairline rules.          |
| boulevard | `Boulevard.tsx`  | Mid-century Floridian — MiMo geometry, Newsreader italic, ochre accents.                   |
| sable     | `Sable.tsx`      | Refined contemporary — linen and oxidized bronze, Cormorant Garamond hairline italic.      |

## Architecture

- A layout is a **React server component** with `LayoutProps`: `community`, `theme`, `blocks`.
- The layout owns: header, footer, hero treatment, section wrapping, typography stack.
- The layout DOES NOT own: per-block content. It iterates `blocks` and dispatches each via the block renderer registry.
- All v1 layouts must be server components — no client islands except where genuinely required (e.g., the future calendar widget in MeetingsBlock).

## Adding a new layout

1. Create `<LayoutName>.tsx` in this directory. Use the existing layouts as references for typography and spacing rhythm.
2. Register the layout in `./registry.ts`.
3. Add a metadata row via migration: `INSERT INTO site_layout_metadata (slug, display_name, ...) VALUES (...)`.
4. Document the layout's design intent at `docs/design-system/templates/<slug>.md`.
5. Add a layout integration test under `apps/web/__tests__/public-site/layouts/<slug>.test.tsx`.

## Constraints

- Tokens MUST be consumed via CSS variables (`var(--theme-primary)`, `var(--theme-secondary)`, ...) — never hardcoded hex.
- Body text MUST be ≥ 16px (per `.claude/rules/design.md`).
- All interactive elements MUST show `:focus-visible` (never suppress).
- Heading hierarchy MUST be valid (one `<h1>`, then descending).
- Image alt text comes from the block content; layouts do not generate alt text themselves.

## What layouts are not

- Layouts are NOT customer-authorable. PMs pick from the registry; they cannot upload custom layouts.
- Layouts are NOT skinned via custom CSS in v1. Pro+ custom CSS overrides apply only to token values, not layout structure (Section 11 PR scope).
- Layouts are NOT compiled at runtime. They ship as code in this directory; the platform-admin panel only edits metadata.
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/public-site/layouts/types.ts apps/web/src/components/public-site/layouts/registry.ts apps/web/src/components/public-site/layouts/README.md
git commit -m "feat(web): layout registry skeleton + engineer README (PR #1a · 15/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: `getPublicCommunityScopedReader` helper + tests

**Files:**
- Create: `apps/web/src/lib/db/public-community-reader.ts`
- Create: `apps/web/__tests__/lib/db/public-community-reader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/lib/db/public-community-reader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unscoped client BEFORE importing the helper
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  // Terminal — returns a Promise of an array
  then: vi.fn((resolve) => Promise.resolve([]).then(resolve)),
};

const mockDb = {
  select: vi.fn(() => mockSelectChain),
};

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

import { getPublicCommunityScopedReader } from '../../../src/lib/db/public-community-reader';

describe('getPublicCommunityScopedReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a reader bound to the supplied communityId', () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(reader).toBeDefined();
    expect(reader.communityId).toBe(42);
  });

  it('exposes stubbed listSiteBlocks method', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listSiteBlocks).toBe('function');
  });

  it('exposes stubbed listDocuments method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listDocuments).toBe('function');
  });

  it('exposes stubbed listMeetings method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listMeetings).toBe('function');
  });

  it('exposes stubbed listAnnouncements method (real impl in PR #3)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listAnnouncements).toBe('function');
  });

  it('exposes stubbed getContactInfo method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.getContactInfo).toBe('function');
  });

  it('rejects non-positive communityId', () => {
    expect(() => getPublicCommunityScopedReader(0)).toThrow();
    expect(() => getPublicCommunityScopedReader(-1)).toThrow();
    expect(() => getPublicCommunityScopedReader(1.5)).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter web exec vitest run __tests__/lib/db/public-community-reader.test.ts
```

Expected: tests fail (module not found).

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/db/public-community-reader.ts`:

```typescript
/**
 * Public-site community reader.
 *
 * AUTHZ: The public site at `/_site` runs UNAUTHENTICATED. There is no
 * session, no TenantContext, so `createScopedClient()` would throw
 * TenantContextMissing. This helper wraps `createUnscopedClient()` with
 * explicit community_id + deletedAt predicates on every read.
 *
 * The caller (the public-site page) MUST have already validated the
 * communityId via the middleware-injected `x-community-id` header before
 * invoking this helper. Do NOT call this from any authenticated route —
 * use `createScopedClient(communityId)` from `@propertypro/db` instead.
 *
 * In PR #1a, the read methods are stubbed (return empty arrays / null).
 * Real implementations land in subsequent PRs:
 *   - PR #1b: listSiteBlocks (drives the page render)
 *   - PR #3: listAnnouncements
 *   - PR #4: listDocuments, listMeetings, getContactInfo
 */
import { siteBlocks } from '@propertypro/db';
// AUTHZ: Public-site reader — unauthenticated context, no TenantContext available.
// Every method below applies an explicit community_id predicate.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, asc, eq, isNull } from '@propertypro/db/filters';

export interface PublicSiteBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

export interface PublicScopedReader {
  readonly communityId: number;

  /** Returns the community's published, non-deleted site blocks in order. */
  listSiteBlocks(): Promise<PublicSiteBlock[]>;

  /** PR #3 — published, non-expired announcements. Stubbed: returns []. */
  listAnnouncements(opts: { limit: number; timeWindowDays: number }): Promise<unknown[]>;

  /** PR #4 — public-access documents. Stubbed: returns []. */
  listDocuments(opts: { limit: number; includeCategories?: string[] }): Promise<unknown[]>;

  /** PR #4 — upcoming meetings within window. Stubbed: returns []. */
  listMeetings(opts: { limit: number; timeWindowDays: number }): Promise<unknown[]>;

  /** PR #4 — community + board + management contact. Stubbed: returns null. */
  getContactInfo(opts: { showBoard: boolean; showManagement: boolean }): Promise<unknown | null>;
}

export function getPublicCommunityScopedReader(communityId: number): PublicScopedReader {
  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(
      `getPublicCommunityScopedReader: communityId must be a positive integer; got ${communityId}`,
    );
  }

  const db = createUnscopedClient();

  return {
    communityId,

    async listSiteBlocks() {
      const rows = await db
        .select({
          id: siteBlocks.id,
          blockType: siteBlocks.blockType,
          blockOrder: siteBlocks.blockOrder,
          content: siteBlocks.content,
        })
        .from(siteBlocks)
        .where(
          and(
            eq(siteBlocks.communityId, communityId),
            eq(siteBlocks.isDraft, false),
            isNull(siteBlocks.deletedAt),
          ),
        )
        .orderBy(asc(siteBlocks.blockOrder));

      return rows.map((r) => ({
        id: r.id,
        blockType: r.blockType,
        blockOrder: r.blockOrder,
        content: r.content,
      }));
    },

    async listAnnouncements(_opts) {
      // PR #3 implementation
      return [];
    },

    async listDocuments(_opts) {
      // PR #4 implementation
      return [];
    },

    async listMeetings(_opts) {
      // PR #4 implementation
      return [];
    },

    async getContactInfo(_opts) {
      // PR #4 implementation
      return null;
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/lib/db/public-community-reader.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Verify typecheck**

```bash
pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/db/public-community-reader.ts apps/web/__tests__/lib/db/public-community-reader.test.ts
git commit -m "feat(web): getPublicCommunityScopedReader helper + tests (PR #1a · 16/20)

Wraps createUnscopedClient with explicit community_id + deletedAt predicates,
exposes typed read methods for the public-site context where createScopedClient
cannot apply (no TenantContext in unauthenticated render). listSiteBlocks is
fully implemented; per-SoR-block methods are stubbed for PR #3 + #4 to fill in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Feature flags + storage quota in `CommunityFeatures`

**Files:**
- Modify: `packages/shared/src/features/types.ts`
- Modify: `packages/shared/src/features/plan-features.ts`
- Create: `packages/shared/__tests__/features/plan-features-site.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/features/plan-features-site.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PLAN_FEATURES } from '../../src/features/plan-features';

describe('PLAN_FEATURES — site editor flags', () => {
  it('Essentials has hasSiteEditor:true', () => {
    expect(PLAN_FEATURES.essentials.features.hasSiteEditor).toBe(true);
  });

  it('Essentials does NOT have hasSitePolishBlocks', () => {
    expect(PLAN_FEATURES.essentials.features.hasSitePolishBlocks).toBeFalsy();
  });

  it('Essentials does NOT have hasSiteCustomCss', () => {
    expect(PLAN_FEATURES.essentials.features.hasSiteCustomCss).toBeFalsy();
  });

  it('Professional has hasSiteEditor + hasSitePolishBlocks + hasSiteCustomCss', () => {
    expect(PLAN_FEATURES.professional.features.hasSiteEditor).toBe(true);
    expect(PLAN_FEATURES.professional.features.hasSitePolishBlocks).toBe(true);
    expect(PLAN_FEATURES.professional.features.hasSiteCustomCss).toBe(true);
  });

  it('Professional does NOT have Phase 2 flags (custom domain, portfolio templates)', () => {
    expect(PLAN_FEATURES.professional.features.hasSiteCustomDomain).toBeFalsy();
    expect(PLAN_FEATURES.professional.features.hasSitePortfolioTemplates).toBeFalsy();
  });
});

describe('PLAN_FEATURES — siteAssetsQuotaBytes', () => {
  it('Essentials quota is 100 MB', () => {
    expect(PLAN_FEATURES.essentials.siteAssetsQuotaBytes).toBe(100 * 1024 * 1024);
  });

  it('Professional quota is 500 MB', () => {
    expect(PLAN_FEATURES.professional.siteAssetsQuotaBytes).toBe(500 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/features/plan-features-site.test.ts
```

Expected: tests fail (the new flag keys + quota field don't exist).

- [ ] **Step 3: Extend `CommunityFeatures` and `PlanFeatureConfig`**

Open `packages/shared/src/features/types.ts`. Find the `CommunityFeatures` interface and add the new flags before the closing brace:

```typescript
  /** Site editor — block authoring UI at /pm/settings/website/ (Essentials+). */
  readonly hasSiteEditor: boolean;
  /** Polish block types: FAQ, gallery, amenities pages (Pro+). */
  readonly hasSitePolishBlocks: boolean;
  /** Custom CSS overrides on layout theme tokens (Pro+, allowlist-only). */
  readonly hasSiteCustomCss: boolean;
  /** Custom domain mapping (Pro+, Phase 2). */
  readonly hasSiteCustomDomain: boolean;
  /** Portfolio templates + bulk apply across communities (PM/Enterprise, Phase 2). */
  readonly hasSitePortfolioTemplates: boolean;
```

Find the `PlanFeatureConfig` interface and add the quota field:

```typescript
export interface PlanFeatureConfig {
  readonly features: Partial<Record<keyof CommunityFeatures, boolean>>;
  readonly maxAdmins: number;
  readonly displayName: string;
  readonly monthlyPriceUsd: number;
  /** Maximum cumulative bytes a community can store in `community-site-assets`. */
  readonly siteAssetsQuotaBytes: number;
}
```

- [ ] **Step 4: Wire up the flags + quota in `plan-features.ts`**

Open `packages/shared/src/features/plan-features.ts`. For the `essentials` config, add inside `features`:

```typescript
      hasSiteEditor: true,
```

And add the quota field at the same level as `maxAdmins`:

```typescript
    maxAdmins: 3,
    siteAssetsQuotaBytes: 100 * 1024 * 1024,  // 100 MB
```

For `professional`, inside `features`:

```typescript
      hasSiteEditor: true,
      hasSitePolishBlocks: true,
      hasSiteCustomCss: true,
```

And quota:

```typescript
    siteAssetsQuotaBytes: 500 * 1024 * 1024,  // 500 MB
```

If a `pm` / `enterprise` plan tier exists in `PLAN_FEATURES`, mirror the Professional flags plus the `hasSitePortfolioTemplates` flag (Phase 2 — set to false in v1; pre-declare the key shape now). Quota: `2 * 1024 * 1024 * 1024` (2 GB). If no PM tier is in the file today, skip this — PR #5 or later handles it.

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/features/plan-features-site.test.ts
pnpm --filter @propertypro/shared typecheck
```

Expected: 6 tests pass; no typecheck errors. If `PlanFeatureConfig` is referenced elsewhere with a non-optional shape, TypeScript will demand `siteAssetsQuotaBytes` on every plan — fill them in.

- [ ] **Step 6: Run the broader shared test suite to confirm no regressions**

```bash
pnpm --filter @propertypro/shared test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/features/types.ts packages/shared/src/features/plan-features.ts packages/shared/__tests__/features/plan-features-site.test.ts
git commit -m "feat(shared): site editor feature flags + per-plan storage quota (PR #1a · 17/20)

Adds hasSiteEditor (Essentials+), hasSitePolishBlocks/hasSiteCustomCss
(Pro+), hasSiteCustomDomain/hasSitePortfolioTemplates (Phase 2, pre-
declared as false). Adds siteAssetsQuotaBytes to PlanFeatureConfig:
Essentials 100 MB, Pro 500 MB (PM/Enterprise 2 GB if present).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: CI guard allowlist update

**Files:**
- Modify: `scripts/verify-scoped-db-access.ts`

- [ ] **Step 1: Read the current allowlist**

Open `scripts/verify-scoped-db-access.ts`. Find the list of allowed unscoped-import paths (it will be a `const ALLOW_UNSAFE_IMPORTS` array or similar). Read the section to understand the file/folder match patterns.

- [ ] **Step 2: Add the new allowed paths**

Add three new entries to the allowlist:

```typescript
// PR #1a — Property Landing Page foundation
'apps/web/src/lib/db/public-community-reader.ts',  // Public-site reader; documented AUTHZ contract
// (when subsequent PRs land routes that read the three new platform tables,
// they should be added here individually rather than wildcarded)
```

Don't wildcard the directory — explicit per-file allowlist matches the existing pattern.

- [ ] **Step 3: Run the guard locally**

```bash
pnpm guard:db-access
```

Expected: PASS. If it fails complaining about the new helper's `from '@propertypro/db/unsafe'` import, the allowlist entry doesn't match exactly — check path normalization (relative vs absolute) and adjust.

- [ ] **Step 4: Run all lint guards as a sanity check**

```bash
pnpm lint
```

Expected: PASS (lint includes the DB access guard per CLAUDE.md).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-scoped-db-access.ts
git commit -m "chore(ci): allowlist getPublicCommunityScopedReader's unscoped import (PR #1a · 18/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Documentation landing pages

**Files:**
- Create: `docs/design-system/blocks/README.md`
- Create: `docs/design-system/templates/README.md`

- [ ] **Step 1: Create the blocks docs landing**

Create `docs/design-system/blocks/README.md`:

```markdown
# Site Block Types

Documentation index for the block types that compose a community's public site. Each block type has:
- A Zod content schema at `packages/shared/src/site-blocks/<type>.ts`
- A React server component renderer at `apps/web/src/components/public-site/blocks/<Type>Block.tsx`
- A doc file in this directory (added alongside the renderer's PR)

## v1 block catalog

| Type            | Category    | Tier         | Renderer PR | Doc                                           |
|-----------------|-------------|--------------|-------------|------------------------------------------------|
| `hero`          | content     | Essentials   | #1b         | [hero.md](./hero.md) — *(added in PR #1b)*    |
| `text`          | content     | Essentials   | #2          | [text.md](./text.md) — *(added in PR #2)*     |
| `image`         | content     | Essentials   | #2          | [image.md](./image.md) — *(added in PR #2)*   |
| `documents`     | SoR         | Essentials   | #4          | [documents.md](./documents.md)                |
| `meetings`      | SoR         | Essentials   | #4          | [meetings.md](./meetings.md)                  |
| `announcements` | SoR         | Essentials   | #3          | [announcements.md](./announcements.md)        |
| `contact`       | SoR         | Essentials   | #4          | [contact.md](./contact.md)                    |

## v1.5 block catalog (Pro+)

| Type        | Category | Tier         | Renderer PR | Doc                                       |
|-------------|----------|--------------|-------------|--------------------------------------------|
| `faq`       | content  | Professional | #10         | [faq.md](./faq.md) — *(added in PR #10)*   |
| `gallery`   | content  | Professional | #10         | [gallery.md](./gallery.md)                 |
| `amenities` | content  | Professional | #10         | [amenities.md](./amenities.md)             |

## Categories

- **Content blocks** — PM-authored. The block content is stored in `site_blocks.content` jsonb and validated against its Zod schema on read and write.
- **SoR blocks** — System-of-record. The block content carries only configuration (limits, time windows, filter flags). The renderer reads from existing tables (`documents`, `meetings`, `announcements`, `communities`, board members) at render time via `getPublicCommunityScopedReader`.

## Authoring a new block type

1. Add the Zod schema at `packages/shared/src/site-blocks/<type>.ts`.
2. Add the type to `BLOCK_TYPES` in `packages/shared/src/site-blocks/types.ts`.
3. Wire it into the registry at `packages/shared/src/site-blocks/index.ts`.
4. Extend the migration's `block_type` CHECK constraint.
5. Create the renderer at `apps/web/src/components/public-site/blocks/<Type>Block.tsx`.
6. Register the renderer at `apps/web/src/components/public-site/blocks/registry.ts`.
7. Add the PM editor form (under `apps/web/src/components/pm/site-editor/`).
8. Document this block at `docs/design-system/blocks/<type>.md`.

The `registry-completeness.test.ts` at `packages/shared/__tests__/site-blocks/` ensures step 3 is not skipped.
```

- [ ] **Step 2: Create the templates docs landing**

Create `docs/design-system/templates/README.md`:

```markdown
# Site Layout Templates

Layouts are React server components that own the page chrome of a public community site. Each layout has:
- A React component at `apps/web/src/components/public-site/layouts/<LayoutName>.tsx`
- A metadata row in the `site_layout_metadata` DB table
- A doc file in this directory (added alongside the layout's PR)

## v1 layout catalog

| Slug      | Default preset  | Tier         | PR  | Doc                                              |
|-----------|-----------------|--------------|-----|---------------------------------------------------|
| tidewater | bay-light       | Essentials   | #1b | [tidewater.md](./tidewater.md) *(added in PR #1b)* |
| boulevard | palm-shadow     | Essentials   | #7  | [boulevard.md](./boulevard.md)                    |
| sable     | linen-bronze    | Essentials   | #7  | [sable.md](./sable.md)                            |

## Constraints (all layouts must honor)

- Server components only. No client islands except where strictly required.
- Tokens via CSS variables (`var(--theme-primary)`); never hardcoded hex.
- Body text ≥ 16px (per `.claude/rules/design.md`).
- `:focus-visible` never suppressed.
- Heading hierarchy valid (one `<h1>` per page, descending after).
- Image alt text comes from the block content; layouts do not invent alt text.

## How a layout differs from a block

- A **layout** owns the page chrome (header, footer, hero treatment, section wrapping, typography rhythm).
- A **block** is a content unit rendered inside the layout (hero panel, document list, contact card, etc.).
- The same `blocks` array renders the same way regardless of layout — only the surrounding chrome changes.

## Authoring a new layout

See [apps/web/src/components/public-site/layouts/README.md](../../../apps/web/src/components/public-site/layouts/README.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/design-system/blocks/README.md docs/design-system/templates/README.md
git commit -m "docs(design-system): landing pages for blocks + templates (PR #1a · 19/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Full validation

**Files:** (none modified — this task verifies the PR is shippable)

- [ ] **Step 1: Run typecheck across all packages**

```bash
pnpm typecheck
```

Expected: no errors. If any errors surface, they're regressions introduced by this PR — fix them before continuing.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: PASS. Includes the DB access guard.

- [ ] **Step 3: Run the full unit test suite**

```bash
pnpm test
```

Expected: all tests pass, including the new tests added in tasks 6-17.

- [ ] **Step 4: Verify migration applies cleanly to a fresh DB**

```bash
# In a fresh local Supabase instance (or after dropping the existing one):
pnpm --filter @propertypro/db db:migrate
```

Expected: all 4 migrations apply in order; no errors. Confirm with:

```sql
SELECT slug FROM site_theme_presets ORDER BY slug;
SELECT slug FROM site_starter_packs ORDER BY slug;
SELECT slug FROM site_layout_metadata ORDER BY slug;
```

Expected: 6 / 3 / 3 rows.

- [ ] **Step 5: Verify the production build**

```bash
pnpm build
```

Expected: PASS. The web app builds even though the new code paths are not yet exercised by any route — the registries are empty but type-correct.

- [ ] **Step 6: Inspect the final commit graph**

```bash
git log --oneline -20
```

Expected: 19 commits in order, each tagged `(PR #1a · N/20)`, building incrementally from the migration through the documentation.

- [ ] **Step 7: Open the PR**

```bash
git push -u origin claude/agitated-hopper-0ecc08
gh pr create --title "feat: site_blocks foundation (Property Landing Page PR #1a)" --body "$(cat <<'EOF'
## Summary

- Foundation layer for the structured block model that powers the Property Landing Page (spec: docs/superpowers/specs/2026-05-26-property-landing-page-design.md).
- Zero user-visible changes — `_site/page.tsx` continues rendering its current hardcoded content. This PR sets up the typed schemas, registries, helper, migration, and CI allowlist so subsequent vertical-slice PRs (1b+) can ship without re-doing foundation work.

## What's in scope

- Migration `0004_site_blocks_foundation.sql` — partial unique index on site_blocks (fixes the atomic-publish constraint bug per spec Section 2.7), extended block_type CHECK, three new platform tables, seed data (6 presets, 3 layouts, 3 starter packs).
- 7 block Zod schemas + completeness-tested registry at `packages/shared/src/site-blocks/`.
- Renderer + layout registry skeletons at `apps/web/src/components/public-site/`.
- `getPublicCommunityScopedReader` helper at `apps/web/src/lib/db/` with documented AUTHZ contract.
- New `has*` feature flags + per-plan `siteAssetsQuotaBytes` in `CommunityFeatures` / `PLAN_FEATURES`.
- CI guard allowlist update.
- Engineer docs at `apps/web/src/components/public-site/layouts/README.md` and `docs/design-system/{blocks,templates}/README.md`.

## What's NOT in scope

- No render path changes — Tidewater + Hero ships in PR #1b.
- No editor surfaces — PR #1b adds the Welcome tab.
- No SoR block render logic — stubbed in this PR, filled in by PRs #3 + #4.

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (includes DB access guard)
- [ ] `pnpm test` passes (61 new tests across site-blocks schemas + registry + reader + plan-features)
- [ ] `pnpm --filter @propertypro/db db:migrate` applies cleanly
- [ ] `pnpm build` succeeds
- [ ] Confirm no live community has a jsx_template block row (DB query before PR #9, recorded here as a sanity check): `SELECT COUNT(*) FROM site_blocks WHERE block_type='jsx_template' AND deleted_at IS NULL` returns 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened on GitHub. Note the PR URL — link from the next plan (PR #1b).

---

## Self-Review

After completing all 20 tasks:

**Spec coverage check:**
- ✅ Section 2.2 (Block Model) — schemas + registry covered (tasks 5-13)
- ✅ Section 2.3 (Renderer Registry) — skeleton covered (task 14)
- ✅ Section 2.4 (Layout System) — skeleton + README covered (task 15)
- ✅ Section 2.5 (Theme Presets) — table + seed data covered (tasks 1, 2)
- ✅ Section 2.6 (Starter Packs) — table + seed data covered (tasks 1, 3)
- ✅ Section 2.7 (Publish workflow, partial-unique-index migration only) — covered (task 1)
- ✅ Section 3.2 (New tables) — covered (tasks 1-4)
- ✅ Section 4.3 (Tier Gating, flag declarations) — covered (task 17)
- ✅ Section 7 (Tenant Isolation, public-context helper) — covered (tasks 16, 18)
- ✅ Section 8.3 (Storage quota constants) — covered (task 17)
- ⏭ Section 2.1 (Canonical Render Path) — preserved unchanged; PR #1b touches.
- ⏭ Section 2.8 (Image Handling) — PR #2.
- ⏭ Section 2.9 (SEO Metadata) — PR #1b.
- ⏭ Section 2.10 (robots/sitemap) — PR #4.
- ⏭ Section 4.0–4.2 (Pre-setup + wizard + editor) — PR #5 + PR #1b.
- ⏭ Section 5 (Admin panel) — PR #6 + PR #7.
- ⏭ Section 8.4 (CSRF/rate limits on new routes) — applies once routes exist (PR #2+).
- ⏭ Section 8.5 (Performance baseline) — PR #1b.

**Placeholder scan:** none — every task has executable steps with complete code or commands.

**Type consistency check:** `BlockType`, `BlockRendererProps`, `LayoutProps`, `PublicCommunity`, `ResolvedTheme`, `LayoutId`, `PublicScopedReader` referenced consistently across tasks 5, 14, 15, 16.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-property-landing-page-pr-1a-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because each task is short (15-45m) and naturally suited to per-task review (the A1-drain cadence the team is already running).

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Slower because all task context lives in one conversation.

**Which approach?**

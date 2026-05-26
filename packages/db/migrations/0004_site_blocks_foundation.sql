-- Migration 0004: site_blocks foundation
--
-- (a) Replace the non-partial UNIQUE constraint on site_blocks with a partial
--     unique index that excludes soft-deleted rows. Required so the atomic
--     publish flow (Section 2.7 of the spec) can soft-delete published rows
--     and promote drafts in a single transaction without constraint violation.
--
-- (b) Re-establish the block_type CHECK constraint that was lost during
--     the Drizzle schema reset. The current baseline (0000_nappy_guardian.sql:1041)
--     declares `block_type text NOT NULL` with no CHECK; the original constraint
--     (added in archive 0033, extended in archive 0097 with 'jsx_template') is
--     missing on this branch. The DROP IF EXISTS below is defensive — on this
--     branch there is no constraint to drop. The new CHECK enforces all 8
--     v1 block types. (Note: 'jsx_template' is retired in PR #9 — this
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
  default_preset_slug  text REFERENCES site_theme_presets(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT,
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

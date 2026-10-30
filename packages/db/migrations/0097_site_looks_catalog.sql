-- 0097_site_looks_catalog
--
-- Website builder, Phase 2B (the write release). The four new looks (Bayfront,
-- Heritage, Palm Grove and Plain & Simple) are each two platform-level catalog
-- rows, and a look's id, its layout id and its preset slug are the same string:
--   site_theme_presets     the colours and fonts, in the tokens keys migration
--                          0004 seeded: primaryColor, secondaryColor, accentColor,
--                          headingFont, bodyFont
--   site_layout_metadata   the layout's catalog entry; its default_preset_slug
--                          names the preset of the same slug
-- The layouts themselves are code (apps/web/src/components/public-site/layouts/)
-- and arrive in the same release. Every font below is in ALLOWED_FONTS
-- (packages/theme/src/constants.ts), the list resolveTheme checks.
--
-- Heritage's accent is #7A5B27, not the design mockup's #9A7536. As text on
-- Heritage's #FBF8F1 background the mockup colour measures 3.98:1 and this one
-- 5.90:1; body text needs 4.5:1.
--
-- EXPAND migration, data only: apply BEFORE the code that reads these rows ships.
-- Applying it early is safe, because no site's branding names these slugs yet.
-- The presets do join the colour sets that the editor's Design panel and the
-- onboarding wizard list (they list every preset that is not archived), and both
-- tables show in the admin console.
--
-- Idempotent. Both INSERTs end in ON CONFLICT (slug) DO NOTHING, so a second apply
-- adds nothing, updates nothing, and never overwrites a row a platform admin has
-- edited in the console since (an upsert would). The presets go first because
-- site_layout_metadata.default_preset_slug references site_theme_presets.slug
-- with ON DELETE RESTRICT; to undo, delete the layout rows before the presets.
--
-- No schema change, so the snapshot is the tip's, copied by the scaffolder.
-- Pinned by apps/web/__tests__/integration/site-looks-catalog.integration.test.ts.
INSERT INTO site_theme_presets (slug, display_name, description, tokens, tier, is_featured) VALUES
  ('bayfront', 'Bayfront', 'Photo-led and modern.',
   '{"primaryColor":"#0B4F5C","secondaryColor":"#F5EFE6","accentColor":"#E9A23B","headingFont":"Playfair Display","bodyFont":"Source Sans 3"}'::jsonb,
   'essentials', true),
  ('heritage', 'Heritage', 'Formal and official.',
   '{"primaryColor":"#1D2B4A","secondaryColor":"#FBF8F1","accentColor":"#7A5B27","headingFont":"Libre Baskerville","bodyFont":"Lato"}'::jsonb,
   'essentials', true),
  ('palm-grove', 'Palm Grove', 'Warm and friendly.',
   '{"primaryColor":"#2D5E4A","secondaryColor":"#FBF6EA","accentColor":"#B4532A","headingFont":"Lora","bodyFont":"Nunito Sans"}'::jsonb,
   'essentials', true),
  ('plain-simple', 'Plain & Simple', 'No photos needed, larger text.',
   '{"primaryColor":"#1D4E89","secondaryColor":"#EEF3FA","accentColor":"#FFF4CC","headingFont":"Figtree","bodyFont":"Figtree"}'::jsonb,
   'essentials', true)
ON CONFLICT (slug) DO NOTHING;--> statement-breakpoint
INSERT INTO site_layout_metadata (slug, display_name, tagline, description, tier, is_featured, default_preset_slug, version) VALUES
  ('bayfront', 'Bayfront', 'Photo-led and modern.', 'Photo-led and modern.',
   'essentials', true, 'bayfront', '1.0.0'),
  ('heritage', 'Heritage', 'Formal and official.', 'Formal and official.',
   'essentials', true, 'heritage', '1.0.0'),
  ('palm-grove', 'Palm Grove', 'Warm and friendly.', 'Warm and friendly.',
   'essentials', true, 'palm-grove', '1.0.0'),
  ('plain-simple', 'Plain & Simple', 'No photos needed, larger text.', 'No photos needed, larger text.',
   'essentials', true, 'plain-simple', '1.0.0')
ON CONFLICT (slug) DO NOTHING;

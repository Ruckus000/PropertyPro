-- Migration 0005: site_blocks RLS hardening
--
-- The three platform-level tables created in 0004
-- (site_theme_presets, site_starter_packs, site_layout_metadata) were
-- intentionally NOT tenant-scoped per the spec — they're admin-only catalog
-- data. However, the codebase's CI guard (DB005) requires every table to
-- ENABLE ROW LEVEL SECURITY regardless of scoping intent.
--
-- The canonical pattern (cf. platform_admin_users, archive 0029 + 0146)
-- for non-tenant-scoped tables: ENABLE + FORCE RLS, then REVOKE access
-- from anon/authenticated roles and GRANT to service_role only. This
-- locks out direct PostgREST access (Supabase REST API) while keeping
-- backend Drizzle reads working via the service-role pooler.
--
-- Why a separate migration: migrations are append-only on this codebase
-- per .claude/rules/migration-safety.md; we don't amend 0004 in place.

BEGIN;

-- site_theme_presets: platform-level theme catalog.
-- Read access via getPublicCommunityScopedReader (public site, service-role)
-- and admin app (service-role). NEVER directly from anon/authenticated.
ALTER TABLE site_theme_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_theme_presets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE site_theme_presets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_theme_presets TO service_role;

-- site_starter_packs: applied at community creation time.
ALTER TABLE site_starter_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_starter_packs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE site_starter_packs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_starter_packs TO service_role;

-- site_layout_metadata: read by the public site for layout resolution.
ALTER TABLE site_layout_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_layout_metadata FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE site_layout_metadata FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_layout_metadata TO service_role;

COMMIT;

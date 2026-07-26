-- Close the two RLS gaps surfaced by the table-registration audit (PR #847).
--
-- Registering the 24 tables that were in neither list in rls-config.ts meant
-- reading every table's actual policies for the first time. Twenty-two were
-- fine — bespoke policy names, but sound shapes. Two were not, and this
-- migration fixes both. Neither was introduced by that PR; both had been live
-- for as long as the tables have existed, unnoticed because nothing compared
-- the config against the database.
--
-- ===========================================================================
-- GAP 1: user_search_index had no row-level security of any kind
-- ===========================================================================
--
-- No ENABLE ROW LEVEL SECURITY, no policies, and no REVOKE — anywhere in the
-- migrations. The table mirrors auth.users for trigram search and holds
-- full_name and email, both GIN/trgm-indexed. Under Supabase's baseline —
-- "grants wide open, RLS is the only gate", with ALTER DEFAULT PRIVILEGES
-- extending that to every table a later migration creates — that left it
-- directly readable by anon and authenticated. It is the table behind
-- Supabase's "RLS Disabled in Public" advisor entry.
--
-- The posture applied here is deliberately the SAME one seven sibling platform
-- tables already have (0005 for the three site_* tables, 0035 for the rest):
-- RLS enabled and forced, ZERO policies, and the ACL revoked. Zero policies is
-- not an oversight — it is the deny-everyone default, and the REVOKE is the
-- defence-in-depth backstop that keeps a future policy from silently becoming
-- anon-reachable the moment it lands.
--
-- WHY THIS DOES NOT BREAK USER SEARCH
--
-- The only runtime reader is packages/db/src/queries/trigram-search.ts, which
-- joins public.user_search_index in raw SQL over the package's single Drizzle
-- connection (DATABASE_URL → the `postgres` role). That role bypasses RLS, so
-- neither ENABLE nor FORCE applies to it, and the anon/authenticated grants are
-- irrelevant to it. There is no supabase.from('user_search_index') anywhere in
-- the repo — no browser or client-component path exists at all. Its two API
-- consumers (/api/v1/search/users, /api/v1/search/residents) are server routes
-- already gated by requirePermission.
--
-- FORCE is safe for the same reason, and is not a guess: site_theme_presets
-- carries exactly this posture in production today and IS read at runtime
-- through the same connection (apps/web/src/lib/db/theme-preset-catalog.ts).
-- If FORCE broke the app's connection, the theme-preset catalogue would already
-- be failing in production. Keeping the posture identical across all eight
-- platform tables is worth more than shaving one statement here.
--
-- ===========================================================================
-- GAP 2: the emergency-broadcast tables had no write-scope trigger
-- ===========================================================================
--
-- Both have community_id and four tenant-scoped policies, but neither had a
-- write-scope trigger under any name — so on write, community_id was policed
-- only by the policy WITH CHECK. Every other tenant_crud table has the trigger.
--
-- The gap is narrow but real: WITH CHECK rejects a row whose community_id the
-- caller cannot access, while pp_rls_enforce_tenant_community_id() REWRITES a
-- forged community_id to the active tenant. Without it, a caller who belongs to
-- two communities can write a row into whichever of them they please by setting
-- community_id directly, regardless of the tenant context the request resolved.
-- The policy cannot catch that — both values pass the membership check.
--
-- Uses the canonical trigger name, so no entry is needed in the legacy-name
-- maps that PR #847 added to the RLS suite and the DB005 guard.
--
-- ===========================================================================
--
-- Idempotent throughout: IF EXISTS / IF NOT EXISTS guards, and REVOKE of an
-- absent privilege or GRANT of a present one are both no-ops. Safe to re-apply.
--
-- Keep in sync with scripts/sql/local-supabase-post-migrate.sql, which
-- re-asserts the revocation list on the test database after the stub's blanket
-- grant. user_search_index is added to that list in the same change.

-- --------------------------------------------------------------------------
-- Gap 1 — user_search_index
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."user_search_index" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."user_search_index" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE user_search_index FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_search_index TO service_role;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- Gap 2 — write-scope triggers on the emergency-broadcast tables
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."emergency_broadcasts";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope
  BEFORE INSERT OR UPDATE ON public."emergency_broadcasts"
  FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint

DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."emergency_broadcast_recipients";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope
  BEFORE INSERT OR UPDATE ON public."emergency_broadcast_recipients"
  FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();

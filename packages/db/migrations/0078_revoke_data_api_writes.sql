-- 0078_revoke_data_api_writes
--
-- WHY: make the Supabase Data API read-only on every `public` table.
--
-- 0077 shut 59 tenant tables to anon/authenticated entirely because their
-- SELECT policies were membership-only. This closes the write half of the same
-- door. Supabase's baseline (and `postgres`'s default ACL in production, which
-- hands every new table `authenticated=arwd`) left 88 public tables writable by
-- `authenticated` through PostgREST, measured 2026-09-25. RLS was the only gate,
-- and several write policies are broader than the application's own rules:
--
--   * user_roles INSERT/UPDATE/DELETE require only the admin tier
--     (pp_rls_can_read_audit_log). A property_manager could demote the
--     root_manager row and promote their own, bypassing requireRootManager.
--     ADR-006 makes role assignment root-exclusive; the DB did not.
--   * communities UPDATE admits any property_manager, so subscription_plan /
--     subscription_status / free_access_expires_at / is_demo were writable,
--     bypassing plan gating and root-only billing.
--   * maintenance_requests / storm_damage_reports /
--     insurance_certificate_requests INSERT is membership-only, so a member
--     could file under someone else's submitter id. poll_votes INSERT skipped
--     the route's closed-poll and valid-option checks. Every one of these also
--     skipped route validation and logAuditEvent.
--
-- WHY A BLANKET REVOKE, NOT PER-POLICY FIXES: the application never writes a
-- public table as `authenticated`. Tenant writes go through createScopedClient
-- (Drizzle on a role pp_rls_is_privileged() accepts); supabase-js writes use the
-- service-role admin client; user-JWT clients call only auth.*, Realtime on
-- `notifications` (read), and two SECURITY DEFINER read-only RPCs. Storage
-- uploads write storage.objects, not public. The only trigger on auth.users
-- (trg_sync_user_search_index) is SECURITY DEFINER. Verified by grep over
-- apps/*/src and packages/*/src, and in production (no public views; postgres
-- owns all 112 public tables; anon already held no write privilege anywhere).
-- So write grants to anon/authenticated are pure attack surface, and removing
-- them all is one rule with no predicate to get wrong, where fixing each
-- policy is ~40 predicates each of which must match its route exactly.
--
-- SELECT is left alone: the remaining readable tables have policies narrowed
-- to own-row or admin tier (0077's invariant enforces that), and Realtime
-- needs SELECT on `notifications`.
--
-- Three parts:
--   1. Revoke every write-class privilege on every existing public table, and
--      every privilege on every public sequence (a readable sequence leaks row
--      counts; production already had none granted, this codifies it).
--   2. ALTER DEFAULT PRIVILEGES for `postgres` (the role that owns every public
--      table and applies migrations) so the NEXT table does not get
--      `authenticated=arwd` again. Without this, a new table silently reopens
--      the hole; the invariant test in rls-policies would catch it only
--      because post-migrate re-revokes, which production does not have.
--   3. pp_sync_unit_rent_amount_from_lease(bigint) is SECURITY INVOKER and
--      writes units. With no write grant it can do nothing as authenticated,
--      but it had PUBLIC EXECUTE (proacl NULL in production), so
--      /rest/v1/rpc/ exposed it. Nothing calls it except the leases trigger,
--      which runs as the writing role (owner or service_role), so EXECUTE is
--      revoked from PUBLIC/anon/authenticated and granted to service_role.
--
-- SAFETY: a pure grant repair, no schema change, so it is order-independent
-- (.claude/rules/migration-safety.md). It does not touch service_role or the
-- owner. Idempotent: REVOKE of an absent privilege and GRANT of a held one are
-- no-ops.
--
-- Keep scripts/sql/local-supabase-post-migrate.sql in sync.
-- packages/db/__tests__/data-api-revoke-writes-migration.test.ts enforces it.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.pp_sync_unit_rent_amount_from_lease(bigint)
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pp_sync_unit_rent_amount_from_lease(bigint) TO service_role;

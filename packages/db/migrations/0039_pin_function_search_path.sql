-- Pin search_path on the 13 functions that lacked it, and stop anon/authenticated
-- creating objects in the public schema.
--
-- ===========================================================================
-- READ THIS BEFORE "FIXING" THE REMAINING ADVISOR LINTS
-- ===========================================================================
--
-- Supabase's advisor reports four SECURITY DEFINER functions as executable by
-- anon/authenticated (lints 0028 / 0029) and recommends revoking EXECUTE.
-- DO NOT DO THAT. It would take the site down.
--
-- Three of those four — pp_rls_can_read_audit_log, pp_rls_has_community_membership
-- and pp_rls_community_allows_member_writes — are RLS POLICY HELPERS. Postgres
-- evaluates a policy expression with the privileges of the role running the
-- query, so that role must hold EXECUTE on every function the policy calls.
-- Verified by experiment rather than reasoning: revoke EXECUTE (from PUBLIC as
-- well as the named roles — the default PUBLIC grant makes a role-only revoke a
-- no-op) and then read a table whose policy calls the helper:
--
--   ERROR:  permission denied for function pp_rls_has_community_membership
--
-- Those helpers back 144, 85, 70, 12 and 2 policies respectively. Revoking would
-- convert silent 0-row tenant filtering into hard errors on every authenticated
-- read. The grants are load-bearing. Leave them.
--
-- The fourth, sync_user_search_index, is not RPC-callable at all: it RETURNS
-- trigger, which PostgREST cannot expose. Its real problem is the one this
-- migration fixes.
--
-- ===========================================================================
-- WHAT THIS MIGRATION ACTUALLY DOES
-- ===========================================================================
--
-- 1. Pins search_path on 13 functions that had none (advisor lint 0011).
--
--    sync_user_search_index is the only SECURITY DEFINER one, and therefore the
--    only genuine privilege-escalation vector in the set — it runs as its owner
--    and its trigger sits on auth.users. The other 12 are SECURITY INVOKER, so
--    pinning them is hardening rather than escalation prevention. Three of those
--    twelve earn it on robustness grounds alone: pp_sync_unit_rent_amount_from_lease,
--    pp_leases_sync_unit_rent_amount and pp_enforce_lease_renewal_continuity
--    reference `leases` / `units` UNQUALIFIED, so `public` in their path is
--    load-bearing, not decoration.
--
--    'public', 'pg_catalog' is the right value for all 13: none calls auth.uid()
--    or auth.role() (which is exactly why the two already-pinned helpers carry
--    'auth' and the third does not), and none uses trigram or other extension
--    functions.
--
--    Bodies below are reproduced VERBATIM from production introspection
--    (pg_get_functiondef, 2026-07-26) — the same authority the 0000 baseline
--    cites — so the only semantic change is the added clause. This matters:
--    the 0000 baseline's copy of pp_rls_can_read_audit_log still carries the
--    pre-role-v3 `role IN ('manager','pm_admin')` list that 0016/0020 replaced,
--    so copying bodies from the baseline rather than from prod would silently
--    revert logic. (That function is already pinned and is not touched here.)
--
--    CREATE OR REPLACE rather than ALTER FUNCTION, matching repo precedent
--    (0016_role_v3_rls_bilingual.sql, 0020_role_v3_cleanup.sql). For
--    sync_user_search_index it is also load-bearing: that function exists only
--    in _archive/0110 and in production — 0002 recreates the user_search_index
--    TABLE but never the function — so a bare ALTER would fail outright on a
--    database rebuilt from this repo. CREATE OR REPLACE pins it in prod AND
--    returns it to the current migration lineage.
--
--    NOTE the half this does NOT fix: trg_sync_user_search_index on auth.users
--    is still absent from the lineage, so a fresh/CI database has the function
--    but nothing calls it and user_search_index is never populated. Production
--    works only because of the legacy 0110 artifact. Restoring the trigger means
--    a migration writing into Supabase's managed auth schema; that is a separate
--    decision, deliberately not taken here.
--
-- 2. Revokes CREATE on schema public from anon and authenticated.
--
--    Not an advisor finding — found while assessing lint 0011. A mutable
--    search_path is only exploitable if an attacker can create an object to
--    shadow a real one, and both roles could do exactly that: Supabase's
--    bootstrap grants them CREATE on public. Removing it removes the
--    precondition for the whole class of attack.
--
--    Cleared before writing: no application code issues DDL at runtime
--    (provisioning is INSERT/UPDATE only — shared-schema tenancy, not
--    schema-per-tenant); the only CREATE SCHEMA outside migrations is in two
--    integration tests that connect as `postgres`; ZERO objects in public are
--    owned by anon or authenticated; and scripts/sql/local-supabase-stub.sql
--    grants USAGE only — there is no GRANT CREATE ON SCHEMA anywhere in the repo.
--    USAGE is deliberately left intact; the stub and PostgREST both need it.
--
-- Idempotent: CREATE OR REPLACE and a REVOKE of an absent privilege are both
-- safe to re-apply.

-- --------------------------------------------------------------------------
-- 1a. The one SECURITY DEFINER function (the real escalation vector)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_search_index()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  INSERT INTO public.user_search_index (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'fullName', NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- 1b. RLS session helpers (SECURITY INVOKER)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pp_rls_effective_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    session_user
  )::text;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_is_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT "public"."pp_rls_effective_role"() IN ('postgres', 'service_role', 'supabase_admin');
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_active_community_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT NULLIF(current_setting('app.current_community_id', true), '')::bigint;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_can_access_community(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT "public"."pp_rls_has_community_membership"(target_community_id);
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_rls_enforce_tenant_community_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  active_community_id bigint;
BEGIN
  -- Privileged jobs and migrations may write across tenants intentionally.
  IF "public"."pp_rls_is_privileged"() THEN
    RETURN NEW;
  END IF;

  active_community_id := "public"."pp_rls_active_community_id"();
  IF active_community_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant DB session context: app.current_community_id'
      USING ERRCODE = '42501';
  END IF;

  NEW.community_id := active_community_id;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- 1c. Append-only guards
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_compliance_audit_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'compliance_audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.prevent_support_access_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'support_access_log is append-only'
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$function$;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- 1d. Demo guard
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_demo_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.is_demo = true AND (NEW.trial_ends_at IS NULL OR NEW.demo_expires_at IS NULL) THEN
    RAISE EXCEPTION 'Demo communities must have both trial_ends_at and demo_expires_at';
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- 1e. Lease / rent derivation. These three reference `leases` and `units`
--     UNQUALIFIED, so 'public' in the pinned path is required for them to keep
--     working — this is the group the post-apply smoke test exercises.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pp_sync_unit_rent_amount_from_lease(target_unit_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  active_rent NUMERIC(10, 2);
BEGIN
  SELECT l.rent_amount
  INTO active_rent
  FROM leases l
  WHERE l.unit_id = target_unit_id
    AND l.deleted_at IS NULL
    AND l.status = 'active'
    AND l.start_date <= CURRENT_DATE
    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE)
  ORDER BY l.start_date DESC, l.id DESC
  LIMIT 1;

  UPDATE units
  SET rent_amount = active_rent,
      updated_at = NOW()
  WHERE id = target_unit_id;
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_leases_sync_unit_rent_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
    RETURN OLD;
  END IF;

  PERFORM pp_sync_unit_rent_amount_from_lease(NEW.unit_id);

  IF TG_OP = 'UPDATE' AND NEW.unit_id <> OLD.unit_id THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_enforce_lease_renewal_continuity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  prev_lease leases%ROWTYPE;
BEGIN
  IF NEW.previous_lease_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO prev_lease
  FROM leases
  WHERE id = NEW.previous_lease_id;

  IF prev_lease.id IS NULL THEN
    RAISE EXCEPTION 'previous_lease_id % does not exist', NEW.previous_lease_id;
  END IF;

  IF prev_lease.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'previous_lease_id % points to deleted lease', NEW.previous_lease_id;
  END IF;

  IF prev_lease.community_id <> NEW.community_id OR prev_lease.unit_id <> NEW.unit_id THEN
    RAISE EXCEPTION 'renewal must reference prior lease in same community and unit';
  END IF;

  IF prev_lease.end_date IS NULL THEN
    RAISE EXCEPTION 'previous lease must have end_date for renewal continuity';
  END IF;

  IF NEW.start_date <> (prev_lease.end_date + 1) THEN
    RAISE EXCEPTION 'renewal lease start_date must be previous end_date + 1 day';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.pp_block_direct_unit_rent_amount_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount AND pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'units.rent_amount is derived from leases.rent_amount; update the lease instead';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- 2. Remove the precondition for search_path hijacking.
--    USAGE is intentionally retained.
--
--    BOTH statements are required, because the two databases hold this
--    privilege differently and a revoke that only names the roles is not enough:
--
--      prod (PG 17):  {postgres=UC/postgres, anon=UC/postgres,
--                      authenticated=UC/postgres, service_role=UC/postgres}
--                     -> explicit per-role CREATE; the role revoke does the work
--                        and the PUBLIC revoke is a no-op.
--
--      local (PG 14): {owner=UC/owner, =UC/owner, anon=U/owner, ...}
--                     -> the bare `=UC` entry is the PUBLIC grant. anon inherits
--                        CREATE from it while holding only USAGE explicitly, so
--                        the role revoke alone leaves the privilege in place.
--                        (Postgres 15 stopped granting CREATE on public to
--                        PUBLIC by default; the local stub predates that.)
--
--    Exactly the same trap as revoking EXECUTE on a function that also carries
--    the default `=X` PUBLIC grant — a role-only REVOKE silently does nothing.
--    The RLS suite caught this: the first draft of this migration named only the
--    two roles and the assertion failed on the local database.
--
--    Neither revoke touches the schema OWNER, which retains CREATE implicitly,
--    so migrations and the temp-schema integration tests are unaffected.
-- --------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

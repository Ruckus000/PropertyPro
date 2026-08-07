-- 0056_platform_admin_floor
--
-- WHY: `platform_admin_users` must never reach zero rows. Granting platform
-- admin requires an admin session, so an empty table is an unrecoverable
-- lockout — the only remedy is manual SQL against production.
--
-- The application floor in
-- apps/admin/src/app/api/admin/platform-admins/[userId]/route.ts counts rows and
-- then deletes in two separate statements. apps/admin talks to Postgres through
-- PostgREST, where each `.from()` call is its own transaction, so a transaction
-- spanning the two is not expressible in the route. Two admins removing each
-- other concurrently therefore both read 2, both compute 1 remaining, and both
-- deletes land. The route's own comment documents this and defers the fix here.
--
-- Reachability, measured rather than assumed: the DELETE route is the ONLY
-- deleter of this table (every other reference in apps/, packages/, scripts/ and
-- supabase/ is a SELECT or an INSERT), and the SELF_DELETE guard means no
-- sequential operator can lock themselves out. The window is two humans acting
-- within milliseconds of each other. This exists because the outcome is
-- unrecoverable, not because it is likely.
--
-- Note this table carries `user_id -> auth.users(id) ON DELETE CASCADE` in
-- production, so deleting the last admin's auth user would also raise here. That
-- is correct, but it surfaces far from its cause, hence the self-contained
-- message. (The 0000 baseline does not declare that FK, so local test databases
-- do not exercise the path.)
--
-- SAFETY: order-independent. This is a pure trigger guard — it adds no column
-- and removes nothing, so it is neither expand nor contract and may be applied
-- before or after the accompanying code ships.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, plus DROP TRIGGER IF EXISTS
-- immediately before CREATE TRIGGER (the house idiom, cf. 0052).

-- SECURITY INVOKER (the default), matching 0052 rather than 0045's DEFINER.
-- `service_role` and `postgres` both hold rolbypassrls, so the count below is
-- accurate for every caller that exists today. If a role WITHOUT bypass ever
-- ran this, FORCE RLS with zero policies would make it count 0 survivors and
-- reject the delete — the wrong answer, but the safe one. DEFINER would widen
-- the function's surface to buy only the difference between "fails closed" and
-- "succeeds", which is not worth it for a guard.
CREATE OR REPLACE FUNCTION "public"."pp_enforce_platform_admin_floor"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  survivors integer;
BEGIN
  -- THIS LOCK IS THE FIX. Without it the count below races exactly as the
  -- application-level count does: two transactions each see one other admin
  -- remaining and both proceed. Taking it BEFORE the count serialises
  -- concurrent deletes, so the second transaction blocks until the first
  -- commits and then counts against the committed result.
  --
  -- It must be the transaction-scoped variant. A session-scoped
  -- pg_advisory_lock() would outlive the statement and leak across PostgREST's
  -- pooled connections.
  --
  -- A row-level `FOR UPDATE` over the table — which this table's route comment
  -- originally suggested — is wrong twice over: each transaction already holds
  -- the lock on its own target row, so locking the others deadlocks; and
  -- `SELECT count(*) ... FOR UPDATE` is not valid Postgres (no FOR UPDATE with
  -- aggregates).
  PERFORM pg_advisory_xact_lock(hashtext('platform_admin_users_floor'));

  -- Count SURVIVORS, not `count(*) - 1`. Under a multi-row delete the minus-one
  -- form is wrong for every row after the first, because each row's BEFORE
  -- trigger still sees the rows this statement has yet to remove. Counting the
  -- rows that would remain makes a `DELETE FROM platform_admin_users` abort on
  -- its second row instead of succeeding.
  SELECT count(*) INTO survivors
  FROM public.platform_admin_users
  WHERE user_id <> OLD.user_id;

  IF survivors < 1 THEN
    RAISE EXCEPTION
      'platform_admin_users must retain at least one row; refusing to remove the last platform admin'
      USING ERRCODE = 'check_violation',
            HINT = 'Grant platform admin to another account first.';
  END IF;

  RETURN OLD;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "pp_enforce_platform_admin_floor"
  ON "public"."platform_admin_users";--> statement-breakpoint

CREATE TRIGGER "pp_enforce_platform_admin_floor"
  BEFORE DELETE ON "public"."platform_admin_users"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_enforce_platform_admin_floor"();--> statement-breakpoint

COMMENT ON FUNCTION "public"."pp_enforce_platform_admin_floor"() IS
  'Refuses a DELETE that would leave platform_admin_users empty. Serialises concurrent deletes on a transaction-scoped advisory lock, which is what the application-level count in the admin route cannot do over PostgREST. The floor value is duplicated in MIN_PLATFORM_ADMINS (apps/admin); THIS is authoritative.';--> statement-breakpoint

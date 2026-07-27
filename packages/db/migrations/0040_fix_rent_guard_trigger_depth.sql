-- Make the units.rent_amount derived-column guard actually fire.
--
-- THE BUG
--
-- units.rent_amount is derived from the active lease. The trigger
-- units_block_direct_rent_amount_write (BEFORE UPDATE OF rent_amount ON units)
-- exists to reject direct writes. Its condition was:
--
--   IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount AND pg_trigger_depth() = 0
--
-- pg_trigger_depth() inside a trigger is NEVER 0 — it is >= 1 by definition,
-- because you are already one trigger deep by the time the body runs. Proven
-- with a probe trigger:
--
--   NOTICE:  pg_trigger_depth() inside a trigger = 1
--
-- So the condition could never be true and this guard has NEVER blocked
-- anything. Confirmed behaviourally before the fix: `UPDATE units SET
-- rent_amount = 555` succeeds. The bug dates to
-- _archive/0133_apartment_rent_obligations_and_lease_guards.sql, where the
-- guard was first written; every later copy carried it forward verbatim,
-- including 0039.
--
-- THE FIX, AND WHY 1 IS THE RIGHT NUMBER
--
--   depth 1 = a statement-level UPDATE. Nobody legitimately does this -> block.
--   depth 2 = the sanctioned cascade:
--             a leases write fires leases_sync_unit_rent_amount (depth 1)
--             -> pp_leases_sync_unit_rent_amount()
--             -> pp_sync_unit_rent_amount_from_lease()
--             -> UPDATE units  -> this trigger, at depth 2 -> allow.
--
-- WHY TURNING A DORMANT CONSTRAINT ON IS SAFE HERE
--
-- The whole risk of this change is who it newly breaks. Census before writing:
--
--   * NO code UPDATEs units.rent_amount. The trigger is BEFORE UPDATE OF
--     rent_amount — a column-list trigger fires only when that column is in the
--     SET list, and every other `UPDATE units` in the repo sets ownerUserId,
--     deletedAt or unitNumber. The only writer is the sync function, at depth 2.
--   * PATCH /api/v1/units already rejects rentAmount at the app layer
--     ("Unit rentAmount is derived to prevent rent drift"), so the generic
--     updateUnitById path cannot reach this trigger.
--   * Seeds set rent through LEASES, not units — seed-community.ts inserts units
--     with only communityId/unitNumber. The seed is itself proof the depth-2
--     path works.
--   * Nothing calls pp_sync_unit_rent_amount_from_lease directly; its only
--     caller is pp_leases_sync_unit_rent_amount.
--   * Production data shows ZERO drift: of 60 units, 0 differ from the derived
--     value, 0 hold a rent with no active lease, 0 have a lease but null stored.
--     Nothing to backfill — the derivation held on its own the whole time.
--
-- FOOT-GUN THIS CREATES (deliberate, documented rather than engineered around)
--
-- Calling pp_sync_unit_rent_amount_from_lease() DIRECTLY — from a backfill or a
-- psql session — runs at depth 0, so its UPDATE hits this trigger at depth 1 and
-- is now BLOCKED, with an error saying "update the lease instead" that will read
-- as misleading for what is a legitimate resync. If you need one: touch the
-- lease so the cascade runs, or temporarily disable the trigger the way
-- packages/db/src/seed/seed-community.ts already does for
-- compliance_audit_log's append-only guard.
--
-- Residual gap versus a guard that had always worked: `= 1` also permits a
-- direct rent_amount write issued from inside any OTHER depth-1 trigger.
-- Nothing does that today — units' only other trigger,
-- pp_rls_enforce_tenant_scope, issues no writes.
--
-- NOT ADDRESSED HERE: the same rule is unenforced on INSERT. This trigger is
-- UPDATE-only and POST /api/v1/units accepts a rentAmount at creation, so rent
-- can still be set outside lease derivation on a new unit. Closing that needs
-- the trigger extended AND the POST route changed to reject rentAmount like
-- PATCH does — an API behaviour change affecting unit creation and the
-- onboarding wizards. Its own PR.
--
-- ORDERING: 0039 CREATE OR REPLACE'd this same function to pin its search_path
-- and carried the `= 0` forward. Both are CREATE OR REPLACE, so last writer
-- wins and 0040 MUST be applied after 0039 — which the numbering enforces. The
-- SET search_path clause below is reproduced from 0039 deliberately: dropping it
-- would silently un-pin the function and regress that migration.
--
-- Idempotent. The body is otherwise verbatim from production introspection, so
-- the entire semantic diff is the single digit.

CREATE OR REPLACE FUNCTION public.pp_block_direct_unit_rent_amount_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- depth 1 = direct statement-level write; depth 2 = the lease-sync cascade.
  IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'units.rent_amount is derived from leases.rent_amount; update the lease instead';
  END IF;

  RETURN NEW;
END;
$function$;

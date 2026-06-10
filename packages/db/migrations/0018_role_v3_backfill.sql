-- v3 role transition Phase 2 backfill. Converts every admin-tier row to
-- property_manager, attaches board designations, and leaves root_manager VACANT
-- (claimed later via the claim-root flow). presetKey is intentionally preserved
-- (the Phase-1 compat shim still reads it; dropped in Phase 4). resident rows
-- are untouched. Also widens the two manager-only CHECK constraints to the
-- manager-generation so backfilled property_manager rows may carry permissions
-- + preset_key during the bilingual window. Spec §4 Phase 2.

-- Phase-2 prerequisite (completes the Phase-1 bilingual widening Phase-0 missed):
-- widen the two manager-only CHECK constraints to the manager-generation
-- (manager | property_manager | root_manager) so backfilled property_manager rows
-- may carry permissions + preset_key during the bilingual window. resident/pm_admin
-- still must have NULL permissions + preset_key. Drops are IF EXISTS for re-runnability.
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "chk_non_manager_no_permissions";--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "chk_non_manager_no_permissions"
  CHECK (role IN ('manager', 'property_manager', 'root_manager') OR permissions IS NULL);--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "chk_preset_key_manager_only";--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "chk_preset_key_manager_only"
  CHECK (role IN ('manager', 'property_manager', 'root_manager') OR preset_key IS NULL);--> statement-breakpoint

-- 1. board_president preset → property_manager + designation.
--    Deterministic dedup (defensive; prod has zero collisions): the earliest
--    createdAt row per community keeps 'board_president'; any extras become
--    'board_member' so the one-board-president partial unique index never trips.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY community_id ORDER BY created_at ASC, id ASC) AS rn
  FROM user_roles
  WHERE role = 'manager' AND preset_key = 'board_president'
)
UPDATE user_roles ur
SET role = 'property_manager',
    designation = CASE WHEN r.rn = 1 THEN 'board_president' ELSE 'board_member' END,
    updated_at = now()
FROM ranked r
WHERE ur.id = r.id;
--> statement-breakpoint

-- 2. board_member preset → property_manager + designation board_member.
UPDATE user_roles
SET role = 'property_manager', designation = 'board_member', updated_at = now()
WHERE role = 'manager' AND preset_key = 'board_member';
--> statement-breakpoint

-- 3. cam / site_manager / NULL-preset managers → property_manager (no designation).
UPDATE user_roles
SET role = 'property_manager', updated_at = now()
WHERE role = 'manager' AND (preset_key IN ('cam', 'site_manager') OR preset_key IS NULL);
--> statement-breakpoint

-- 4. pm_admin → property_manager (no designation). COALESCE preserves any already-set
--    legacy_role (39 rows) while stamping the 172 NULL rows so ex-pm_admin rows remain
--    distinguishable from ex-manager/null-preset rows post-backfill (recoverability).
UPDATE user_roles
SET role = 'property_manager',
    legacy_role = COALESCE(legacy_role, 'property_manager_admin'),
    updated_at = now()
WHERE role = 'pm_admin';

-- Migration 0093: Role Simplification — Column swap + constraints
-- IMPORTANT: Must be deployed together with app code changes (Phase 3).
-- Depends on 0092 (backfill data).

-- Make role_v2 NOT NULL (all rows should be backfilled by 0092)
ALTER TABLE "public"."user_roles" ALTER COLUMN "role_v2" SET NOT NULL;

-- Rename columns: old role → role_legacy, role_v2 → role
ALTER TABLE "public"."user_roles" RENAME COLUMN "role" TO "role_legacy";
ALTER TABLE "public"."user_roles" RENAME COLUMN "role_v2" TO "role";

-- Constraints to enforce the hybrid model invariants
ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT chk_manager_has_permissions
    CHECK ((role = 'manager' AND permissions IS NOT NULL) OR (role != 'manager'));

ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT chk_non_manager_no_permissions
    CHECK ((role != 'manager' AND permissions IS NULL) OR (role = 'manager'));

ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT chk_owner_flag_resident_only
    CHECK (role = 'resident' OR is_unit_owner = false);

ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT chk_preset_key_manager_only
    CHECK (role = 'manager' OR preset_key IS NULL);

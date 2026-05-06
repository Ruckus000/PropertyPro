-- Migration 0095: Role Simplification — Drop legacy column
-- Deploy AFTER verifying the new role model works correctly.
-- This is a separate migration for safe rollback.

ALTER TABLE "public"."user_roles" DROP COLUMN "role_legacy";
DROP TYPE IF EXISTS "public"."user_role" CASCADE;

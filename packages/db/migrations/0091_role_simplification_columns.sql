-- Migration 0091: Role Simplification — Add new columns
-- Part of the hybrid 4-role model (resident, manager, pm_admin).
-- This migration is additive only — existing code continues to work with the old `role` column.

-- New enum for simplified roles
CREATE TYPE "public"."user_role_v2" AS ENUM('resident', 'manager', 'pm_admin');

ALTER TABLE "public"."user_roles"
  ADD COLUMN "role_v2" "public"."user_role_v2",
  ADD COLUMN "is_unit_owner" boolean NOT NULL DEFAULT false,
  ADD COLUMN "permissions" jsonb,
  ADD COLUMN "preset_key" text,
  ADD COLUMN "display_title" text,
  ADD COLUMN "legacy_role" text,
  ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now();

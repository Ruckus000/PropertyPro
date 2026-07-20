-- Retire the dead legacy 7-role `user_role` enum (role-v3 R3-06).
--
-- The type has zero column dependents: `user_roles.role` moved to
-- `user_role_v2` long ago. Prod already dropped `user_role` in the pre-squash
-- role-simplification cleanup (archived 0095), so on prod this is a verified
-- no-op. The squashed baseline (0000) still `CREATE TYPE user_role`, so on any
-- from-disk database (dev / CI / test) this drop reconciles the schema with
-- prod. IF EXISTS keeps it idempotent and order-independent (a repair-style
-- migration, not a true contract migration).
DROP TYPE IF EXISTS "public"."user_role";

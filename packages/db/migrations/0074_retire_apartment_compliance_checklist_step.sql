-- 0074_retire_apartment_compliance_checklist_step
--
-- WHY: apartment communities do not have the statutory compliance engine, but
-- their root-manager checklist included `review_compliance`. That row linked
-- users to a feature-gated page, so the onboarding task could never succeed.
-- The application stops creating the item; this backfill retires the rows that
-- were already created without touching the same item for condo or HOA users.
--
-- SAFETY: data-only contract migration. Deploy the code that filters
-- soft-deleted checklist rows before applying this migration, so a partially
-- deployed fleet cannot render a retired item. It changes no schema, policy,
-- trigger, or community data beyond the invalid onboarding rows.
--
-- Idempotent: only rows whose deleted_at is NULL are updated. A re-run finds
-- no matching active row and leaves the original retirement timestamp intact.

UPDATE "public"."onboarding_checklist_items" AS checklist
SET "deleted_at" = now()
FROM "public"."communities" AS community
WHERE checklist."community_id" = community."id"
  AND community."community_type" = 'apartment'
  AND checklist."item_key" = 'review_compliance'
  AND checklist."deleted_at" IS NULL;

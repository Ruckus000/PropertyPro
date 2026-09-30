-- 0080_unit_occupancy — Directory (Phase 0): per-unit occupancy.
--
-- EXPAND-only: two nullable columns + a CHECK. Safe to apply before the code
-- that reads them ships; nothing reads them until the Directory page does.
--
-- occupancy              'owner_occupied' | 'rented' | 'vacant' | NULL (unknown)
-- occupancy_confirmed_at NULL until a manager confirms the value
--
-- Backfill (below) is a BEST GUESS from who is on file, deliberately left
-- unconfirmed (occupancy_confirmed_at stays NULL) so the UI can label it
-- "Unconfirmed" rather than present an inference as fact:
--   no resident rows          -> vacant
--   residents, none an owner  -> rented
--   any resident owner        -> owner_occupied
-- An owner who rents the unit out while still on file is guessed
-- owner_occupied; that is exactly the case the manager's confirmation fixes.
-- Idempotent: only rows still NULL are touched. The UPDATE never writes
-- rent_amount, so units_block_direct_rent_amount_write does not fire.

ALTER TABLE "units" ADD COLUMN "occupancy" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "occupancy_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_occupancy_check" CHECK ("units"."occupancy" IS NULL OR "units"."occupancy" IN ('owner_occupied', 'rented', 'vacant'));
--> statement-breakpoint
UPDATE "units" u
   SET "occupancy" = CASE
         WHEN r.resident_count = 0 THEN 'vacant'
         WHEN r.owner_count = 0 THEN 'rented'
         ELSE 'owner_occupied'
       END
  FROM (
    SELECT un.id,
           count(ur.id) AS resident_count,
           count(ur.id) FILTER (WHERE ur.is_unit_owner) AS owner_count
      FROM "units" un
      LEFT JOIN "user_roles" ur
        ON ur.unit_id = un.id
       AND ur.community_id = un.community_id
       AND ur.role = 'resident'
     GROUP BY un.id
  ) r
 WHERE u.id = r.id
   AND u."occupancy" IS NULL
   AND u."deleted_at" IS NULL;

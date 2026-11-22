-- 0100_restore_overlap_exclusion_constraints
--
-- WHY: two exclusion constraints stop double bookings at the database layer:
--
--   * amenity_reservations.no_overlapping_reservations — two CONFIRMED,
--     live reservations of one amenity cannot overlap in time
--     (first written in _archive/0071_create_work_orders_amenities.sql).
--   * leases.leases_no_overlap_per_unit — two live leases of one unit cannot
--     overlap in dates (_archive/0133_apartment_rent_obligations_and_lease_guards.sql;
--     corrected below to match the app's rule — see the leases block).
--
-- Production has both (checked read-only 2026-11-21 via pg_constraint, with
-- zero overlapping live rows in either table). The `0000` re-baseline was
-- generated from schema.ts, which cannot express an EXCLUDE constraint, so
-- every database built from these migrations — the local agent sandbox, the
-- integration-test DB, CI's Supabase stack — has neither. Code that relies on
-- them (work-orders-service maps 23P01 to a "slot taken" 409) was therefore
-- only ever exercised against production. btree_gist (needed for `WITH =` on
-- a bigint inside a gist index) is likewise absent from the baseline.
--
-- SAFETY: order-independent. On production the extension and the
-- reservations constraint already exist, so those guards skip; the leases
-- constraint is REPLACED (DROP + ADD, a brief ACCESS EXCLUSIVE lock on
-- leases) with one that admits strictly more rows, so no live row can fail
-- it. On a fresh database the tables are empty, so both add cleanly.
--
-- Unlike the archived originals, which RAISE NOTICE and skip when existing
-- rows violate the constraint, these blocks RAISE EXCEPTION naming the
-- offending ids. A silent skip is how a database ends up without a guard
-- nobody knows is missing; overlapping rows are a data-repair decision
-- (.claude/rules/migration-safety.md "Prod Data Repairs"), not something a
-- migration should paper over.
--
-- Idempotent: CREATE EXTENSION IF NOT EXISTS, and each ADD CONSTRAINT sits
-- behind a pg_constraint existence check (the leases DROP fires only on the
-- old definition, which lacks move_out_on).

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

DO $$
DECLARE
  offending text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlapping_reservations'
      AND conrelid = 'amenity_reservations'::regclass
  ) THEN
    SELECT string_agg(format('(%s,%s)', r1.id, r2.id), ', ')
      INTO offending
      FROM amenity_reservations r1
      JOIN amenity_reservations r2
        ON r1.amenity_id = r2.amenity_id
       AND r1.id < r2.id
       AND r1.status = 'confirmed'
       AND r2.status = 'confirmed'
       AND r1.deleted_at IS NULL
       AND r2.deleted_at IS NULL
       AND tstzrange(r1.start_time, r1.end_time, '[)')
         && tstzrange(r2.start_time, r2.end_time, '[)');

    IF offending IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot add no_overlapping_reservations: overlapping confirmed amenity_reservations id pairs %',
        offending;
    END IF;

    ALTER TABLE amenity_reservations
      ADD CONSTRAINT no_overlapping_reservations
      EXCLUDE USING gist (
        amenity_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (status = 'confirmed' AND deleted_at IS NULL);
  END IF;
END
$$;--> statement-breakpoint

-- leases: the constraint must agree with the app's own overlap rule
-- (apps/web/src/lib/leases/lease-rules.ts ensureNoUnitLeaseOverlap), which
--   * ignores leases whose status is 'cancelled' or 'terminated', and
--   * ends a lease at its scheduled move-out when that is earlier than
--     end_date (effectiveEndDate), so a unit can be pre-leased from the day
--     after a move-out.
-- The archived 0133 definition production carries checks neither, so on
-- production re-letting a cancelled lease's dates, or pre-leasing after an
-- early move-out, passes the app check and then fails the INSERT with 23P01,
-- which create-lease rethrows as a 500. This block therefore REPLACES a
-- definition that lacks `move_out_on` (production) and adds the corrected one
-- where none exists (fresh databases). LEAST() ignores NULLs, matching
-- effectiveEndDate. The new predicate admits a superset of what the old one
-- admitted, so rows valid under the old constraint are valid under this one;
-- the pre-check still runs so a database that never had a guard fails loudly.
DO $$
DECLARE
  offending text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leases_no_overlap_per_unit'
      AND conrelid = 'leases'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%move_out_on%'
  ) THEN
    ALTER TABLE leases DROP CONSTRAINT leases_no_overlap_per_unit;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leases_no_overlap_per_unit'
      AND conrelid = 'leases'::regclass
  ) THEN
    SELECT string_agg(format('(%s,%s)', l1.id, l2.id), ', ')
      INTO offending
      FROM leases l1
      JOIN leases l2
        ON l1.unit_id = l2.unit_id
       AND l1.id < l2.id
       AND l1.deleted_at IS NULL
       AND l2.deleted_at IS NULL
       AND l1.status NOT IN ('cancelled', 'terminated')
       AND l2.status NOT IN ('cancelled', 'terminated')
       AND daterange(l1.start_date, COALESCE(LEAST(l1.move_out_on, l1.end_date) + 1, 'infinity'::date), '[)')
         && daterange(l2.start_date, COALESCE(LEAST(l2.move_out_on, l2.end_date) + 1, 'infinity'::date), '[)');

    IF offending IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot add leases_no_overlap_per_unit: overlapping live leases id pairs %',
        offending;
    END IF;

    ALTER TABLE leases
      ADD CONSTRAINT leases_no_overlap_per_unit
      EXCLUDE USING gist (
        unit_id WITH =,
        daterange(start_date, COALESCE(LEAST(move_out_on, end_date) + 1, 'infinity'::date), '[)') WITH &&
      )
      WHERE (deleted_at IS NULL AND status NOT IN ('cancelled', 'terminated'));
  END IF;
END
$$;

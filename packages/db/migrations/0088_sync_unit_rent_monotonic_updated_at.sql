-- 0088_sync_unit_rent_monotonic_updated_at
--
-- WHY: units.updated_at is the optimistic-concurrency token for unit edits.
-- updateUnitById applies a save only while
-- date_trunc('milliseconds', updated_at) still equals the token the client
-- read (JSON carries milliseconds). Every app write goes through the scoped
-- client, which since #1307 stamps
--
--   greatest(date_trunc('milliseconds', now()),
--            date_trunc('milliseconds', updated_at) + interval '1 millisecond')
--
-- so the row's millisecond strictly increases and a stale token can never
-- match again (`nextUpdatedAt` in packages/db/src/scoped-client.ts).
--
-- One writer bypasses the scoped client: this function, run by the
-- leases_sync_unit_rent_amount trigger on every lease insert/update/delete.
-- It set `updated_at = NOW()`, which reopened the defect two ways:
--   * a lease write in the same millisecond as the token's write stored a
--     microsecond NOW() that truncates to the token's millisecond, so a save
--     from a stale read of the unit was ACCEPTED;
--   * NOW() can be earlier than a stamp the +1ms rule already pushed ahead,
--     moving updated_at backwards.
-- This replaces it with the same expression. Keep the two identical.
--
-- Everything else is 0039's definition verbatim, INCLUDING the pinned
-- search_path: 0040's header warns that dropping it silently un-pins the
-- function and regresses 0039. The 0040 rent guard is unaffected: rent_amount
-- is still written from inside the trigger cascade (depth 2).
--
-- SAFETY: a pure function REPAIR — order-independent, safe to apply before or
-- after the code deploys. CREATE OR REPLACE keeps the function's owner and
-- ACL, so 0078's REVOKE EXECUTE (anon, authenticated) / GRANT EXECUTE TO
-- service_role stands.
--
-- Idempotent: CREATE OR REPLACE with the same body is a no-op on re-apply.

CREATE OR REPLACE FUNCTION public.pp_sync_unit_rent_amount_from_lease(target_unit_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  active_rent NUMERIC(10, 2);
BEGIN
  SELECT l.rent_amount
  INTO active_rent
  FROM leases l
  WHERE l.unit_id = target_unit_id
    AND l.deleted_at IS NULL
    AND l.status = 'active'
    AND l.start_date <= CURRENT_DATE
    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE)
  ORDER BY l.start_date DESC, l.id DESC
  LIMIT 1;

  UPDATE units
  SET rent_amount = active_rent,
      updated_at = greatest(
        date_trunc('milliseconds', now()),
        date_trunc('milliseconds', updated_at) + interval '1 millisecond'
      )
  WHERE id = target_unit_id;
END;
$function$;

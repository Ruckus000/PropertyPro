-- Make `updated_at` strictly advance on the three tables whose timestamp is an
-- OPTIMISTIC-CONCURRENCY TOKEN: units, user_roles, unit_occupants.
--
-- ── What the token is, and how it was broken ──
--
-- A caller reads a row, sends its `updated_at` back as `expectedUpdatedAt`, and
-- the write applies only if the row is unchanged since. The comparison truncates
-- both sides to MILLISECONDS, because that is what JSON carries.
--
-- That is sound only if every write MOVES the value being compared. It did not:
-- INSERT takes `updated_at` from `now()` (microseconds, e.g. 12:00:00.123456)
-- while the application stamped a JavaScript `new Date()` on UPDATE
-- (milliseconds, 12:00:00.123000). A create and the first save inside one
-- millisecond therefore both truncate to .123 — the stored token does not move,
-- a stale token still matches, and a SECOND save from the same read is silently
-- ACCEPTED, overwriting the first writer. A missed conflict, which is the
-- dangerous direction.
--
-- ── Why this belongs in the database and not the application ──
--
-- The invariant is per TABLE, not per call site: for a versioned table, EVERY
-- write must advance the timestamp, not only the writes that also compare it.
-- Enforcing that in the app was tried twice and leaked twice.
--
--   * First at the three services that compare the token — but `user_roles` has
--     eleven writers (role promotions, root claims, root disputes, root ops) and
--     only one of them compares it.
--   * Then for every write through `createScopedClient` — but
--     apps/admin/.../communities/[id]/members/[userId]/route.ts writes
--     `user_roles` with the supabase-js service-role client, bypassing it
--     entirely, and stamped `updated_at` from the ADMIN SERVER's clock. Besides
--     the same-millisecond case, a clock behind the database moved the token
--     BACKWARDS (so a stale token could match again) and a clock ahead pinned the
--     row in the future, where `greatest` can never pull it back.
--
-- A BEFORE UPDATE trigger cannot be bypassed by choosing a different client, and
-- it covers one more writer neither app-level attempt could reach:
-- `leases_sync_unit_rent_amount` updates `units.rent_amount` from a lease edit,
-- so a rent change used to be invisible to the unit token. Any UPDATE fires this.
--
-- ── The expression ──
--
-- `greatest(date_trunc('ms', now()), date_trunc('ms', OLD.updated_at) + 1ms)`.
-- Normally the clock has already passed the stored millisecond and the first term
-- wins; in the collision case the two are equal, so the second — one millisecond
-- past the stored value — wins. Either way the truncated value STRICTLY
-- increases, so a stale token can never match after a write.
--
-- Note `greatest(now(), OLD.updated_at + 1ms)` does NOT work, and is written here
-- because it looks like it does: `now()` carries microseconds, so it can sit
-- inside the same millisecond and leave the TRUNCATED value unchanged. The
-- advance has to happen on the truncated value.
--
-- It assigns unconditionally, ignoring whatever the writer supplied. That is the
-- point: the column becomes database-owned, so no application clock can perturb
-- the token. `now()` is transaction-stable, so rows touched in one transaction
-- share a stamp — coherent for a version, and it matches `defaultNow()` on
-- INSERT. Known limit: a row updated more than ~1000 times per second drifts
-- ahead of wall clock by 1 ms per update, because each must out-rank the last.
-- These are human-edited rows; a bounded, visible drift beats a lost update.
--
-- The SET search_path clause is reproduced from 0039 deliberately: dropping it
-- would silently un-pin the function and regress that migration.
--
-- Idempotent: CREATE OR REPLACE plus DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.pp_advance_versioned_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- `greatest` ignores NULLs, so a NULL OLD.updated_at (not possible on these
  -- three tables today, all NOT NULL) still yields the clock reading.
  NEW.updated_at := greatest(
    date_trunc('milliseconds', now()),
    date_trunc('milliseconds', OLD.updated_at) + interval '1 millisecond'
  );
  RETURN NEW;
END;
$function$;

-- One per versioned table. Trigger names are per-table, so the same name is
-- reused deliberately. Firing order among BEFORE ROW triggers is alphabetical —
-- this sorts before `pp_rls_enforce_tenant_scope` and
-- `units_block_direct_rent_amount_write` — and is immaterial here, because this
-- reads and writes only `updated_at` while those touch `community_id` and
-- `rent_amount`.

DROP TRIGGER IF EXISTS pp_advance_updated_at ON public.units;
CREATE TRIGGER pp_advance_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.pp_advance_versioned_updated_at();

DROP TRIGGER IF EXISTS pp_advance_updated_at ON public.user_roles;
CREATE TRIGGER pp_advance_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.pp_advance_versioned_updated_at();

DROP TRIGGER IF EXISTS pp_advance_updated_at ON public.unit_occupants;
CREATE TRIGGER pp_advance_updated_at
  BEFORE UPDATE ON public.unit_occupants
  FOR EACH ROW EXECUTE FUNCTION public.pp_advance_versioned_updated_at();

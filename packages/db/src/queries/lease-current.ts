/**
 * "Is this lease current?" in SQL, for aggregate readers (portfolio,
 * reports) that cannot load every lease into JS.
 *
 * Leases v3 derives a lease's state from its dates; the stored `status` stays
 * `active` through a renewal and a scheduled move-out (only `cancelled` and
 * pre-v3 `terminated`/`renewed`/`expired` leave it). So `status = 'active'`
 * alone counts a renewed lease and its renewal twice, a resident who already
 * moved out as still there, and a signed future lease as already occupied.
 *
 * These fragments mirror `leasePhase` in apps/web/src/lib/leases/lease-state.ts
 * — keep the two in step. They reference the unaliased `leases` table, so use
 * them where `leases` is in FROM.
 */
import { sql, type SQL } from 'drizzle-orm';
import { leases } from '../schema/leases';

/** A signed renewal (an active lease whose previous_lease_id is this one) exists. */
export function leaseHasActiveRenewalSql(): SQL {
  return sql`EXISTS (SELECT 1 FROM leases lease_renewal WHERE lease_renewal.previous_lease_id = ${leases.id} AND lease_renewal.status = 'active' AND lease_renewal.deleted_at IS NULL)`;
}

/**
 * Current on `day` (a date expression): active, started, not moved out before
 * `day`, and not superseded by a renewal once its term ended. A holdover (past
 * its end, no renewal) is current — the resident is still there.
 */
export function leaseCurrentOnSql(day: SQL): SQL {
  return sql`(${leases.status} = 'active' AND ${leases.deletedAt} IS NULL AND ${leases.startDate} <= ${day} AND (${leases.moveOutOn} IS NULL OR ${leases.moveOutOn} >= ${day}) AND NOT (${leases.endDate} IS NOT NULL AND ${leases.endDate} < ${day} AND ${leaseHasActiveRenewalSql()}))`;
}

/**
 * Expiring: current on `today`, its term ends between `today` and `until`, no
 * renewal signed and no move-out scheduled — i.e. still waiting on a decision.
 */
export function leaseExpiringBetweenSql(today: SQL, until: SQL): SQL {
  return sql`(${leaseCurrentOnSql(today)} AND ${leases.endDate} >= ${today} AND ${leases.endDate} <= ${until} AND ${leases.moveOutOn} IS NULL AND NOT ${leaseHasActiveRenewalSql()})`;
}

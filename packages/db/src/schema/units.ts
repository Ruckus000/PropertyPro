/**
 * Units table — individual units/lots within a community.
 * P2-38: Extended with apartment-specific metadata (bedrooms, bathrooms, sqft, rentAmount).
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, date, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { unitOfflineReasonEnum } from './enums';
import { users } from './users';

export const units = pgTable('units', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitNumber: text('unit_number').notNull(),
  building: text('building'),
  floor: integer('floor'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  /** P2-38: Apartment unit metadata */
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  sqft: integer('sqft'),
  /**
   * DERIVED — do not write this directly on UPDATE.
   *
   * Maintained from the unit's active lease by
   * `pp_sync_unit_rent_amount_from_lease()`, which the `leases_sync_unit_rent_amount`
   * trigger invokes on any lease insert/update/delete. To change a unit's rent,
   * change the lease.
   *
   * A direct `UPDATE units SET rent_amount = …` is rejected at the database by
   * `units_block_direct_rent_amount_write` (migration 0040 — before that the guard
   * had a `pg_trigger_depth() = 0` condition that could never be true, so it never
   * fired). `PATCH /api/v1/units` rejects `rentAmount` at the route layer for the
   * same reason.
   *
   * Caveat: the trigger is UPDATE-only, so `POST /api/v1/units` can still set a
   * rent at creation time outside lease derivation.
   */
  rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }),
  /**
   * Directory: 'owner_occupied' | 'rented' | 'vacant', set by the community's
   * manager (it is a judgment call — a seasonal owner who is away stays
   * owner-occupied). Null = never recorded. Apartments never use
   * 'owner_occupied'; the route layer enforces that, the CHECK only the vocabulary.
   */
  occupancy: text('occupancy'),
  /**
   * When a manager last confirmed `occupancy`. Null while the value is a
   * best-guess backfill (migration `unit_occupancy`) — the UI labels those "Unconfirmed"
   * so day one never presents an inferred value as fact.
   */
  occupancyConfirmedAt: timestamp('occupancy_confirmed_at', { withTimezone: true }),
  /**
   * Leases v3 (E7): a unit out of service (storm damage, renovation, model or
   * staff unit). Offline = `offline_since IS NOT NULL`. An offline unit is
   * excluded from vacancy, occupancy, New lease and Transfer. `offline_until`
   * is the expected return date; past it, the UI shows the unit as overdue.
   */
  offlineReason: unitOfflineReasonEnum('offline_reason'),
  offlineNote: text('offline_note'),
  offlineSince: date('offline_since', { mode: 'string' }),
  offlineUntil: date('offline_until', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  check(
    'units_occupancy_check',
    sql`${table.occupancy} IS NULL OR ${table.occupancy} IN ('owner_occupied', 'rented', 'vacant')`,
  ),
  // One live unit per number per community, case-insensitively ("1a" = "1A"),
  // matching how resident CSV import resolves unit numbers. The route checks
  // first for a friendly message; this is the arbiter for concurrent writes.
  // Per community, not per building: import, packages, visitors and finance
  // labels all resolve a unit by its number alone.
  uniqueIndex('units_community_unit_number_unique')
    .on(table.communityId, sql`lower(${table.unitNumber})`)
    .where(sql`${table.deletedAt} IS NULL`),
  check(
    'units_offline_reason_with_since',
    sql`(${table.offlineSince} IS NULL) = (${table.offlineReason} IS NULL)`,
  ),
  check(
    'units_offline_until_after_since',
    sql`${table.offlineUntil} IS NULL OR (${table.offlineSince} IS NOT NULL AND ${table.offlineUntil} >= ${table.offlineSince})`,
  ),
]);

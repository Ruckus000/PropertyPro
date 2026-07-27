/**
 * Units table — individual units/lots within a community.
 * P2-38: Extended with apartment-specific metadata (bedrooms, bathrooms, sqft, rentAmount).
 */
import { bigint, bigserial, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

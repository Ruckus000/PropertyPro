/**
 * Household members: people who live in a unit but have no portal login
 * (a child, a live-in parent, a caregiver).
 *
 * A separate table, not `users`, on purpose. `users.email` is NOT NULL and
 * UNIQUE because it is the sign-in identity; invitations, auth binding and
 * every email path assume a user can log in. A household member may have no
 * email, or share one with the resident they live with. Loosening `users`
 * would ripple through sign-in; this keeps login identity untouched.
 *
 * Contact details are personal data: manager-only at the API, and the RLS
 * SELECT policy is manager-tier too (see the migration).
 */
import { bigint, bigserial, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';

export const unitOccupants = pgTable(
  'unit_occupants',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /**
     * Cascade only matters for hard deletes (demo reset, test reaper); the app
     * soft-deletes units and refuses while anyone is on file.
     */
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    /** Optional and not unique: may be shared with another resident, or absent. */
    email: text('email'),
    phone: text('phone'),
    /** Part of the owner's household (true) or a tenant's (false). Not an owner of record. */
    isOwnerHousehold: boolean('is_owner_household').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * ponytail: unused. Remove hard-deletes (erasure — a soft-deleted row would
     * keep a household member's details forever); the column stays to avoid a
     * migration for nothing, and the scoped client's filter on it is harmless.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('unit_occupants_community_unit_idx').on(table.communityId, table.unitId)],
);

export type UnitOccupant = typeof unitOccupants.$inferSelect;
export type NewUnitOccupant = typeof unitOccupants.$inferInsert;

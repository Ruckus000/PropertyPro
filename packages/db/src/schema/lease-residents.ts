/**
 * Lease residents — Leases v3 (E3, E11): everyone named on a lease.
 *
 * Replaces the single `leases.resident_id`. Each row names EITHER a user (has a
 * login) OR a household member with no login (`unit_occupants`) — never both, never
 * neither (CHECK lease_residents_exactly_one_party).
 *
 * `removed_on` exists for co-tenants leaving mid-lease (E5). The v3 UI does not
 * offer that flow yet, but the column is here so adding it needs no migration.
 *
 * Read access matters: a resident sees a lease when they have a row here with
 * `removed_on IS NULL`. The leases GET route derives its party filter from this
 * table, so a co-tenant sees the lease exactly like the primary resident does.
 */
import { bigint, bigserial, boolean, check, date, foreignKey, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { leases } from './leases';
import { unitOccupants } from './unit-occupants';
import { users } from './users';

export const leaseResidents = pgTable(
  'lease_residents',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    leaseId: bigint('lease_id', { mode: 'number' })
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    /**
     * A household member with no login (`unit_occupants`, managed in the
     * Directory). RESTRICT, deliberately: Directory "Remove" hard-deletes an
     * occupant for privacy erasure (#1303), but a lease party is a contract
     * record — removal is refused with a 409 while they are named on a lease
     * (occupant-service). The retention-vs-erasure call is flagged for review.
     */
    occupantId: bigint('occupant_id', { mode: 'number' }).references(() => unitOccupants.id, {
      onDelete: 'restrict',
    }),
    isPrimary: boolean('is_primary').notNull().default(false),
    addedOn: date('added_on', { mode: 'string' }).notNull(),
    removedOn: date('removed_on', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Same-community guarantees: a lease or occupant from another community
    // cannot be linked even by a caller that bypasses the service layer.
    foreignKey({
      columns: [table.leaseId, table.communityId],
      foreignColumns: [leases.id, leases.communityId],
      name: 'lease_residents_lease_same_community_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.occupantId, table.communityId],
      foreignColumns: [unitOccupants.id, unitOccupants.communityId],
      name: 'lease_residents_occupant_same_community_fk',
    }).onDelete('restrict'),
    index('lease_residents_lease_idx').on(table.leaseId),
    index('lease_residents_user_idx').on(table.communityId, table.userId),
    uniqueIndex('lease_residents_lease_user_uq')
      .on(table.leaseId, table.userId)
      .where(sql`user_id IS NOT NULL`),
    uniqueIndex('lease_residents_lease_occupant_uq')
      .on(table.leaseId, table.occupantId)
      .where(sql`occupant_id IS NOT NULL`),
    index('lease_residents_occupant_idx').on(table.occupantId),
    // One current primary per lease.
    uniqueIndex('lease_residents_one_primary_uq')
      .on(table.leaseId)
      .where(sql`is_primary AND removed_on IS NULL`),
    check('lease_residents_exactly_one_party', sql`num_nonnulls(${table.userId}, ${table.occupantId}) = 1`),
    check(
      'lease_residents_removed_after_added',
      sql`${table.removedOn} IS NULL OR ${table.removedOn} >= ${table.addedOn}`,
    ),
  ],
);

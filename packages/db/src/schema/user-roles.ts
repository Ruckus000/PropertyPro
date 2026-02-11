/**
 * User-Community role junction table.
 * AGENTS #2: Roles are per-community, not global.
 * A user can hold different roles across different communities.
 * ADR-001: exactly one active canonical role per (user_id, community_id).
 */
import { bigint, bigserial, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { communities } from './communities';
import { units } from './units';
import { userRoleEnum } from './enums';

export const userRoles = pgTable(
  'user_roles',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_roles_user_community_unique').on(
      table.userId,
      table.communityId,
    ),
  ],
);

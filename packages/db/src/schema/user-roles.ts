/**
 * User-Community role junction table.
 * AGENTS #2: Roles are per-community, not global.
 * A user can have different roles in different communities.
 */
import { bigserial, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { bigint } from 'drizzle-orm/pg-core';
import { users } from './users';
import { communities } from './communities';
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_roles_user_community_role_unique').on(
      table.userId,
      table.communityId,
      table.role,
    ),
  ],
);

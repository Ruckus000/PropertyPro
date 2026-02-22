import { bigint, bigserial, boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { maintenanceRequests } from './maintenance-requests';
import { users } from './users';

export const maintenanceComments = pgTable('maintenance_comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  requestId: bigint('request_id', { mode: 'number' })
    .notNull()
    .references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  text: text('text').notNull(),
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // No updatedAt — comments are append-only (no PATCH endpoint)
});

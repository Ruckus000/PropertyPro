import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { platformAdminRoleEnum } from './enums';

export const platformAdminUsers = pgTable('platform_admin_users', {
  /** FK → auth.users(id) ON DELETE CASCADE (enforced in DB migration, not Drizzle schema) */
  userId: uuid('user_id').primaryKey(),
  role: platformAdminRoleEnum('role').notNull().default('super_admin'),
  /** FK → auth.users(id) ON DELETE SET NULL (enforced in DB migration, not Drizzle schema) */
  invitedBy: uuid('invited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

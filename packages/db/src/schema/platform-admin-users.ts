import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const platformAdminUsers = pgTable('platform_admin_users', {
  userId: uuid('user_id').primaryKey(),
  role: text('role').notNull().default('super_admin'),
  invitedBy: uuid('invited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

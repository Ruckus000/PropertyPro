/**
 * User preferences — per-user, platform-level key/value settings that are NOT
 * tenant-scoped (no community_id). Used for cross-community UI state such as
 * dismissing the dashboard "finish your site" nudge.
 *
 * AUTHZ: NOT tenant-scoped. Callers MUST authorize on user identity
 * (requireAuthenticatedUserId) and only read/write the actor's own rows.
 * Accessed via the unscoped client behind user-preferences-service.ts
 * (allowlisted), mirroring user-profile-service.ts for the users table.
 */
import { bigserial, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userPreferences = pgTable(
  'user_preferences',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    preferenceKey: text('preference_key').notNull(),
    value: jsonb('value').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_preferences_user_key_unique').on(table.userId, table.preferenceKey),
  ],
);

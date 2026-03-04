/**
 * Demo instances table — created by the admin console for each on-demand demo.
 *
 * @stub Schema defined for Task 2.4-2.6 type-checking.
 *       The actual migration (0032) is created by Task 2.1.
 */
import { bigint, bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const demoInstances = pgTable('demo_instances', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  /** The actual community seeded with demo data (may equal communityId). */
  seededCommunityId: bigint('seeded_community_id', { mode: 'number' }).notNull(),
  /** HMAC-SHA256 secret used to validate demo login tokens. */
  authTokenSecret: text('auth_token_secret').notNull(),
  /** Supabase auth user ID for the pre-provisioned resident demo user. */
  demoResidentUserId: text('demo_resident_user_id'),
  /** Supabase auth user ID for the pre-provisioned board demo user. */
  demoBoardUserId: text('demo_board_user_id'),
  demoResidentEmail: text('demo_resident_email'),
  demoBoardEmail: text('demo_board_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

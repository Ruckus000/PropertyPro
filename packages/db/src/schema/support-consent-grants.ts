import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const supportConsentGrants = pgTable('support_consent_grants', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').notNull(),
  accessLevel: text('access_level').$type<'read_only' | 'read_write'>().notNull().default('read_only'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type SupportConsentGrant = typeof supportConsentGrants.$inferSelect;
export type NewSupportConsentGrant = typeof supportConsentGrants.$inferInsert;

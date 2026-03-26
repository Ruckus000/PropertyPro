/**
 * Compliance Audit Log — append-only table for all compliance and security events.
 *
 * Cross-cutting concern: events are logged from multiple parts of the application.
 * AGENTS #8: This table is exempt from soft-delete filtering (append-only).
 * No updates, no deletes, no soft-delete.
 */
import { bigint, bigserial, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const complianceAuditLog = pgTable('compliance_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  // Nullable so background jobs can record system-generated events without a user actor.
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' }),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

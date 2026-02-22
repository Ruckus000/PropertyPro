/**
 * Maintenance requests table — P2-36 Apartment Operational Dashboard.
 *
 * Minimal schema to power the open-request count metric on the apartment
 * dashboard. Full CRUD API and form UI are deferred to a future task.
 *
 * FK decisions:
 * - community_id: cascade delete (if community goes, requests go)
 * - unit_id: set null on delete (unit may be removed, request survives)
 * - submitted_by_id: restrict (preserve data integrity, cannot delete user with open requests)
 */
import { bigint, bigserial, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';
import { maintenancePriorityEnum, maintenanceStatusEnum } from './enums';

export const maintenanceRequests = pgTable('maintenance_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, {
    onDelete: 'set null',
  }),
  submittedById: uuid('submitted_by_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: maintenanceStatusEnum('status').notNull().default('open'),
  priority: maintenancePriorityEnum('priority').notNull().default('normal'),
  category: text('category').notNull().default('general'),
  assignedToId: uuid('assigned_to_id')
    .references(() => users.id, { onDelete: 'set null' }),
  internalNotes: text('internal_notes'),
  resolutionDescription: text('resolution_description'),
  resolutionDate: timestamp('resolution_date', { withTimezone: true }),
  // photos shape: Array<{ url: string; thumbnailUrl: string | null; storagePath: string; uploadedAt: string }>
  // thumbnailUrl is nullable — thumbnail generation is best-effort fire-and-forget
  // Max 5 entries enforced at API layer
  photos: jsonb('photos'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

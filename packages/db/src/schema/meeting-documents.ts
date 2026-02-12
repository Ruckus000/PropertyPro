/**
 * Meeting Documents — join table linking meetings to documents.
 *
 * Includes community_id for tenant scoping (AGENTS #7, #14).
 */
import { bigint, bigserial, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { meetings } from './meetings';
import { documents } from './documents';

export const meetingDocuments = pgTable('meeting_documents', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  meetingId: bigint('meeting_id', { mode: 'number' })
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  documentId: bigint('document_id', { mode: 'number' })
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),

  attachedBy: uuid('attached_by'),
  attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});


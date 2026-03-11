/**
 * E-signature tables — DocuSeal integration for legally binding e-signatures.
 *
 * Tables:
 * - esign_templates: Maps to DocuSeal templates, community-scoped
 * - esign_submissions: A specific signing request sent to one or more signers
 * - esign_signers: Individual signers within a submission
 * - esign_events: Append-only audit trail for all e-sign actions
 * - esign_consent: UETA/ESIGN Act consent records per user
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';
import { users } from './users';

// ---------------------------------------------------------------------------
// esign_templates
// ---------------------------------------------------------------------------

export const esignTemplates = pgTable(
  'esign_templates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    docusealTemplateId: integer('docuseal_template_id').notNull(),
    externalId: text('external_id').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    sourceDocumentPath: text('source_document_path'),
    templateType: text('template_type'),
    fieldsSchema: jsonb('fields_schema'),
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_esign_templates_community').on(table.communityId),
  ],
);

// ---------------------------------------------------------------------------
// esign_submissions
// ---------------------------------------------------------------------------

export const esignSubmissions = pgTable(
  'esign_submissions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => esignTemplates.id, { onDelete: 'restrict' }),
    docusealSubmissionId: integer('docuseal_submission_id'),
    externalId: text('external_id').notNull().unique(),
    status: text('status').notNull().default('pending'),
    sendEmail: boolean('send_email').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signedDocumentPath: text('signed_document_path'),
    auditCertificatePath: text('audit_certificate_path'),
    linkedDocumentId: bigint('linked_document_id', { mode: 'number' }).references(
      () => documents.id,
      { onDelete: 'set null' },
    ),
    messageSubject: text('message_subject'),
    messageBody: text('message_body'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_esign_submissions_community').on(table.communityId),
    index('idx_esign_submissions_status').on(table.communityId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// esign_signers
// ---------------------------------------------------------------------------

export const esignSigners = pgTable(
  'esign_signers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    submissionId: bigint('submission_id', { mode: 'number' })
      .notNull()
      .references(() => esignSubmissions.id, { onDelete: 'cascade' }),
    docusealSubmitterId: integer('docuseal_submitter_id'),
    externalId: text('external_id').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role').notNull(),
    slug: text('slug'),
    status: text('status').notNull().default('pending'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signedValues: jsonb('signed_values'),
    prefilledFields: jsonb('prefilled_fields'),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    reminderCount: integer('reminder_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_esign_signers_submission').on(table.submissionId),
    index('idx_esign_signers_user').on(table.userId),
    index('idx_esign_signers_email').on(table.email),
  ],
);

// ---------------------------------------------------------------------------
// esign_events (append-only audit trail)
// ---------------------------------------------------------------------------

export const esignEvents = pgTable(
  'esign_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    submissionId: bigint('submission_id', { mode: 'number' })
      .notNull()
      .references(() => esignSubmissions.id, { onDelete: 'cascade' }),
    signerId: bigint('signer_id', { mode: 'number' }).references(
      () => esignSigners.id,
      { onDelete: 'set null' },
    ),
    eventType: text('event_type').notNull(),
    eventData: jsonb('event_data'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    webhookEventId: text('webhook_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updatedAt, NO deletedAt — append-only
  },
  (table) => [
    index('idx_esign_events_submission').on(table.submissionId),
    index('idx_esign_events_webhook').on(table.webhookEventId),
  ],
);

// ---------------------------------------------------------------------------
// esign_consent
// ---------------------------------------------------------------------------

export const esignConsent = pgTable(
  'esign_consent',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentGiven: boolean('consent_given').notNull().default(true),
    consentText: text('consent_text').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_esign_consent_active')
      .on(table.communityId, table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

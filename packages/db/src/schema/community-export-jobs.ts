/**
 * Community data export jobs — asynchronous, resumable, full-record export.
 *
 * ⚠️ This exists to satisfy a STATUTORY obligation, not a convenience feature.
 * Florida associations must retain official records for years (§718.111(12)(b)),
 * and the Terms of Service now affirmatively promise export "at any time,
 * including after your subscription has lapsed". The synchronous CSV export at
 * `/api/v1/export` cannot deliver that: it emits metadata only, covers four
 * tables, and caps at 10,000 rows per table. See
 * docs/audits/2026-08-09-legal-risk-audit.md F-07.
 *
 * ── Why a job table rather than a bigger synchronous route ──
 *
 * A zip cannot be resumed mid-stream, so no amount of chunking rescues a
 * single-request export from the serverless duration ceiling. Instead the work
 * is split into bounded ZIP *volumes* ("parts"): each part is built and uploaded
 * within one invocation, and a keyset cursor records where to resume. That makes
 * the unit of work finite and idempotently retryable.
 *
 * ── Invariants worth knowing before you change this ──
 *
 * - `community_export_jobs_one_active_idx` (partial unique on community_id where
 *   status is queued/running) IS the request-side idempotency key. A double-click
 *   returns the existing job rather than queueing a second full-dataset export.
 * - The worker's claim scan is CROSS-TENANT, so its index must be status-first,
 *   not community-first.
 * - `lease_expires_at` is what stops two overlapping cron ticks working the same
 *   job, and what lets a crashed worker's job be reclaimed rather than sticking
 *   in `running` forever.
 * - Generated archives contain a COPY OF THE ENTIRE ASSOCIATION including
 *   resident PII. They expire (see `expires_at`) and are deleted when the
 *   community is purged — without that, a purged community's whole dataset would
 *   survive in the exports bucket.
 */
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
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { users } from './users';

export const EXPORT_JOB_STATUSES = [
  'queued',
  'running',
  'ready',
  'failed',
  'expired',
  'cancelled',
] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

/** Statuses in which a job still holds the per-community exclusivity slot. */
export const EXPORT_JOB_ACTIVE_STATUSES = ['queued', 'running'] as const;

/**
 * Resume cursor. Persisted whenever the worker hits its soft deadline so the
 * next tick continues rather than restarting — restarting a large export from
 * zero on every tick would never converge.
 */
export interface ExportJobCursor {
  /** Which stage of the export we are in. */
  phase?: 'metadata' | 'documents' | 'finalize';
  /** Table currently being written (phase `metadata`). */
  tableName?: string;
  /** Highest id already written for `tableName` — keyset resume point. */
  lastId?: number;
  /** Zip volume currently being assembled. */
  partIndex?: number;
  entriesInPart?: number;
  bytesInPart?: number;
}

/**
 * Machine-readable record of everything the export did and did NOT include.
 * Surfaced in three places (the archive, the poll response, the ready email)
 * because a truncated export that looks complete is worse than no export.
 */
export interface ExportJobManifest {
  schemaVersion?: number;
  tables?: Array<{
    name: string;
    file: string;
    rowCount: number;
    complete: boolean;
    /**
     * Every entry this table produced. Usually just `[file]`, but a table too
     * large for one invocation is emitted as `<file>` plus one or more
     * `<file>.part-NNN` continuations across volumes — concatenate in order.
     */
    files?: string[];
  }>;
  documents?: { expected: number; included: number; bytes: number };
  warnings?: Array<{ code: string; detail: string; documentId?: number }>;
  parts?: Array<{ index: number; file: string; bytes: number }>;
}

export const communityExportJobs = pgTable(
  'community_export_jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Nullable so purging the requesting user does not destroy the job record. */
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<ExportJobStatus>().notNull().default('queued'),
    includeDocumentFiles: boolean('include_document_files').notNull().default(true),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    /** Worker claim lease. Expiry is how a crashed worker's job gets reclaimed. */
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),
    cursor: jsonb('cursor').$type<ExportJobCursor>().notNull().default({}),
    manifest: jsonb('manifest').$type<ExportJobManifest>().notNull().default({}),
    warningCount: integer('warning_count').notNull().default(0),
    /**
     * Unguessable storage path segment. NOT the authorization mechanism —
     * downloads are authenticated and re-authorized per request; this only keeps
     * paths from being enumerable.
     */
    downloadToken: uuid('download_token')
      .notNull()
      .default(sql`gen_random_uuid()`),
    totalBytes: bigint('total_bytes', { mode: 'number' }),
    partCount: integer('part_count'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** When the generated archive is deleted. Re-requesting is always free. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('community_export_jobs_community_status_idx').on(table.communityId, table.status),
    // STATUS-FIRST on purpose: the worker scans for claimable jobs across ALL
    // tenants, so a community-first index would not serve it.
    index('community_export_jobs_claim_idx').on(table.status, table.queuedAt),
    index('community_export_jobs_expiry_idx').on(table.expiresAt),
  ],
);

export const communityExportJobParts = pgTable(
  'community_export_job_parts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Required for the tenant-scope trigger and RLS, even though job_id implies it. */
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    jobId: bigint('job_id', { mode: 'number' })
      .notNull()
      .references(() => communityExportJobs.id, { onDelete: 'cascade' }),
    partIndex: integer('part_index').notNull(),
    storagePath: text('storage_path').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
    fileCount: integer('file_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('community_export_job_parts_job_index_idx').on(table.jobId, table.partIndex),
    index('community_export_job_parts_community_idx').on(table.communityId),
  ],
);

export type CommunityExportJob = typeof communityExportJobs.$inferSelect;
export type CommunityExportJobPart = typeof communityExportJobParts.$inferSelect;

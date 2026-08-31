/**
 * Community export job lifecycle — queue, claim, advance, finish.
 *
 * This is the ONLY module in the export feature that reaches for the unscoped
 * client, and it does so for exactly one reason: the worker's claim scan is
 * cross-tenant. It runs from a cron with no session and no membership, looking
 * for claimable jobs across every community, so there is no `communityId` to
 * scope by until a job has been selected. Every read of tenant DATA happens
 * elsewhere, through `createScopedClient(job.communityId)`.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { communityExportJobParts, communityExportJobs, logAuditEvent } from '@propertypro/db';
import type { CommunityExportJob, ExportJobCursor, ExportJobManifest } from '@propertypro/db';
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from '@propertypro/db/filters';
// The worker's claim scan is cross-tenant by nature: a cron with no session,
// looking for claimable jobs in ANY community, so there is no communityId to
// scope by until a job has been selected. Touches ONLY the two job tables; every
// read of tenant DATA happens via createScopedClient in export-worker.ts.
// AUTHZ: export-job queue — cross-tenant cron claim scan; job tables only, no tenant data.
import { createUnscopedClient } from '@propertypro/db/unsafe';

/** How long a worker holds a claim before another tick may reclaim the job. */
const LEASE_DURATION_MS = 10 * 60 * 1000;

/** Jobs older than this in `running` with a dead lease are treated as crashed. */
export const EXPORT_JOB_LEASE_MS = LEASE_DURATION_MS;

export interface QueueExportJobResult {
  job: CommunityExportJob;
  /** True when an in-flight job already existed and was returned instead. */
  deduplicated: boolean;
}

/**
 * Queue an export, or return the community's existing in-flight job.
 *
 * Idempotency is enforced by the partial unique index
 * `community_export_jobs_one_active_idx`, not by this read-then-write — two
 * concurrent requests can both pass the SELECT. The insert is therefore allowed
 * to fail on the constraint, and we re-read. A double-click must never queue a
 * second full-dataset export.
 */
export async function queueExportJob(params: {
  communityId: number;
  requestedBy: string;
  includeDocumentFiles?: boolean;
}): Promise<QueueExportJobResult> {
  const db = createUnscopedClient();

  const existing = await findActiveJob(params.communityId);
  if (existing) return { job: existing, deduplicated: true };

  try {
    const [created] = await db
      .insert(communityExportJobs)
      .values({
        communityId: params.communityId,
        requestedBy: params.requestedBy,
        includeDocumentFiles: params.includeDocumentFiles ?? true,
        status: 'queued',
      })
      .returning();

    if (!created) throw new Error('Failed to create export job');

    await logAuditEvent({
      userId: params.requestedBy,
      action: 'create',
      resourceType: 'community_export_job',
      resourceId: String(created.id),
      communityId: params.communityId,
      newValues: { status: 'queued', includeDocumentFiles: created.includeDocumentFiles },
    });

    return { job: created, deduplicated: false };
  } catch (error) {
    // Lost the race on the partial unique index — the other request's job is
    // the answer for both of us.
    const raced = await findActiveJob(params.communityId);
    if (raced) return { job: raced, deduplicated: true };
    throw error;
  }
}

/** The community's in-flight job, if any. */
export async function findActiveJob(communityId: number): Promise<CommunityExportJob | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select()
    .from(communityExportJobs)
    .where(
      and(
        eq(communityExportJobs.communityId, communityId),
        inArray(communityExportJobs.status, ['queued', 'running']),
        isNull(communityExportJobs.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** One job by id, without tenant scoping. Callers MUST check `communityId`. */
export async function findJobById(jobId: number): Promise<CommunityExportJob | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select()
    .from(communityExportJobs)
    .where(eq(communityExportJobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

/** Jobs visible to a community, newest first. */
export async function listJobsForCommunity(
  communityId: number,
  limit = 20,
): Promise<CommunityExportJob[]> {
  const db = createUnscopedClient();
  return db
    .select()
    .from(communityExportJobs)
    .where(
      and(
        eq(communityExportJobs.communityId, communityId),
        isNull(communityExportJobs.deletedAt),
      ),
    )
    .orderBy(sql`${communityExportJobs.queuedAt} DESC`)
    .limit(limit);
}

/**
 * Atomically claim the next runnable job.
 *
 * The concurrency control is the WHERE clause, not a preceding SELECT. Two
 * overlapping cron ticks both issue this UPDATE; Postgres serialises them and
 * only one gets a row back, because the winner's write moves `lease_expires_at`
 * out of range for the loser. This is the same state-guarded-update discipline
 * `executeCommunitySoftDelete` uses for the deletion cron.
 *
 * A crashed worker needs no cleanup: its lease simply expires and the next tick
 * reclaims the job with its cursor intact, so work resumes rather than restarts.
 */
export async function claimNextExportJob(
  claimedBy: string,
  now: Date = new Date(),
): Promise<CommunityExportJob | null> {
  const db = createUnscopedClient();

  const candidates = await db
    .select({ id: communityExportJobs.id })
    .from(communityExportJobs)
    .where(
      and(
        inArray(communityExportJobs.status, ['queued', 'running']),
        isNull(communityExportJobs.deletedAt),
        // Column-to-column. A job that has burned its attempts must stop being
        // re-claimed. `markJobFailed` consults maxAttempts too, but only in the
        // catch path — an invocation killed by the platform deadline never
        // reaches it, so without this predicate a job that reliably outlives its
        // budget is re-claimed on every tick, forever.
        lt(communityExportJobs.attemptCount, communityExportJobs.maxAttempts),
        or(
          isNull(communityExportJobs.leaseExpiresAt),
          lt(communityExportJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .orderBy(asc(communityExportJobs.queuedAt))
    .limit(5);

  for (const candidate of candidates) {
    const [claimed] = await db
      .update(communityExportJobs)
      .set({
        status: 'running',
        attemptCount: sql`${communityExportJobs.attemptCount} + 1`,
        startedAt: sql`COALESCE(${communityExportJobs.startedAt}, now())`,
        leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
        claimedBy,
        updatedAt: now,
      })
      .where(
        and(
          eq(communityExportJobs.id, candidate.id),
          inArray(communityExportJobs.status, ['queued', 'running']),
          // Re-assert lease expiry AND the attempt cap INSIDE the update.
          // Without this the guard is a TOCTOU: another tick could claim, or
          // exhaust the last attempt, between our SELECT and UPDATE.
          lt(communityExportJobs.attemptCount, communityExportJobs.maxAttempts),
          or(
            isNull(communityExportJobs.leaseExpiresAt),
            lt(communityExportJobs.leaseExpiresAt, now),
          ),
        ),
      )
      .returning();

    if (claimed) return claimed;
    // Lost this one to a concurrent tick; try the next candidate.
  }

  return null;
}

/**
 * Fail jobs that have exhausted their attempts, so they stop being invisible.
 *
 * The attempt cap in `claimNextExportJob` stops such a job being re-claimed, but
 * on its own it would leave the row sitting in `running` with an expired lease
 * forever — the UI would poll a job that can never progress and never errors.
 * This is the other half: flip it to `failed` with a code the card can explain.
 *
 * Deliberately NOT restricted to `running`. A job can exhaust its attempts and
 * be returned to `queued` by `markJobFailed`'s retry branch on the very attempt
 * that reaches the cap, so both statuses need sweeping.
 *
 * Returns the ids it failed, so the cron can log a non-zero count rather than
 * reporting a clean run while jobs die.
 */
export async function failExhaustedJobs(now: Date = new Date()): Promise<number[]> {
  const db = createUnscopedClient();

  const rows = await db
    .update(communityExportJobs)
    .set({
      status: 'failed',
      errorCode: 'ATTEMPTS_EXHAUSTED',
      errorMessage:
        'The export stopped after using all of its retries. This usually means one table is too large to process in the time available. Request a new export, or contact support if it happens again.',
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(communityExportJobs.status, ['queued', 'running']),
        isNull(communityExportJobs.deletedAt),
        gte(communityExportJobs.attemptCount, communityExportJobs.maxAttempts),
        // Only once the lease has lapsed — a job still inside a live lease may
        // be mid-flight on its final attempt and about to succeed.
        or(
          isNull(communityExportJobs.leaseExpiresAt),
          lt(communityExportJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: communityExportJobs.id });

  return rows.map((r) => r.id);
}

/** Persist progress and renew the lease so the next tick resumes here. */
export async function saveJobProgress(
  jobId: number,
  cursor: ExportJobCursor,
  manifest: ExportJobManifest,
  now: Date = new Date(),
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communityExportJobs)
    .set({
      cursor,
      manifest,
      warningCount: manifest.warnings?.length ?? 0,
      // Released, not renewed: the invocation is ending, so the next tick should
      // be able to pick this straight up rather than wait out a live lease.
      leaseExpiresAt: null,
      status: 'running',
      updatedAt: now,
    })
    .where(eq(communityExportJobs.id, jobId));
}

/** Record a completed zip volume. Idempotent on (jobId, partIndex). */
export async function recordJobPart(params: {
  jobId: number;
  communityId: number;
  partIndex: number;
  storagePath: string;
  byteSize: number;
  fileCount: number;
}): Promise<void> {
  const db = createUnscopedClient();
  await db
    .insert(communityExportJobParts)
    .values({
      jobId: params.jobId,
      communityId: params.communityId,
      partIndex: params.partIndex,
      storagePath: params.storagePath,
      byteSize: params.byteSize,
      fileCount: params.fileCount,
    })
    // A retried part overwrites its own orphaned row rather than colliding.
    .onConflictDoUpdate({
      target: [communityExportJobParts.jobId, communityExportJobParts.partIndex],
      set: {
        storagePath: params.storagePath,
        byteSize: params.byteSize,
        fileCount: params.fileCount,
        updatedAt: new Date(),
      },
    });
}

/** A job's completed zip volumes, in order. */
export async function listJobParts(jobId: number) {
  const db = createUnscopedClient();
  return db
    .select()
    .from(communityExportJobParts)
    .where(
      and(
        eq(communityExportJobParts.jobId, jobId),
        isNull(communityExportJobParts.deletedAt),
      ),
    )
    .orderBy(asc(communityExportJobParts.partIndex));
}

/**
 * Mark a job ready.
 *
 * `notifiedAt` is stamped in the SAME statement that flips to `ready`, so the
 * completion email can be sent afterwards without risking a double-send if the
 * worker is re-invoked between the two.
 */
export async function markJobReady(params: {
  jobId: number;
  manifest: ExportJobManifest;
  totalBytes: number;
  partCount: number;
  expiresAt: Date;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const db = createUnscopedClient();
  await db
    .update(communityExportJobs)
    .set({
      status: 'ready',
      manifest: params.manifest,
      warningCount: params.manifest.warnings?.length ?? 0,
      totalBytes: params.totalBytes,
      partCount: params.partCount,
      completedAt: now,
      expiresAt: params.expiresAt,
      notifiedAt: now,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(communityExportJobs.id, params.jobId));
}

/**
 * Record a failure. Below `maxAttempts` the job returns to `queued` with its
 * CURSOR PRESERVED, so a retry resumes rather than restarting from zero — the
 * difference between converging and never finishing on a large association.
 */
export async function markJobFailed(params: {
  jobId: number;
  errorCode: string;
  errorMessage: string;
  now?: Date;
}): Promise<{ willRetry: boolean }> {
  const now = params.now ?? new Date();
  const db = createUnscopedClient();

  const job = await findJobById(params.jobId);
  const willRetry = !!job && job.attemptCount < job.maxAttempts;

  await db
    .update(communityExportJobs)
    .set({
      status: willRetry ? 'queued' : 'failed',
      errorCode: params.errorCode,
      errorMessage: params.errorMessage.slice(0, 2000),
      leaseExpiresAt: null,
      completedAt: willRetry ? null : now,
      updatedAt: now,
    })
    .where(eq(communityExportJobs.id, params.jobId));

  return { willRetry };
}

/** Cancel a queued/running job at the requester's direction. */
export async function cancelExportJob(
  jobId: number,
  actorUserId: string,
  communityId: number,
): Promise<boolean> {
  const db = createUnscopedClient();
  const [cancelled] = await db
    .update(communityExportJobs)
    .set({ status: 'cancelled', leaseExpiresAt: null, completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(communityExportJobs.id, jobId),
        eq(communityExportJobs.communityId, communityId),
        inArray(communityExportJobs.status, ['queued', 'running']),
      ),
    )
    .returning();

  if (cancelled) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'community_export_job',
      resourceId: String(jobId),
      communityId,
      newValues: { status: 'cancelled' },
    });
  }

  return !!cancelled;
}

/** Jobs whose archives have aged out and should be deleted from storage. */
export async function findExpiredReadyJobs(now: Date = new Date()) {
  const db = createUnscopedClient();
  return db
    .select({
      id: communityExportJobs.id,
      communityId: communityExportJobs.communityId,
      downloadToken: communityExportJobs.downloadToken,
    })
    .from(communityExportJobs)
    .where(
      and(
        eq(communityExportJobs.status, 'ready'),
        lt(communityExportJobs.expiresAt, now),
      ),
    )
    .limit(50);
}

/** Flip an expired job's status after its objects are gone. */
export async function markJobExpired(jobId: number): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communityExportJobs)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(communityExportJobs.id, jobId));
}

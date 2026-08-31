/**
 * GET|POST /api/v1/internal/community-export-worker
 *
 * Drives the async community-data export. Each invocation claims at most a few
 * jobs, works each until its soft deadline, and yields — a job that needs more
 * time simply resumes on the next tick with its cursor intact.
 *
 * Both verbs are exported because Vercel Cron issues GET while manual/local
 * invocation is usually POST (same shape as `internal/account-lifecycle`).
 *
 * Auth: cron secret (COMMUNITY_EXPORT_CRON_SECRET, falling back to CRON_SECRET).
 * `scripts/verify-internal-cron-auth.ts` fails the build if this is missing.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { captureException } from '@sentry/nextjs';
import { COMMUNITY_EXPORT_RETENTION_DAYS } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  claimNextExportJob,
  findExpiredReadyJobs,
  findJobById,
  markJobExpired,
  markJobFailed,
  markJobReady,
} from '@/lib/services/export/export-job-service';
import { sendExportReadyEmail } from '@/lib/services/export/export-notification';
import { runExportJob } from '@/lib/services/export/export-worker';
import { purgeCommunityExportArchives } from '@/lib/services/export/purge-export-archives';

// archiver and the storage stream are Node stream APIs — this cannot run on Edge.
export const runtime = 'nodejs';
/**
 * Invocation budget. The worker uses 80% of this before flushing and yielding,
 * so a job larger than one tick converges over several rather than timing out.
 *
 * ⚠️ Must not exceed the account's actual Vercel ceiling — no other route here
 * goes above 60. If the plan permits more, raise BOTH this and `BUDGET_MS`.
 */
export const maxDuration = 60;
const BUDGET_MS = 60_000;

/** Jobs claimed per invocation. Small: each can consume the whole budget. */
const MAX_JOBS_PER_RUN = 2;

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(
    req,
    process.env.COMMUNITY_EXPORT_CRON_SECRET,
    process.env.CRON_SECRET,
  );

  const startedAt = Date.now();
  const invocationId = `export-worker-${startedAt}`;
  const summary = {
    claimed: 0,
    completed: 0,
    notified: 0,
    yielded: 0,
    failed: 0,
    expired: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < MAX_JOBS_PER_RUN; i += 1) {
    // Leave room for the reaper pass below.
    if (Date.now() - startedAt > BUDGET_MS * 0.7) break;

    const job = await claimNextExportJob(`${invocationId}-${i}`);
    if (!job) break;
    summary.claimed += 1;

    try {
      const remainingMs = BUDGET_MS - (Date.now() - startedAt);
      const result = await runExportJob(job, { budgetMs: Math.max(remainingMs, 5_000) });

      if (result.status === 'completed') {
        const expiresAt = new Date(
          Date.now() + COMMUNITY_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        await markJobReady({
          jobId: job.id,
          // The manifest AS BUILT by this run, not the stale one from the row we
          // claimed — otherwise a completed export would report zero warnings.
          manifest: result.manifest,
          totalBytes: result.bytesWritten,
          partCount: result.partsWritten,
          expiresAt,
        });
        summary.completed += 1;

        // AFTER the ready flip, never before. `markJobReady` stamps `notifiedAt`
        // in the same statement that sets `ready`, so a worker re-invoked between
        // the two cannot re-claim this job and send a second email. The send is
        // also allowed to fail quietly: the archive is already built, recorded
        // and downloadable, and a mail outage must not undo that.
        const readyJob = await findJobById(job.id);
        const notified = readyJob
          ? await sendExportReadyEmail(readyJob)
          : { sent: false, reason: 'job row disappeared after completion' };
        if (notified.sent) {
          summary.notified += 1;
        } else {
          summary.errors.push(`job ${job.id} notify: ${notified.reason ?? 'unknown'}`);
        }
      } else {
        summary.yielded += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Below maxAttempts the job returns to `queued` with its CURSOR INTACT, so
      // a retry resumes rather than restarting — the difference between
      // converging and never finishing on a large association.
      const { willRetry } = await markJobFailed({
        jobId: job.id,
        errorCode: 'EXPORT_WORKER_ERROR',
        errorMessage: message,
      });
      if (!willRetry) {
        summary.failed += 1;
        captureException(error, {
          tags: { job: 'community-export-worker', exportJobId: String(job.id) },
        });
      }
      summary.errors.push(`job ${job.id}: ${message}`);
    }
  }

  // ── Reaper ────────────────────────────────────────────────────────────────
  //
  // Generated archives are a full copy of an association including resident PII.
  // Letting them accumulate indefinitely would be its own breach surface, and
  // "export at any time" is satisfied by free re-request, not by hosting one
  // archive forever.
  try {
    for (const expired of await findExpiredReadyJobs()) {
      await purgeCommunityExportArchives(expired.communityId);
      await markJobExpired(expired.id);
      summary.expired += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.errors.push(`reaper: ${message}`);
    captureException(error, { tags: { job: 'community-export-worker', phase: 'reaper' } });
  }

  return NextResponse.json({ data: summary });
});

export const GET = handler;
export const POST = handler;

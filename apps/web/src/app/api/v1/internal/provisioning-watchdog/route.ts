import { NextResponse, type NextRequest } from 'next/server';
import { captureException, captureMessage } from '@sentry/nextjs';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  reconcileLostCheckoutSignups,
  recoverStuckProvisioningJobs,
} from '@/lib/services/provisioning-service';

function requireProvisioningWatchdogSecret(req: NextRequest): void {
  requireCronSecret(req, process.env.PROVISIONING_RETRY_SECRET, process.env.CRON_SECRET);
}

async function handleWatchdog(req: NextRequest): Promise<NextResponse> {
  requireProvisioningWatchdogSecret(req);

  const summary = await recoverStuckProvisioningJobs();

  // A1: independent pass for paid-but-webhook-lost signups (invisible to the
  // job-based recovery above because no provisioning_jobs row was ever created).
  const reconcile = await reconcileLostCheckoutSignups();
  if (reconcile.recovered > 0) {
    captureMessage('provisioning_reconcile_recovered', {
      level: 'warning',
      extra: { reconcile },
    });
  }
  if (reconcile.failed > 0) {
    captureMessage('provisioning_reconcile_failed', {
      level: 'error',
      extra: { reconcile },
    });
    for (const failure of reconcile.failures) {
      captureException(new Error(failure.errorMessage), {
        extra: {
          component: 'provisioning-reconcile',
          signupRequestId: failure.signupRequestId,
        },
      });
    }
  }

  if (summary.failed > 0) {
    captureMessage('provisioning_watchdog_failed_jobs', {
      level: 'error',
      extra: { summary },
    });
    for (const failure of summary.failures) {
      captureException(new Error(failure.errorMessage), {
        extra: {
          component: 'provisioning-watchdog',
          jobId: failure.jobId,
          signupRequestId: failure.signupRequestId,
        },
      });
    }
  } else if (summary.completed > 0) {
    captureMessage('provisioning_watchdog_recovered_jobs', {
      level: 'warning',
      extra: { summary },
    });
  }

  // Live communities with billing but no admin role — the watchdog can't repair
  // them automatically (owner is ambiguous), so escalate for human triage. See
  // the resolved 281/474 case in `provisioning-service.ts:findOrphanCommunities`.
  if (summary.orphans.length > 0) {
    captureMessage('provisioning_watchdog_orphan_communities', {
      level: 'error',
      extra: { orphans: summary.orphans, count: summary.orphans.length },
    });
  }

  return NextResponse.json({ data: { ...summary, reconcile } });
}

export const GET = withErrorHandler(handleWatchdog);
export const POST = withErrorHandler(handleWatchdog);

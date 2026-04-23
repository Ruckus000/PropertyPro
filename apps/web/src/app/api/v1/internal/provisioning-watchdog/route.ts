import { NextResponse, type NextRequest } from 'next/server';
import { captureException, captureMessage } from '@sentry/nextjs';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { recoverStuckProvisioningJobs } from '@/lib/services/provisioning-service';

function requireProvisioningWatchdogSecret(req: NextRequest): void {
  requireCronSecret(
    req,
    process.env.PROVISIONING_RETRY_SECRET ?? process.env.CRON_SECRET,
  );
}

async function handleWatchdog(req: NextRequest): Promise<NextResponse> {
  requireProvisioningWatchdogSecret(req);

  const summary = await recoverStuckProvisioningJobs();

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

  return NextResponse.json({ data: summary });
}

export const GET = withErrorHandler(handleWatchdog);
export const POST = withErrorHandler(handleWatchdog);

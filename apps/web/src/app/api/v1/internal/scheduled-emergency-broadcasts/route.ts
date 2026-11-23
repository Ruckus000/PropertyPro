/**
 * Sends scheduled ("send later") emergency alerts whose time has arrived.
 *
 * Runs every 5 minutes, so an alert goes out 0 to 5 minutes after its chosen
 * time. An alert found more than 60 minutes late is marked missed, not sent.
 *
 * Authorization: `requireCronSecret` only. The job's cross-tenant access is
 * documented on `processDueScheduledBroadcasts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { withCronJob } from '@/lib/cron/with-cron-job';
import { processDueScheduledBroadcasts } from '@/lib/services/emergency-broadcast-schedule-service';
import { scheduledEmergencyBroadcastsContract } from './contract';

const handler = withErrorHandler(
  runRoute(scheduledEmergencyBroadcastsContract, async ({ req }) => {
    requireCronSecret(
      req,
      process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET,
      process.env.CRON_SECRET,
    );

    // The runner supplies the `{ data: ... }` envelope.
    return processDueScheduledBroadcasts();
  }),
);

// Vercel Cron issues GET; POST is accepted too so the scheduler's verb can
// never be the thing that breaks the job. `withCronJob` must be OUTERMOST
// (`pnpm guard:cron-job-tagging`).
const cronHandler = withCronJob('scheduled-emergency-broadcasts', handler);

export const GET = cronHandler;
export const POST = cronHandler;

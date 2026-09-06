/**
 * Fires community-site publishes whose scheduled time has arrived.
 *
 * Launch blocker #7. Runs every 15 minutes — the same cadence as
 * calendar-event-reminders, and fine-grained enough for the statutory windows
 * this serves (14 days for owner meetings, 48 hours for board meetings), where
 * a quarter-hour of slack is immaterial.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processDueSitePublishes } from '@/lib/services/site-publish-schedule-service';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processDueSitePublishes();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; POST is accepted too so the scheduler's verb can
// never be the thing that breaks the job. Neither reads a body or query params.
const cronHandler = withCronJob('scheduled-site-publish', handler);

export const GET = cronHandler;
export const POST = cronHandler;

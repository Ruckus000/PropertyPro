/**
 * Daily cron: Calculate and apply late fees to overdue assessment line items.
 *
 * Runs at 07:00 UTC daily (after overdue transition at 06:00).
 * For each overdue line item, computes the late fee based on the
 * parent assessment's lateFeeAmountCents and lateFeeDaysGrace settings.
 *
 * Schedule: 0 7 * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processLateFees } from '@/lib/services/assessment-automation-service';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processLateFees();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
const cronHandler = withCronJob('late-fee-processor', handler);

export const GET = cronHandler;
export const POST = cronHandler;

/**
 * Monthly cron: Auto-generate assessment line items for recurring assessments.
 *
 * Runs at 12:00 UTC on the 1st of each month, when it is the 1st in every US
 * zone (at 05:00 UTC, Central time was still on the last day of the previous
 * month from December to March). For each active recurring assessment across
 * all communities, generates line items for the community's current month.
 * Skips one-time assessments and already-generated periods.
 *
 * Schedule: 0 12 1 * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processRecurringAssessments } from '@/lib/services/assessment-automation-service';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processRecurringAssessments();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
const cronHandler = withCronJob('generate-assessments', handler);

export const GET = cronHandler;
export const POST = cronHandler;

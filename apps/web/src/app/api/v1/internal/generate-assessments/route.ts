/**
 * Monthly cron: Auto-generate assessment line items for recurring assessments.
 *
 * Runs at 05:00 UTC on the 1st of each month. For each active recurring
 * assessment across all communities, generates line items for the current
 * period. Skips one-time assessments and already-generated periods.
 *
 * Schedule: 0 5 1 * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processRecurringAssessments } from '@/lib/services/assessment-automation-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET);

  const summary = await processRecurringAssessments();
  return NextResponse.json({ data: summary });
});

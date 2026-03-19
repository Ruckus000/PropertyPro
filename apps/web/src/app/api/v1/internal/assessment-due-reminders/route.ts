/**
 * Daily cron: Send assessment due date reminder emails.
 *
 * Runs at 08:00 UTC daily (after overdue transitions and late fee processing).
 * Finds all pending line items due in exactly 7 days and sends reminder
 * emails to the associated unit owners.
 *
 * Schedule: 0 8 * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processAssessmentDueReminders } from '@/lib/services/assessment-automation-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET);

  const summary = await processAssessmentDueReminders();
  return NextResponse.json({ data: summary });
});

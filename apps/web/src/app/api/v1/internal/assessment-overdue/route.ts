/**
 * Daily cron: Transition pending assessment line items to overdue status.
 *
 * Runs at 06:00 UTC daily. Finds all line items with status='pending'
 * and due_date < today, then updates them to status='overdue'.
 *
 * Schedule: 0 6 * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processOverdueTransitions } from '@/lib/services/assessment-automation-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET);

  const summary = await processOverdueTransitions();
  return NextResponse.json({ data: summary });
});

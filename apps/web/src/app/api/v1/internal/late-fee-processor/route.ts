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

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET);

  const summary = await processLateFees();
  return NextResponse.json({ data: summary });
});

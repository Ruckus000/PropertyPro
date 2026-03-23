/**
 * Daily cron: Check compliance checklist items for overdue entries
 * and send digest alerts to community admins.
 *
 * Runs at 07:30 UTC daily. Iterates all condo/HOA communities,
 * detects overdue items, and sends one digest notification per community.
 *
 * Schedule: 30 7 * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processComplianceAlerts } from '@/lib/services/compliance-alert-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.COMPLIANCE_CRON_SECRET);

  const summary = await processComplianceAlerts();
  return NextResponse.json({ data: summary });
});

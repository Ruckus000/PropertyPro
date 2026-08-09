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

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.COMPLIANCE_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processComplianceAlerts();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
export const GET = handler;
export const POST = handler;

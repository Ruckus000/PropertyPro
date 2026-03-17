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
import { UnauthorizedError } from '@/lib/api/errors/UnauthorizedError';
import { processRecurringAssessments } from '@/lib/services/assessment-automation-service';

function readBearerToken(req: NextRequest): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice('bearer '.length).trim();
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const expectedSecret = process.env.ASSESSMENT_CRON_SECRET;
  const token = readBearerToken(req);

  if (!expectedSecret || !token || token !== expectedSecret) {
    throw new UnauthorizedError();
  }

  const summary = await processRecurringAssessments();
  return NextResponse.json({ data: summary });
});

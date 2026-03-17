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
import { UnauthorizedError } from '@/lib/api/errors/UnauthorizedError';
import { processLateFees } from '@/lib/services/assessment-automation-service';

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

  const summary = await processLateFees();
  return NextResponse.json({ data: summary });
});

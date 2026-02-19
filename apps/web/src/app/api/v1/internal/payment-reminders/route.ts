import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { UnauthorizedError } from '@/lib/api/errors/UnauthorizedError';
import { processPaymentReminders } from '@/lib/services/payment-alert-scheduler';

function readBearerToken(req: NextRequest): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice('bearer '.length).trim();
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const expectedSecret = process.env.PAYMENT_REMINDERS_CRON_SECRET;
  const token = readBearerToken(req);

  if (!expectedSecret || !token || token !== expectedSecret) {
    throw new UnauthorizedError();
  }

  const summary = await processPaymentReminders();
  return NextResponse.json({ data: summary });
});

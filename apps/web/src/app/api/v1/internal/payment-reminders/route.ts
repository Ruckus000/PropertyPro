import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processPaymentReminders } from '@/lib/services/payment-alert-scheduler';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.PAYMENT_REMINDERS_CRON_SECRET);

  const summary = await processPaymentReminders();
  return NextResponse.json({ data: summary });
});

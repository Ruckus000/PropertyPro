import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processPaymentReminders } from '@/lib/services/payment-alert-scheduler';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.PAYMENT_REMINDERS_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processPaymentReminders();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
export const GET = handler;
export const POST = handler;

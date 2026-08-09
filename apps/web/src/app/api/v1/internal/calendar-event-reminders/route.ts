import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processCalendarEventReminders } from '@/lib/services/calendar-event-reminder-service';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.CALENDAR_EVENT_REMINDERS_CRON_SECRET, process.env.CRON_SECRET);

  const summary = await processCalendarEventReminders();
  return NextResponse.json({ data: summary });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
export const GET = handler;
export const POST = handler;

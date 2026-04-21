import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processCalendarEventReminders } from '@/lib/services/calendar-event-reminder-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.CALENDAR_EVENT_REMINDERS_CRON_SECRET);

  const summary = await processCalendarEventReminders();
  return NextResponse.json({ data: summary });
});

import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processNotificationDigests } from '@/lib/services/notification-digest-processor';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.NOTIFICATION_DIGEST_CRON_SECRET);

  const summary = await processNotificationDigests();
  return NextResponse.json({ data: summary });
});

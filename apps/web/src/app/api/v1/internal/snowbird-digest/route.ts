/**
 * Snowbird digest cron — hourly send tick.
 *
 * Bearer-token-authenticated (called by the scheduled job, no session). The
 * processor self-gates on 8 AM community-local time, so an hourly cadence just
 * guarantees each community's window is hit. See snowbird-digest-processor.ts.
 */
import type { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { withErrorHandler } from '@/lib/api/error-handler';
import { processSnowbirdDigests } from '@/lib/services/snowbird-digest-processor';
import { NextResponse } from 'next/server';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.SNOWBIRD_DIGEST_CRON_SECRET);
  const result = await processSnowbirdDigests();
  return NextResponse.json({ data: result });
});

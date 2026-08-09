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

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.SNOWBIRD_DIGEST_CRON_SECRET, process.env.CRON_SECRET);
  const result = await processSnowbirdDigests();
  return NextResponse.json({ data: result });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
export const GET = handler;
export const POST = handler;

/**
 * Insurance-alerts cron — daily expiry/renewal tick.
 *
 * Bearer-token-authenticated (called by the scheduled job, no session). Alerts
 * fire on band transitions, so a single daily run suffices — the processor is
 * idempotent within a band via each row's `lastAlertBand`.
 *
 * The endpoint is dark until INSURANCE_ALERTS_CRON_SECRET is set: requireCronSecret
 * throws Unauthorized when the expected secret is undefined, so deploying this
 * code sends nothing until the secret (and schedule) are configured.
 * See insurance-alert-processor.ts.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { withErrorHandler } from '@/lib/api/error-handler';
import { processInsuranceAlerts } from '@/lib/services/insurance-alert-processor';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.INSURANCE_ALERTS_CRON_SECRET);
  const result = await processInsuranceAlerts();
  return NextResponse.json({ data: result });
});

/**
 * GET /api/v1/internal/readiness
 *
 * Deployment readiness check. Validates stripe_prices completeness,
 * database connectivity, and Supabase auth availability.
 *
 * Auth: Bearer token via READINESS_CHECK_SECRET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, sql } from '@propertypro/db/filters';
import { stripePrices } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { SIGNUP_PLAN_OPTIONS } from '@/lib/auth/signup-schema';
import type { CommunityType } from '@propertypro/shared';

interface CheckResult {
  status: 'pass' | 'fail';
  missing?: string[];
  error?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.READINESS_CHECK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Record<string, CheckResult> = {};

  // 1. Stripe prices completeness check
  try {
    const db = createUnscopedClient();
    const missing: string[] = [];

    for (const [communityType, plans] of Object.entries(SIGNUP_PLAN_OPTIONS)) {
      for (const plan of plans) {
        const [row] = await db
          .select({ id: stripePrices.id })
          .from(stripePrices)
          .where(
            and(
              eq(stripePrices.planId, plan.id),
              eq(stripePrices.communityType, communityType as CommunityType),
              eq(stripePrices.billingInterval, 'month'),
            ),
          )
          .limit(1);

        if (!row) {
          missing.push(`${plan.id}/${communityType}/month`);
        }
      }
    }

    checks.stripe_prices = missing.length === 0
      ? { status: 'pass' }
      : { status: 'fail', missing };
  } catch (err) {
    checks.stripe_prices = {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // 2. Database connectivity check
  try {
    const db = createUnscopedClient();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'pass' };
  } catch (err) {
    checks.database = {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // 3. Supabase auth check
  try {
    const admin = createAdminClient();
    await admin.auth.admin.listUsers({ perPage: 1 });
    checks.supabase_auth = { status: 'pass' };
  } catch (err) {
    checks.supabase_auth = {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // Determine overall status
  const dbOk = checks.database?.status === 'pass';
  const authOk = checks.supabase_auth?.status === 'pass';
  const pricesOk = checks.stripe_prices?.status === 'pass';

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (dbOk && authOk && pricesOk) {
    status = 'healthy';
  } else if (dbOk && authOk) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const statusCode = status === 'unhealthy' ? 503 : 200;
  return NextResponse.json({ status, checks }, { status: statusCode });
}

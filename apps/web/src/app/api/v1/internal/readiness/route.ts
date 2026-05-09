/**
 * GET /api/v1/internal/readiness
 *
 * Deployment readiness check. Validates stripe_prices completeness,
 * database connectivity, and Supabase auth availability.
 *
 * Auth: Bearer token via READINESS_CHECK_SECRET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  checkDatabaseConnectivity,
  checkPendingSignupsSchema,
  checkStripePricesCompleteness,
  checkSupabaseAuth,
  type CheckResult,
} from '@/lib/services/readiness-service';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.READINESS_CHECK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Record<string, CheckResult> = {};

  // 1. Stripe prices completeness check
  checks.stripe_prices = await checkStripePricesCompleteness();

  // 2. Database connectivity check
  checks.database = await checkDatabaseConnectivity();

  // 3. Runtime schema compatibility check
  checks.schema_compatibility = await checkPendingSignupsSchema();

  // 4. Supabase auth check
  checks.supabase_auth = await checkSupabaseAuth();

  // 5. REAUTH_JWT_SECRET check — required for billing portal, account
  // deletion, and any other reauth-gated route. A missing/short secret in
  // production silently 500s those flows from the user's perspective.
  {
    const secret = process.env.REAUTH_JWT_SECRET;
    if (!secret) {
      checks.reauth_jwt_secret = {
        status: 'fail',
        error: 'REAUTH_JWT_SECRET is not set',
      };
    } else if (secret.length < 32) {
      checks.reauth_jwt_secret = {
        status: 'fail',
        error: `REAUTH_JWT_SECRET is too short (${secret.length} chars; min 32)`,
      };
    } else {
      checks.reauth_jwt_secret = { status: 'pass' };
    }
  }

  // Determine overall status
  const dbOk = checks.database?.status === 'pass';
  const authOk = checks.supabase_auth?.status === 'pass';
  const pricesOk = checks.stripe_prices?.status === 'pass';
  const schemaOk = checks.schema_compatibility?.status === 'pass';
  const reauthOk = checks.reauth_jwt_secret?.status === 'pass';

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (dbOk && authOk && schemaOk && pricesOk && reauthOk) {
    status = 'healthy';
  } else if (dbOk && authOk && schemaOk && reauthOk) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const statusCode = status === 'unhealthy' ? 503 : 200;
  return NextResponse.json({ status, checks }, { status: statusCode });
}

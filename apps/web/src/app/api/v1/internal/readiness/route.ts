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
    requireCronSecret(req, process.env.READINESS_CHECK_SECRET, process.env.CRON_SECRET);
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

  // 6. Load-bearing secrets whose absence fails SILENTLY in production.
  //
  // Each of these was actually unset in production and nothing surfaced it:
  //   - CRON_SECRET: Vercel Cron only sends `Authorization: Bearer $CRON_SECRET`
  //     when the var exists. Unset, it sends no header, every scheduled job
  //     401s, and the platform still reports the cron as registered and firing.
  //     All 10 jobs were dead for months with a green dashboard.
  //   - OTP_HMAC_SECRET: access-request OTPs are 6 digits, so the HMAC secret is
  //     the only barrier to precomputing the whole space.
  //   - TOKEN_ENCRYPTION_KEY: calendar sync and accounting connectors throw
  //     without it, so those features 500 rather than degrade.
  //
  // This is the check that would have caught the cron outage on day one. It
  // deliberately makes "a secret is missing" a monitorable signal instead of
  // silence.
  for (const [name, minLength] of [
    ['CRON_SECRET', 16],
    ['OTP_HMAC_SECRET', 16],
    ['TOKEN_ENCRYPTION_KEY', 64],
  ] as const) {
    const value = process.env[name];
    const key = name.toLowerCase();
    if (!value) {
      checks[key] = { status: 'fail', error: `${name} is not set` };
    } else if (value.length < minLength) {
      checks[key] = {
        status: 'fail',
        error: `${name} is too short (${value.length} chars; min ${minLength})`,
      };
    } else {
      checks[key] = { status: 'pass' };
    }
  }

  // Determine overall status
  const dbOk = checks.database?.status === 'pass';
  const authOk = checks.supabase_auth?.status === 'pass';
  const pricesOk = checks.stripe_prices?.status === 'pass';
  const schemaOk = checks.schema_compatibility?.status === 'pass';
  const reauthOk = checks.reauth_jwt_secret?.status === 'pass';
  // Grouped with the other secret checks rather than the connectivity ones: a
  // missing secret is a real fault, but the process is still serving traffic,
  // so it must not read as 'healthy' while stopping short of 'unhealthy'.
  const secretsOk =
    checks.cron_secret?.status === 'pass' &&
    checks.otp_hmac_secret?.status === 'pass' &&
    checks.token_encryption_key?.status === 'pass';

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (dbOk && authOk && schemaOk && pricesOk && reauthOk && secretsOk) {
    status = 'healthy';
  } else if (dbOk && authOk && schemaOk && reauthOk) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const statusCode = status === 'unhealthy' ? 503 : 200;
  return NextResponse.json({ status, checks }, { status: statusCode });
}

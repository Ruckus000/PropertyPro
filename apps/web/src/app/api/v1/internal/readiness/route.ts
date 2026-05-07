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
// AUTHZ: Readiness check — global stripe_prices + DB connectivity (no community context)
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

const REQUIRED_PENDING_SIGNUP_COLUMNS = [
  'address_line_1',
  'city',
  'state',
  'zip_code',
] as const;

function extractRows<T>(raw: unknown): T[] {
  return Array.isArray(raw)
    ? raw as T[]
    : (raw as { rows?: T[] }).rows ?? [];
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

  // 3. Runtime schema compatibility check
  try {
    const db = createUnscopedClient();
    const rows = extractRows<{ column_name: string }>(await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pending_signups'
        AND column_name IN ('address_line_1', 'city', 'state', 'zip_code')
    `));
    const found = new Set(rows.map((row) => row.column_name));
    const missing = REQUIRED_PENDING_SIGNUP_COLUMNS
      .filter((column) => !found.has(column))
      .map((column) => `pending_signups.${column}`);

    if (missing.length > 0) {
      console.error(JSON.stringify({
        event: 'readiness.schema_compatibility_failed',
        missing,
        requiredMigration: '0145_pending_signups_structured_address',
      }));
    }

    checks.schema_compatibility = missing.length === 0
      ? { status: 'pass' }
      : { status: 'fail', missing };
  } catch (err) {
    checks.schema_compatibility = {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // 4. Supabase auth check
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

/**
 * Readiness Service
 *
 * Infrastructure readiness checks used by the deployment-readiness probe at
 * /api/v1/internal/readiness. Each helper encapsulates one DB-, schema-, or
 * auth-level check and returns a normalized `CheckResult`.
 *
 * AUTHZ: cron/probe-only — caller MUST validate the readiness secret BEFORE
 * invoking. Helpers operate against global tables (stripe_prices,
 * information_schema) and the Supabase admin API.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/internal/readiness/route.ts
 */
import { stripePrices } from '@propertypro/db';
import { and, eq, sql } from '@propertypro/db/filters';
// AUTHZ: Readiness check — global stripe_prices + DB connectivity (no community context). Caller MUST validate the readiness secret before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { SIGNUP_PLAN_OPTIONS } from '@/lib/auth/signup-schema';
import type { CommunityType } from '@propertypro/shared';

export interface CheckResult {
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
  return Array.isArray(raw) ? (raw as T[]) : ((raw as { rows?: T[] }).rows ?? []);
}

/**
 * Walk every (planId × communityType) combination in `SIGNUP_PLAN_OPTIONS`
 * and confirm a corresponding `stripe_prices` row exists for the monthly
 * billing interval. Returns the missing combinations as
 * `${planId}/${communityType}/month`.
 */
export async function checkStripePricesCompleteness(): Promise<CheckResult> {
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

    return missing.length === 0 ? { status: 'pass' } : { status: 'fail', missing };
  } catch (err) {
    return {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Confirm the database accepts a trivial `SELECT 1` round-trip.
 */
export async function checkDatabaseConnectivity(): Promise<CheckResult> {
  try {
    const db = createUnscopedClient();
    await db.execute(sql`SELECT 1`);
    return { status: 'pass' };
  } catch (err) {
    return {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Confirm the `pending_signups` table has the structured-address columns
 * introduced by migration `0145_pending_signups_structured_address`. Logs a
 * structured error event when a required column is missing so deploys can
 * be aborted before user-facing breakage.
 */
export async function checkPendingSignupsSchema(): Promise<CheckResult> {
  try {
    const db = createUnscopedClient();
    const rows = extractRows<{ column_name: string }>(
      await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pending_signups'
          AND column_name IN ('address_line_1', 'city', 'state', 'zip_code')
      `),
    );
    const found = new Set(rows.map((row) => row.column_name));
    const missing = REQUIRED_PENDING_SIGNUP_COLUMNS.filter((column) => !found.has(column)).map(
      (column) => `pending_signups.${column}`,
    );

    if (missing.length > 0) {
      console.error(
        JSON.stringify({
          event: 'readiness.schema_compatibility_failed',
          missing,
          requiredMigration: '0145_pending_signups_structured_address',
        }),
      );
    }

    return missing.length === 0 ? { status: 'pass' } : { status: 'fail', missing };
  } catch (err) {
    return {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Confirm the Supabase admin auth API is reachable with valid credentials.
 */
export async function checkSupabaseAuth(): Promise<CheckResult> {
  try {
    const admin = createAdminClient();
    await admin.auth.admin.listUsers({ perPage: 1 });
    return { status: 'pass' };
  } catch (err) {
    return {
      status: 'fail',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

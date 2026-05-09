/**
 * Revenue Snapshot Data Service
 *
 * Database-touching helpers for the revenue-snapshot cron + health routes.
 * Kept separate from `revenue-snapshot-service.ts` (which is intentionally
 * pure-computation, no DB/Stripe deps) so that file's testability stays
 * intact.
 *
 * AUTHZ: cron/probe-only — caller MUST validate the relevant secret BEFORE
 * invoking. Operates against the platform-wide `revenue_snapshots` table.
 *
 * Companions:
 *   - apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts (POST cron)
 *   - apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts (GET probe)
 */
import { revenueSnapshots } from '@propertypro/db';
import { desc } from '@propertypro/db/filters';
// AUTHZ: Revenue snapshot cron + health — platform-wide metrics, not tenant-scoped. Caller MUST validate the relevant secret before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface LatestSnapshotForHealth {
  computedAt: Date;
}

/**
 * Fetch only the `computedAt` timestamp of the most recently written
 * revenue snapshot. Returns `null` when no snapshot has ever been written.
 *
 * Used by the health probe to detect cron staleness without loading the
 * full row.
 */
export async function getLatestRevenueSnapshotForHealth(): Promise<LatestSnapshotForHealth | null> {
  const db = createUnscopedClient();
  const [latest] = await db
    .select({ computedAt: revenueSnapshots.computedAt })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.computedAt))
    .limit(1);
  return latest ?? null;
}

/**
 * GET /api/v1/internal/revenue-snapshot/health
 *
 * Returns 200 if the latest revenue_snapshots row was written within 26 hours.
 * Returns 503 otherwise — wired into external uptime monitor.
 *
 * No auth — health probes must be reachable by monitors.
 */
import { NextResponse } from 'next/server';
import { getLatestRevenueSnapshotForHealth } from '@/lib/services/revenue-snapshot-data-service';

const STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;

export async function GET() {
  const latest = await getLatestRevenueSnapshotForHealth();

  if (!latest) {
    return NextResponse.json(
      { status: 'unhealthy', reason: 'no_snapshots_ever' },
      { status: 503 },
    );
  }

  const msSince = Date.now() - new Date(latest.computedAt).getTime();
  const hoursSince = msSince / (60 * 60 * 1000);

  if (msSince > STALE_THRESHOLD_MS) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        last_snapshot_at: latest.computedAt,
        hours_since: Math.round(hoursSince * 10) / 10,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: 'healthy',
    last_snapshot_at: latest.computedAt,
    hours_since: Math.round(hoursSince * 10) / 10,
  });
}

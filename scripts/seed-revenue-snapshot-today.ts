/**
 * Post-deploy one-shot: write a single revenue_snapshots row for today.
 *
 * Calls the same cron handler in-process. Safe to run multiple times — each
 * invocation appends a new row (append-only table).
 *
 * Usage: scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts
 */
const PORT = process.env.PORT ?? '3000';
const SECRET = process.env.REVENUE_SNAPSHOT_CRON_SECRET;

async function main() {
  if (!SECRET) {
    console.error('REVENUE_SNAPSHOT_CRON_SECRET not set');
    process.exit(1);
  }
  const res = await fetch(`http://localhost:${PORT}/api/v1/internal/revenue-snapshot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) {
    console.error('Snapshot failed:', res.status, await res.text());
    process.exit(1);
  }
  const body = await res.json();
  console.log('Snapshot written:', body);
}

main();

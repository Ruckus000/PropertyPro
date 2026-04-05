# Revenue Snapshot -- Runbook

## Overview

The revenue-snapshot cron fires daily at 02:00 UTC (`apps/web/vercel.json`).
It computes MRR from `communities` + `stripe_prices` + `billing_groups`, reconciles
against the Stripe API, runs sanity checks, and **appends** one row to
`revenue_snapshots`.

This table is append-only. Multiple rows per day are allowed. Queries use
`DISTINCT ON (snapshot_date) ... ORDER BY computed_at DESC` to read the latest.

## Deployment checklist

Before the first cron run after deploy:
1. Set `REVENUE_SNAPSHOT_CRON_SECRET` in Vercel project env (prod + preview).
2. Confirm `/api/v1/internal/revenue-snapshot/health` returns 503 (expected -- no rows yet).
3. Run the seed script to write Day 0:
   `scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts`
4. Confirm `/health` now returns 200.

## Manual trigger

```bash
curl -X POST https://<host>/api/v1/internal/revenue-snapshot \
  -H "Authorization: Bearer $REVENUE_SNAPSHOT_CRON_SECRET"
```

Returns JSON with `snapshot_date`, `mrr_cents`, `drift_pct`, `delta_pct`.

## Correcting a bad snapshot

**Do not UPDATE or DELETE rows.** The table is append-only. If a snapshot is wrong:

1. Identify the bad row:
   `SELECT id, computed_at, mrr_cents FROM revenue_snapshots WHERE snapshot_date = 'YYYY-MM-DD' ORDER BY computed_at DESC;`
2. Fix the upstream data (e.g., correct the Stripe subscription status).
3. Run the cron manually. The new row will have a later `computed_at` and
   will be the one that queries return via `DISTINCT ON`.

## Job failure modes and responses

| Symptom | Meaning | Action |
|---|---|---|
| Health = 503, last snapshot > 26h old | Cron did not fire, or it failed | Check Vercel cron logs, manually trigger |
| Sentry: `revenue_snapshot_sanity_check_failed` | Computed MRR negative, <potential, or >10x prior | Investigate data: check for bad subscription_status writes |
| Sentry: `revenue_snapshot_drift_high` (drift_pct > 5) | Stripe active count != DB active count | Webhook processing lag -- check stripe_webhook_events for delays |
| Sentry: `revenue_snapshot_delta_high` (\|delta\| > 20%) | MRR jumped > 20% day-over-day | Verify via Stripe dashboard; may be legitimate |
| Sentry: `revenue_snapshot_compute_error` | Unknown subscription_status encountered | New Stripe status value; update `ALL_STATUSES` constant |
| Sentry: `revenue_snapshot_reconciliation_failed` | Stripe API call failed during reconciliation | Snapshot still wrote with null drift; not blocking |

## Backfilling historical data

We do **not** backfill historical MRR. Day 0 is the seed script above. For
historical revenue before Day 0, query Stripe directly (one-off script, not
automated).

## Testing the runbook (PR 1 merge gate)

On staging:
1. Manually POST to the cron endpoint with the secret, verify a row is written.
2. Simulate staleness:
   `UPDATE revenue_snapshots SET computed_at = now() - interval '30 hours';`
   Verify `/health` returns 503.
3. Manually trigger a new snapshot, verify `/health` returns 200.

All three steps pass = runbook accepted. Record results in the PR description.

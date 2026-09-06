# Runbook — cron alerting

**Opened:** 2026-09-05, closing the gap left by #1042.

Seventeen scheduled jobs run in production (`apps/web/vercel.json`). This is how
you find out when one of them stops working, and what to do about it.

## Why there are three mechanisms and not one

Each catches something the others structurally cannot.

| Mechanism | Catches | Blind to |
|---|---|---|
| `job` tag on Sentry events (#1047) | a job that throws | a job that fails behind a 200; a job that never runs |
| `cron_job_reported_failures` (#1048) | failures reported in a 200 body | a job that never runs |
| `cron_runs` + `/api/v1/internal/cron-health` | a job that stopped running | nothing, but it is 15 min–30 h late depending on cadence |

The third exists because of a real outage: in 2026-08 **all seventeen crons
returned 401 for months** behind a green Vercel dashboard, and that produced
**zero** Sentry events — `requireCronSecret` throws `UnauthorizedError`, an
`AppError`, and `withErrorHandler` returns for those *before* Sentry capture.
Registration is not evidence; `vercel crons ls` listed every job as healthy the
entire time it was dead.

## Sentry UI configuration

**Recorded here deliberately.** UI-only config is config that rots — this repo
has already lost `SENTRY_PROJECT_ADMIN` for 133 days. If the Sentry project is
ever recreated, rebuild these from this section.

### Rule 1 — "Cron job failed"

- **When:** a new issue is created **OR** the issue is seen more than 3 times in 1 hour
- **If:** the event's tags match `job` **is set**
- **If:** the event's `environment` equals `production`
- **Then:** send a notification
- **Action interval:** 30 minutes

One rule covers all seventeen jobs, and covers both shapes: an unhandled 500
(`captureException` through `withErrorHandler`) and a failure reported behind a
200 (`captureMessage('cron_job_reported_failures')`). Both carry the tag,
because `withCronJob` sets it on the *isolation* scope.

### Rule 2 — "Destructive cron circuit breaker"

- **If:** tags match `job` is set **AND** the message contains `cron_purge_cap_tripped`
- **Then:** notify **on every occurrence** (no digest)

`account-lifecycle`'s `PURGE_SAFETY_CAP` refuses to purge when the candidate set
is implausibly large. That means the candidate predicate probably regressed, and
the data is irreversible. Worth waking up for; not worth batching.

### Project settings

- **Spike Protection: on.** The export worker runs every 5 minutes (288/day); a
  persistent failure there would otherwise eat the error quota.
- The **one free cron monitor** included in the plan is pointed at
  `scheduled-site-publish` — the job that actually failed — so its behaviour can
  be compared against the `cron-health` probe before deciding whether the other
  sixteen are worth $0.78/monitor/month.

### External uptime monitor

`GET https://www.getpropertypro.com/api/v1/internal/cron-health`, no auth, alert
on non-200, 5-minute interval. Same monitor as `docs/LAUNCH-BLOCKERS.md` §5 asks
for — one setup covers readiness, `/api/health` and cron freshness.

## Triage

### An alert fires with a `job` tag

1. The tag names the job. Its route is `apps/web/src/app/api/v1/internal/<slug>/`
   (`notification-digests-process` is the one nested path).
2. **Read the `[cause]` chain, not the top-level message.** Drizzle labels a
   client-side driver throw as `Failed query: <SQL>`, which reads like a schema
   fault for a statement Postgres never received. That mis-read cost a full
   investigation in #1042.
3. Confirm against the live logs:
   ```bash
   vercel logs "$(vercel inspect getpropertypro.com | grep -oE 'property-pro-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | head -1)" --json \
     | grep 'internal/<slug>'
   ```

### `cron-health` returns 503

The body's `stale_jobs` names them, and each entry carries a `reason`:

| reason | meaning | first thing to check |
|---|---|---|
| `never_run` | no row at all — the job has not run once since the heartbeat shipped | is it still in `vercel.json`? did the deploy succeed? |
| `never_succeeded` | it runs and fails every time | Sentry, filtered to that `job` tag |
| `overdue` | it succeeded once but not recently | Sentry first; then whether Vercel is still firing it |

`never_run` across **all** jobs at once means the platform is not invoking any
cron — check `CRON_SECRET` before anything else. That is the 2026-08 shape, and
it presents as a totally healthy dashboard.

### Replaying a job by hand

Every cron accepts GET and POST, and falls back to the platform `CRON_SECRET`
when no per-route secret is set:

```bash
curl -sS -X POST -H "authorization: Bearer $CRON_SECRET" \
  https://www.getpropertypro.com/api/v1/internal/<slug>
```

A successful replay updates `cron_runs`, so `cron-health` goes green on its own
once the underlying cause is fixed. Do **not** clear rows in `cron_runs` to
silence the probe — that removes the evidence and the alert both.

## What is deliberately NOT alerted

- **`console.error`.** There is no `captureConsoleIntegration` in
  `sentry.server.config.ts`, so console output is a breadcrumb on other events,
  never an event itself. Anything that must alert has to `captureMessage`.
- **A heartbeat write that fails.** `withCronJob` swallows it. Monitoring that
  can cause an outage is worse than no monitoring, and that code runs precisely
  when the database is already unhappy.
- **Partial failures on a job that otherwise worked.** These raise
  `cron_job_reported_failures` at `error` level and land in the 30-minute
  digest, not a per-occurrence page.

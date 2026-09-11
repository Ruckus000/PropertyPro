# Runbook — cron alerting

**Opened:** 2026-09-05, closing the gap left by #1042.

**Updated:** 2026-09-11 — the jobs now live in **two** `vercel.json` files.

**Eighteen** scheduled jobs run in production, across two Vercel projects:
**seventeen** on web (`apps/web/vercel.json`) and, since wave 4 of the admin
console redesign (#1123), **one** on admin (`apps/admin/vercel.json`) — that
project's first cron. This is how you find out when one of them stops working,
and what to do about it.

**Everything below is about the seventeen web jobs unless it says otherwise.**
The eighteenth is deliberately outside all three mechanisms; it has its own
section at the end, and you should read it before assuming this runbook covers
it.

## Why there are three mechanisms and not one

Each catches something the others structurally cannot.

| Mechanism | Catches | Blind to |
|---|---|---|
| `job` tag on Sentry events (#1047) | a job that throws | a job that fails behind a 200; a job that never runs |
| `cron_job_reported_failures` (#1048) | failures reported in a 200 body | a job that never runs |
| `cron_runs` + `/api/v1/internal/cron-health` | a job that stopped running | a job that returns 200 while failing internally — the heartbeat records success on HTTP status alone. Late by 20 min–32 days depending on cadence |

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

One rule covers all seventeen **web** jobs, and covers both shapes: an unhandled
500 (`captureException` through `withErrorHandler`) and a failure reported behind
a 200 (`captureMessage('cron_job_reported_failures')`). Both carry the tag,
because `withCronJob` sets it on the *isolation* scope.

It does **not** cover the admin push-dispatch job: that route does not go through
`withCronJob`, and the one event it emits is tagged `cron`, not `job`. See
"The eighteenth job" below.

#### Why each job gets its own ISSUE, not just its own tag

The `job` tag makes an event *filterable*; it does not participate in grouping.
Every cron 500 funnels through the single `Sentry.captureException` in
`error-handler.ts`, so grouping is decided by the error alone — and drizzle
reports failures as a uniform `Failed query: <SQL>`. Two different jobs breaking
the same way would therefore land in **one issue**: resolving or ignoring it
silences the other, and the notification names one job while two are down.

`withCronJob` sets `fingerprint: ['{{ default }}', '<slug>']` alongside the tag.
`{{ default }}` is Sentry's placeholder for its own grouping components, kept so
that distinct errors *within* one job are not flattened together; the slug
splits the issue per job. It is set on the isolation scope for the same reason
the tag is — it has to reach captures made deep in a nested async service.

**This is the only fingerprint in the codebase.** There was no prior convention;
if a second one is ever added, follow this shape rather than inventing another.

**What the test does and does not pin.**
`apps/web/__tests__/cron/with-cron-job.test.ts` asserts that two jobs failing
with the *same* error get *different* fingerprints — that is real, and it pins
the slug discriminator. It does **not** pin the `{{ default }}` placeholder, and
no test can: the SDK stores the array verbatim (`scope.js` `setFingerprint`) and
concatenates it unexamined, because expansion happens server-side at ingest. So
the assertion compares the literal in the test to the literal in the source, and
a typo like `{{default}}` would pass everything while silently collapsing every
error within a job into one issue. **Confirm the spelling once against a real
grouped issue in Sentry; do not trust the suite for it.**

**The cost, which is not zero.** Splitting by job means a platform-wide outage
that breaks all seventeen with the same error produces seventeen issues and
seventeen notifications instead of one. It also permanently separates a shared
service's errors (`stripe-service`, `@propertypro/email`) between cron and
non-cron callers, so resolving one does not cover the other. That is accepted:
the alternative is two jobs sharing one issue, where resolving it silences the
other and the notification names one job while two are down. A platform-wide
outage also reaches you through the 503 probe regardless.

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

Four things about configuring it, each of which has a wrong default:

1. **`www`, not the apex.** `getpropertypro.com` answers **307** to the `www`
   host. A monitor that does not follow redirects, or that counts 3xx as down,
   false-alarms forever.
2. **GET or HEAD, both fine now — but this was broken until #1075.** HEAD
   returned 401 while GET returned 200, because middleware's method allowlist
   for `/api/v1/internal/` listed GET and POST only. Many monitors send HEAD by
   default. **Never configure the monitor to accept 401 on this endpoint**: 401
   is the signature of the 2026-08 outage it exists to catch.
3. **Alert on non-200, not on 503.** A database failure is a **500** — this
   route has no `withErrorHandler` — and it carries no `job` tag, so Sentry
   Rule 1 will not match it either. 429 is also reachable: the probe sits in
   the middleware `read` tier at 100 req/min per IP.
4. **Do not key on a body substring. `"unhealthy"` contains `"healthy"`.** A
   naive keyword check reports green on every 503. Key on `"status":"healthy"`
   or `"stale_jobs":[]`, or on the status code alone.

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

| reason | stale? | meaning | first thing to check |
|---|---|---|---|
| `never_registered` | yes | no row at all | **`CRON_SECRET`** — see below. Then whether `cron_runs` exists |
| `never_run` | yes | registered, never fired, and its own window has passed | is it still in `vercel.json`? did the deploy succeed? |
| `never_succeeded` | yes | it has fired, has never succeeded, and its window has passed | Sentry, filtered to that `job` tag |
| `overdue` | yes | it succeeded once but not recently | Sentry first; then whether Vercel is still firing it |
| `awaiting_first_run` | no | registered, never fired, still inside its window | nothing yet |
| `awaiting_first_success` | no | it fired, it failed, still inside its window | Sentry now — do not wait for the 503 |

### `never_registered` across all seventeen is the `CRON_SECRET` shape

This is the correction that matters most, because the earlier version of this
table sent you to the wrong place.

`withCronJob` skips registration for a 401 — deliberately, so an anonymous
`curl` cannot start every job's grace clock. The consequence is that when the
platform is invoking the crons but the **secret is wrong**, no row is ever
written, and on a fresh table the probe reports `never_registered` for all
seventeen. That is the 2026-08 outage shape, and it presents as a totally
healthy Vercel dashboard.

**So check `CRON_SECRET` first.** Only if the secret is right should you suspect
the heartbeat's own write — that `cron_runs` exists and that migration 0070 was
applied.

`never_run` across **all** jobs is close to unreachable and is not the signal to
look for here: rows exist only once some authenticated tick has registered them,
and that tick's own job then has a `last_started_at`, so it reports
`never_succeeded` or `overdue` rather than `never_run`. Sixteen of seventeen is
the most you will see.

### The two `awaiting_*` states — a 200 with a null timestamp

A job with no success yet is judged against its own `maxAgeMinutes`, measured
from `first_observed_at`. Inside that window it is **not** stale and appears in
one of two top-level keys:

- **`awaiting_first_run`** — registered, never fired. Becomes `never_run` when
  the window passes. Expect this legitimately for about a month after adding an
  infrequent job.
- **`awaiting_first_success`** — it fired and failed, and the window has not run
  out. Becomes `never_succeeded` when it does. **Open Sentry for this one now**:
  the probe is not going to escalate it for up to 32 days, and it is not meant
  to — Sentry already captured the failure with a `job` tag the moment it
  happened.

That division of labour is the point. This probe answers *is it alive*; Sentry
answers *did it fail*. A failed run used to make the probe stale immediately,
with no window at all — so one transient 500 on a monthly job's first ever run
pinned this endpoint at 503 for 31 days, which is the same harm an anonymous
caller could inflict before #1073 closed that path. Conflating the two questions
bought a failure signal that was already covered and made the liveness answer
wrong.

The window is not a way to silence the probe: it is the same tolerance the job
would get anyway, measured from the first moment we could have seen it. A
five-minute job that fails every tick exhausts its twenty-minute window in four
ticks and goes stale normally.

### A non-200 that is NOT 503

The probe can return statuses that say nothing about cron health, and the triage
above does not apply to them:

- **500** — the probe's own dependency failed. It reads `cron_runs` through the
  unscoped client with no `withErrorHandler`, so an unreachable database (or a
  missing `DATABASE_URL`, which throws at module load) escapes as a 500. It
  carries **no `job` tag**, so Sentry Rule 1 does not match it — the uptime
  monitor is the only thing that will tell you. Check the database before
  looking at any cron.
- **429** — rate limited. `/api/v1` sits in the middleware `read` tier at 100
  req/min per IP. A monitor at a sane interval will never see this; a tight loop
  or a shared egress IP can.
- **404** — the monitor URL drifted off `www.`. Tenant resolution runs on
  community subdomains and custom domains, and an unresolvable slug 404s before
  the route is reached.

### `cron_runs` is not a place to intervene

Do not clear rows to silence the probe — and note that **until #1073, rows could
be created by anyone.** Middleware waves any GET/POST under `/api/v1/internal/`
past the session gate (deliberately; `requireCronSecret` is the real gate), and
`withCronJob` used to write a heartbeat for the resulting 401. One anonymous
request set `last_started_at`, which moves a job out of `awaiting_first_run` —
which has grace — into `never_succeeded`, which has none, pinning this endpoint
at 503 until that job's next real success. A 401 now writes nothing at all.

If you see a row you cannot account for, that is worth investigating rather than
clearing.

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

**There is now a button for this.** The admin console's Health page
(`/health`, wave 3) lists failed cron runs and unprocessed Stripe webhook events,
and each failed cron row carries a **`Retry`** (plus `Retry all`). It issues
exactly the curl above: `POST ${WEB_APP_ORIGIN}/api/v1/internal/<slug>` with the
platform `CRON_SECRET`, through
`apps/admin/src/app/api/admin/health/jobs/[slug]/retry/route.ts`. Two things to
know before you reach for it:

- **Stripe rows have no Retry, and that is correct** — there is no internal
  endpoint that replays a Stripe event; replay is a Stripe-dashboard action.
  `retryable` comes from the report, not the component, so a button that could
  not work is never rendered.
- **Read the inline result, it distinguishes four outcomes.** Succeeded; *not
  delivered — 404* (the path does not exist, so nothing ran and Sentry will be
  empty); *not delivered — 401/403* (a `CRON_SECRET` mismatch **between the two
  deployments** — the 2026-08 outage shape, and the admin project needs the same
  value as web); and *the job ran and failed*, which is the only one where Sentry
  is the right next stop.

The route refuses rather than guesses when `WEB_APP_ORIGIN` is unset or is not an
http(s) origin — otherwise a client-supplied `Host` header would choose what it
calls.

## The eighteenth job — `push-dispatch`, on the ADMIN project

Wave 4 of the admin console redesign (#1123) added
`POST|GET /api/admin/internal/push-dispatch`, every 15 minutes, declared in
**`apps/admin/vercel.json`**. It delivers web-push notifications to platform
admins who opted in from Settings.

**It is outside all three mechanisms above, knowingly.** `verify-cron-job-tagging`
pins `apps/web/vercel.json`, so this job has no registry entry, no schedule
cross-check and **no `cron_runs` heartbeat** — which means neither the console's
own Health board nor `/api/v1/internal/cron-health` can see it. A heartbeat row
would be the stronger control, but `cron_runs` is registry-driven and
`guard:cron-job-tagging` reconciles that registry against `apps/web/vercel.json`
in both directions, so adding an admin slug means teaching that guard a second
root first. That work was deliberately deferred, not forgotten.

**What you do get:** the route's `reportRejection` fires a throttled
`Sentry.captureMessage('push-dispatch cron rejected an unauthenticated call')` at
`warning` level, tagged **`cron: push-dispatch`** and `outcome: unauthorized`,
with `cronSecretConfigured` and `hasAuthorizationHeader` as extras (never the
secret). One event per hour per process at most — the route is session-less by
design, so an uncapped capture would let a stranger burn the Sentry quota.

Consequences to hold onto:

- **Sentry Rule 1 does not match it.** That rule keys on `job` being set; this
  event carries `cron`. If you want to be paged for it, add a rule on
  `cron is set`, or search `tags[cron]:push-dispatch` by hand.
- **A stopped scheduler is invisible.** A cron that never fires is never rejected
  either, so silence here means nothing. Confirm registration with
  `vercel crons ls` against the **admin** project — and remember registration is
  not evidence of execution; that is the whole premise of this runbook.
- **Its failure cases answer 200 on purpose.** Unconfigured VAPID keys return
  `{ configured: false }` with a 200, because a non-2xx cron response is retried
  indefinitely and "no keys installed yet" is a deployment state retrying cannot
  fix. An unauthenticated call still gets a 401.
- **It needs `CRON_SECRET` on the admin project**, plus
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (and optionally
  `VAPID_SUBJECT`). Add them with `vercel env add --no-sensitive`: a Sensitive
  variable is written by `vercel pull` as the literal `[SENSITIVE]` and inlined
  into the client bundle.

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

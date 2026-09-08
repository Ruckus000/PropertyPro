# Sentry request-body capture — measured 2026-09-08 (#951)

Issue [#951](https://github.com/Ruckus000/PropertyPro/issues/951) asked for one thing
before it could close:

> Confirm empirically whether bodies are actually attached on this runtime **rather than
> reasoning from defaults**.

This is that measurement. Two findings: the issue's premise is **confirmed**, and a
**second, wider leak of the same data** was found that the #951 fix does not touch.

## Method

Local production build (`pnpm build`), `next start` on `127.0.0.1:3100` with a stub
`DATABASE_URL` pointing at a closed port, and `SENTRY_DSN=http://probekey@127.0.0.1:9911/1`
so the SDK's envelopes went to a throwaway `node:http` sink instead of Sentry. The sink
gunzips when `content-encoding: gzip` is set, because the SDK compresses above ~1KB and a
compressed envelope would otherwise read as garbage.

Probe: `POST /api/v1/public/pm-inquiries` with three canary strings in the body. That route
is in `TOKEN_AUTH_ROUTES` (no session, no CSRF gate) and its handler calls
`captureMarketingLead`, a bare `await db.insert(...)` with no `try`/`catch` — so an
unreachable DB produces a raw `Error`, which is the only class `withErrorHandler` forwards
to `Sentry.captureException` (an `AppError` returns at `error-handler.ts:40-45` and is
never reported).

> **Not the route #951 names.** `POST /api/v1/webhooks/stripe` cannot be used: its header
> says it must not use `withErrorHandler`, it always returns 200, and a bad signature
> returns before anything throws. The capture mechanism under test is per-request
> (`httpServerIntegration` patches the incoming request), not per-route, so the answer
> transfers — but the probe route differs from the one in the issue and that is stated
> rather than implied.

Two runs. **Run A** with the committed scrubber. **Run B** with the compiled scrubber in
`.next/server/chunks/` instrumented to record *booleans and a length only* — never body
content — before performing the same delete. `.next/` is gitignored build output; no
tracked file was modified, and the chunk was restored and verified byte-identical
afterwards.

> **Run A alone proves nothing, and the first version of this plan got that wrong.**
> `beforeSend` deletes `event.request.data` before the transport serialises, so the
> envelope shows `data` absent on every run regardless of whether the SDK attached
> anything. Absence is guaranteed by the scrubber, not evidence about capture. Run B is
> the only run that answers the question.

## Result 1 — bodies ARE attached. #951's premise is confirmed.

Run B, from the transmitted envelope:

```
__probe_data_key_present = True
__probe_data_type        = 'string'
__probe_data_len         = 149          (body content-length was 131)
__probe_canary           = True
request keys after scrub = ['cookies', 'headers', 'method', 'url']
```

The raw request body reaches `event.request.data` on Next 15.5.12 + App Router + Node +
`@sentry/nextjs` 10.38.0. **The mitigation is load-bearing, not defence in depth**, and the
"never verified" caveat that stood in `scrub-server-event.ts` and in two docblocks is now
answered. The last line also shows the scrubber doing its job: `data` is gone from what
actually ships.

## Result 2 — the same data leaves anyway, through a door the fix does not cover

Run A, with the committed scrubber fully active, still transmitted every canary. Drizzle's
`Failed query:` error embeds **the SQL and its bound parameter values**, and that string
arrives in Sentry four times in a single event:

| Location | Mechanism |
|---|---|
| `exception.values[1].value` | chained exception |
| `breadcrumbs[1].message` | `console.error` in `withErrorHandler` |
| `breadcrumbs[1].data.arguments[1].message` | same breadcrumb, structured copy |
| `breadcrumbs[1].data.arguments[1].stack` | same breadcrumb, stack copy |

```
params: probe@example.com,probe@example.com,CANARY_CO_C3D4,CANARY_NEEDLE_A1B2,
        CANARY_BODY_MARKER_E5F6,pm_inquiry,...
```

`scrubServerEvent` only touches `event.request`, so none of this is scrubbed. This is
**wider than #951**: it does not depend on the SDK buffering a body, it fires on *any*
failed query in *any* route, and it carries the values being written — which for other
tables is more sensitive than a marketing lead. Filed as
[#1092](https://github.com/Ruckus000/PropertyPro/issues/1092); not in scope here and not
fixed by anything on this branch.

Two details worth carrying, both verified against installed source rather than inferred:
the wrap is a bare `catch (e)` at every one of the six sites in
`drizzle-orm@0.45.1/pg-core/session.js:36-98`, so a constraint violation against a healthy
production database produces the identical message — `ECONNREFUSED` is not special. And
nothing truncates it: `prepareEvent.js:137-141` truncates `exception.value` only
`if (maxValueLength)`, which the SDK never defaults and none of the four configs set.

**Blast radius enumerated 2026-09-08** (in #1092's comments, not repeated here). Two
findings change how this section should be read. First, the leak is **already live**:
`apps/web/src/lib/cron/with-cron-job.ts:239-255` sets a Sentry fingerprint precisely
because "drizzle reports failures as a uniform `Failed query: <SQL>`" was collapsing
distinct cron jobs into one issue — these messages have been arriving in production Sentry
long enough for someone to work around their grouping. Second, `invitations.token` is a
**plaintext** account-takeover token bound in a `where` on the unauthenticated accept path
(`invitations-service.ts:150`, `:168`), and `invitations/route.ts:117-119` already grades
it too dangerous for `compliance_audit_log`. That raises #1092 from the P2 it was filed as
to P1. The rest of the credential surface is genuinely handled — hashed, encrypted, or
never bound — largely because `scoped.query` selects all columns and filters in JS.

## Limits of this measurement

- Local `next start` on Node is **not** Vercel's Node runtime. This establishes the
  behaviour of Next 15.5.12 + App Router + this SDK version. If Vercel's pipeline consumed
  the body differently the result could differ there — though it does not change what
  ships, because the drop is unconditional.
- Transactions were not measured (`tracesSampleRate` is 0.1 and the probe raised an error,
  not a transaction). Both server configs wire `beforeSendTransaction` to the same
  scrubber, asserted in `apps/web/__tests__/sentry/sentry-config.test.ts`.
- Body size here (149 bytes) is far below `maxRequestBodySize: 'medium'` (10,000), so
  truncation behaviour was not exercised.

## Reproducing

The harness was deliberately not committed — it is one measurement, not a regression test,
and a suite that boots a production build would not be run. To repeat it: build with a stub
`DATABASE_URL`, start `next start` with an `http://` DSN pointed at a local sink that
gunzips, POST a canary body to `/api/v1/public/pm-inquiries`, and read the envelope. For
the capture question specifically, instrument the compiled scrubber's `delete` — Run A
cannot answer it.

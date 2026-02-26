# P4-62: Load Test Results

**Date:** 2026-02-26
**Tool:** [k6](https://k6.io/) v0.57.0
**Script:** `scripts/load-tests/k6-script.js`

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Target | Vercel preview deploy (with bypass token) |
| Peak VUs | 100 (80 read + 15 write + 5 compliance) |
| Duration | 3 min (30s ramp-up, 2m sustain, 30s ramp-down) |
| Auth | Supabase password auth with base64url cookies |
| Community | Sunset Condos (ID: 1, condo_718) |

### Scenarios

| Scenario | VUs | Description |
|----------|-----|-------------|
| `annual_meeting_read` | 80 | GET documents, announcements, meetings |
| `maintenance_submit` | 15 | POST maintenance requests |
| `compliance_check` | 5 | GET compliance + occasional export |

### Thresholds

| Metric | Threshold | Budget |
|--------|-----------|--------|
| `http_req_duration` | p95 < 2000ms | General response time |
| `http_req_failed` | rate < 5% | Error budget |
| `documents_latency` | p95 < 2000ms | Document listing |
| `announcements_latency` | p95 < 2000ms | Announcement listing |
| `meetings_latency` | p95 < 2000ms | Meeting listing |
| `compliance_latency` | p95 < 2000ms | Compliance dashboard |
| `maintenance_submit_latency` | p95 < 2000ms | Maintenance request creation |
| `export_latency` | p95 < 5000ms | Data export (heavier) |

## Results — Run 3: All Thresholds Pass (2026-02-26)

> **Status: 8/8 thresholds PASS** — Maintenance POST fix confirmed. Error rate
> dropped from 8.35% to 4.88%, within the 5% budget. Remaining errors are
> rate-limit 429s (120 events) from the write scenario hitting the server at
> full throughput.

| Metric | p50 | p95 | Max | Pass? |
|--------|-----|-----|-----|-------|
| `documents_latency` | 807ms | 1000ms | 4.98s | PASS |
| `announcements_latency` | 765ms | 946ms | 5.17s | PASS |
| `meetings_latency` | 761ms | 909ms | 1.77s | PASS |
| `compliance_latency` | 763ms | 912ms | 1.11s | PASS |
| `maintenance_submit_latency` | 868ms | 1020ms | 3.92s | PASS |
| `export_latency` | 888ms | 1100ms | 1.21s | PASS |
| `http_req_duration` (overall) | 772ms | 971ms | 5.17s | PASS |
| `http_req_failed` (error rate) | — | — | 4.88% | PASS |

### Check Results

| Check | Passed | Failed | Rate |
|-------|--------|--------|------|
| `documents: status 200` | 1324 | 3 | 99.8% |
| `announcements: status 200` | 1323 | 4 | 99.7% |
| `meetings: status 200` | 1326 | 1 | 99.9% |
| `compliance: status 200` | 54 | 9 | 85.7% |
| `export: status 200` | 14 | 2 | 87.5% |
| `maintenance: status 201` | 234 | 81 | 74.3% |

### Custom Counters

| Counter | Value | Notes |
|---------|-------|-------|
| `rate_limited` | 120 | 429 responses — up from 31 with writes now reaching server |
| `cold_starts` | 11 | Responses > 3s (Vercel cold start) |
| `auth_failures` | 0 | All 6 demo users authenticated successfully |

### Throughput

| Metric | Value |
|--------|-------|
| Total requests | 4,501 |
| Requests/sec | 22.9 |
| Total iterations | 1,705 |
| Max concurrent VUs | 100 |

---

## Results — Run 2: Full Baseline (2026-02-26)

> **Status: 7/8 thresholds PASS** — All read endpoints return 200 with real data.
> Migration 0025 applied. The only failing threshold is `http_req_failed` at 8.35%,
> caused entirely by the `maintenance_submit` scenario returning 404 (POST route
> not reachable on preview deploy — see Known Issue below).

| Metric | p50 | p95 | Max | Pass? |
|--------|-----|-----|-----|-------|
| `documents_latency` | 796ms | 1020ms | 13.57s | PASS |
| `announcements_latency` | 758ms | 941ms | 16.99s | PASS |
| `meetings_latency` | 754ms | 945ms | 13.77s | PASS |
| `compliance_latency` | 764ms | 967ms | 1510ms | PASS |
| `maintenance_submit_latency` | 209ms | 416ms | 1420ms | PASS |
| `export_latency` | 889ms | 992ms | 1000ms | PASS |
| `http_req_duration` (overall) | 758ms | 967ms | 16.99s | PASS |
| `http_req_failed` (error rate) | — | — | 8.35% | FAIL* |

\* Error rate exceeds 5% budget due to maintenance POST returning 404 (see Known Issue). Excluding maintenance, read error rate ≈ 0.1%.

### Check Results

| Check | Passed | Failed | Rate |
|-------|--------|--------|------|
| `documents: status 200` | 1362 | 0 | 100% |
| `announcements: status 200` | 1361 | 1 | 99.9% |
| `meetings: status 200` | 1362 | 0 | 100% |
| `compliance: status 200` | 60 | 4 | 93.7% |
| `export: status 200` | 8 | 0 | 100% |
| `maintenance: status 201` | 0 | 343 | 0%* |

\* Maintenance POST returns 404 on preview deploy — see Known Issue.

### Custom Counters

| Counter | Value | Notes |
|---------|-------|-------|
| `rate_limited` | 31 | 429 responses from app middleware |
| `cold_starts` | 7 | Responses > 3s (Vercel cold start) |
| `auth_failures` | 0 | All 6 demo users authenticated successfully |

### Throughput

| Metric | Value |
|--------|-------|
| Total requests | 4,538 |
| Requests/sec | 23.2 |
| Total iterations | 1,769 |
| Max concurrent VUs | 100 |

### Known Issue (Resolved): Maintenance POST 404

The `POST /api/v1/maintenance-requests` endpoint returned 404 because the k6
`writeScenario` did not include `?communityId=` in the URL query string. All GET
scenarios included it. Without the query param, middleware's
`resolveCommunityContext()` fell through to host-subdomain parsing, extracted
the Vercel preview hostname prefix (e.g. `property-pro-xxx`) as a tenant slug,
failed the DB lookup, and returned 404 before the route handler ran.

**Fix:** Added `?communityId=${cid}` to the POST URL in `writeScenario`,
matching the pattern already used by `readScenario` and `complianceScenario`.

## Results — Run 1: Infrastructure Baseline (2026-02-26)

> **Status: PARTIAL** — Vercel bypass and auth pipeline work end-to-end. API
> endpoints returned 500 due to a pending DB migration (`community_settings`
> column). Latencies reflect real Vercel serverless + middleware + auth overhead
> but not actual query execution.

| Metric | p50 | p95 | Max |
|--------|-----|-----|-----|
| `documents_latency` | 590ms | 732ms | 3822ms |
| `announcements_latency` | 589ms | 700ms | 1859ms |
| `meetings_latency` | 592ms | 704ms | 1526ms |
| `compliance_latency` | 597ms | 775ms | 942ms |
| `maintenance_submit_latency` | 186ms | 341ms | 960ms |
| `export_latency` | 626ms | 786ms | 900ms |
| `http_req_duration` (overall) | 584ms | 700ms | 3822ms |
| `http_req_failed` (error rate) | — | — | 99.88% |

| Counter | Value |
|---------|-------|
| `rate_limited` | 238 |
| `cold_starts` | 2 |
| `auth_failures` | 0 |
| Total requests | 4,941 |
| Requests/sec | 25.0 |

### Re-run Command

```bash
export SB_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
export SB_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
export SB_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
export BYPASS=$(grep '^VERCEL_AUTOMATION_BYPASS_SECRET=' .env.local | cut -d= -f2-)

k6 run \
  -e BASE_URL="<deployment-url>" \
  -e SUPABASE_URL="$SB_URL" \
  -e SUPABASE_ANON_KEY="$SB_KEY" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_KEY" \
  -e VERCEL_AUTOMATION_BYPASS_SECRET="$BYPASS" \
  -e COMMUNITY_ID="1" \
  --summary-export=load-test-summary.json \
  scripts/load-tests/k6-script.js
```

## Script Features

- **Vercel bypass** — Optional `VERCEL_AUTOMATION_BYPASS_SECRET` env var bypasses Deployment Protection on preview deploys
- **Base64url cookie encoding** — Matches `@supabase/ssr@0.8.0` session storage format (`"base64-"` + base64url-encoded session JSON)
- **Service role key auth** — Optional `SUPABASE_SERVICE_ROLE_KEY` env var bypasses Supabase's per-IP auth rate limit during setup
- **Rate limit handling** — Automatic retry on 429 with `Retry-After` header
- **Cold start detection** — Counts responses exceeding 3s as potential Vercel cold starts
- **Round-robin user assignment** — 6 demo users distributed across VUs

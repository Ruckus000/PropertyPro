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

## Results — Infrastructure Baseline (2026-02-26)

> **Status: PARTIAL** — Vercel bypass and auth pipeline work end-to-end. API
> endpoints return 500 due to a pending DB migration (`community_settings`
> column). Latencies below reflect real Vercel serverless + middleware + auth
> overhead but not actual query execution.

| Metric | p50 | p95 | Max | Pass? |
|--------|-----|-----|-----|-------|
| `documents_latency` | 590ms | 732ms | 3822ms | FAIL* |
| `announcements_latency` | 589ms | 700ms | 1859ms | FAIL* |
| `meetings_latency` | 592ms | 704ms | 1526ms | FAIL* |
| `compliance_latency` | 597ms | 775ms | 942ms | FAIL* |
| `maintenance_submit_latency` | 186ms | 341ms | 960ms | FAIL* |
| `export_latency` | 626ms | 786ms | 900ms | FAIL* |
| `http_req_duration` (overall) | 584ms | 700ms | 3822ms | FAIL* |
| `http_req_failed` (error rate) | — | — | 99.88% | FAIL* |

\* All endpoints return 500 due to missing `community_settings` column — not a performance failure.

### Custom Counters

| Counter | Value | Notes |
|---------|-------|-------|
| `rate_limited` | 238 | 429 responses from app middleware |
| `cold_starts` | 2 | Responses > 3s (Vercel cold start) |
| `auth_failures` | 0 | All 6 demo users authenticated successfully |

### Throughput

| Metric | Value |
|--------|-------|
| Total requests | 4,941 |
| Requests/sec | 25.0 |
| Total iterations | 1,833 |
| Max concurrent VUs | 100 |

## Remaining Blocker

**Pending Database Migration** — The `community_settings` column (migration
`0025_p4_55f_community_settings_and_user_scoped_rls.sql`) does not exist in the
database. Once applied, re-run the test to collect true baseline numbers.

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

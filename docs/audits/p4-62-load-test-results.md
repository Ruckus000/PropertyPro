# P4-62: Load Test Results

**Date:** 2026-02-25
**Tool:** [k6](https://k6.io/) v0.57.0
**Script:** `scripts/load-tests/k6-script.js`

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Target | Vercel preview deploy / localhost:3000 |
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

## Results

> **Status: PENDING** — Baseline run blocked by prerequisites (see below).

### Blocking Issues

1. **Vercel Deployment Protection** — Preview deployments require Vercel SSO authentication, returning 401 before the app runs. Fix: configure a [protection bypass token](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) or run against a production deployment.

2. **Pending Database Migrations** — The `community_settings` column and `user_roles.deleted_at` column referenced by the schema/RLS functions do not yet exist in the database. Fix: apply pending migrations (`0025_p4_55f_community_settings_and_user_scoped_rls.sql`).

### Placeholder Results Table

Once the blockers are resolved, run:

```bash
export SB_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
export SB_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
export SB_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)

k6 run \
  -e BASE_URL="<deployment-url>" \
  -e SUPABASE_URL="$SB_URL" \
  -e SUPABASE_ANON_KEY="$SB_KEY" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_KEY" \
  -e COMMUNITY_ID="1" \
  --summary-export=load-test-summary.json \
  scripts/load-tests/k6-script.js
```

| Metric | p50 | p95 | Max | Pass? |
|--------|-----|-----|-----|-------|
| `documents_latency` | — | — | — | — |
| `announcements_latency` | — | — | — | — |
| `meetings_latency` | — | — | — | — |
| `compliance_latency` | — | — | — | — |
| `maintenance_submit_latency` | — | — | — | — |
| `export_latency` | — | — | — | — |
| `http_req_duration` (overall) | — | — | — | — |
| `http_req_failed` (error rate) | — | — | — | — |

### Custom Counters

| Counter | Value | Notes |
|---------|-------|-------|
| `rate_limited` | — | 429 responses detected |
| `cold_starts` | — | Responses > 3s (Vercel cold start) |
| `auth_failures` | — | Setup auth failures |

## Script Features

- **Base64url cookie encoding** — Matches `@supabase/ssr@0.8.0` session storage format (`"base64-"` + base64url-encoded session JSON)
- **Service role key auth** — Optional `SUPABASE_SERVICE_ROLE_KEY` env var bypasses Supabase's per-IP auth rate limit during setup
- **Rate limit handling** — Automatic retry on 429 with `Retry-After` header
- **Cold start detection** — Counts responses exceeding 3s as potential Vercel cold starts
- **Round-robin user assignment** — 6 demo users distributed across VUs

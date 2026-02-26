# Load Testing (P4-62)

k6-based load tests simulating 100 concurrent users during an annual meeting peak.

## Prerequisites

1. **k6** installed: `brew install k6`
2. A deployed preview URL (Vercel) with seeded demo data
3. Supabase project credentials (URL + anon key)
4. The numeric `COMMUNITY_ID` for the Sunset Condos demo community

## Running the tests

```bash
k6 run \
  -e BASE_URL="https://property-pro-xxx.vercel.app" \
  -e SUPABASE_URL="https://xxx.supabase.co" \
  -e SUPABASE_ANON_KEY="eyJ..." \
  -e DEMO_PASSWORD="DemoPass123!" \
  -e COMMUNITY_ID="1" \
  scripts/load-tests/k6-script.js
```

### With JSON summary export

```bash
k6 run \
  -e BASE_URL="$BASE_URL" \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  -e COMMUNITY_ID="$COMMUNITY_ID" \
  --summary-export=load-test-summary.json \
  scripts/load-tests/k6-script.js
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | Vercel preview deployment URL |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public API key |
| `DEMO_PASSWORD` | Yes | Demo user password (pass via `-e DEMO_PASSWORD=...`) |
| `COMMUNITY_ID` | Yes | Numeric ID of the Sunset Condos community |

## Scenarios

| Scenario | VUs | Description |
|----------|-----|-------------|
| `annual_meeting_read` | 80 | GET documents, announcements, meetings |
| `maintenance_submit` | 15 | POST maintenance requests |
| `compliance_check` | 5 | GET compliance + occasional export |

Total: **100 VUs** ramping over 30s, sustaining for 2 minutes, ramping down over 30s.

## Thresholds

- **P95 response time < 2s** (global and per-endpoint)
- **Error rate < 5%**
- **Export P95 < 5s** (heavier endpoint)

## Post-test cleanup

Maintenance requests created during the test are prefixed with `[Load Test]` for easy identification. To clean up, run the nightly demo reset or query by title prefix.

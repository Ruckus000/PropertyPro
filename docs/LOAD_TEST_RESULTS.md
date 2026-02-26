# Load Test Results (P4-62)

## Test Configuration

| Parameter | Value |
|-----------|-------|
| **Date** | _TBD_ |
| **Target URL** | _TBD_ |
| **k6 version** | _TBD_ |
| **Total VUs** | 100 |
| **Ramp-up** | 30s |
| **Sustain** | 2 min |
| **Ramp-down** | 30s |
| **Community** | Sunset Condos (condo_718) |
| **Demo users** | 6 (board_president, board_member, owner, tenant, cam, pm_admin) |

## Pass/Fail Summary

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| P95 response time | < 2s | _TBD_ | _TBD_ |
| Error rate | < 5% | _TBD_ | _TBD_ |
| Connection pool exhaustion | None | _TBD_ | _TBD_ |
| Rate limit hits (429s) | Minimal | _TBD_ | _TBD_ |
| Cold starts detected | Documented | _TBD_ | _TBD_ |

## Per-Endpoint Breakdown

| Endpoint | Requests | P50 | P90 | P95 | P99 | Max |
|----------|----------|-----|-----|-----|-----|-----|
| GET /documents | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| GET /announcements | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| GET /meetings | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| GET /compliance | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| POST /maintenance-requests | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| GET /export | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## Observations

### Response Time Distribution

_TBD — summary of latency distribution patterns_

### Cold Start Analysis

_TBD — count, duration, impact on P95_

### Connection Pool Behavior

_TBD — any 500 errors indicative of pool exhaustion_

### Rate Limiting Impact

_TBD — 429 count, effect on error rate_

### Vercel Function Performance

_TBD — observations from Vercel dashboard during test_

## Bottlenecks Identified

_TBD — list any endpoints exceeding 100ms query time, connection pool issues, etc._

## Recommendations

_TBD — indexing changes, caching opportunities, pool tuning, rate limit adjustments_

## Raw k6 Output

<details>
<summary>Terminal output</summary>

```
TBD — paste full k6 terminal output here
```

</details>

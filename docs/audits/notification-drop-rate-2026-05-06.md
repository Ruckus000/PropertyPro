# Notification Drop-Rate Baseline (2026-05-06)

Phase 0.2 of the verification gate from `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

Query was run via the Supabase MCP against the **PropertyPro production project** (`vbqobyagjzvlfpfozvmx`). Aggregate counts only; no row data examined.

---

## Hypothesis

The pre-C3 fire-and-forget notification pattern in `approveJoinRequest`/`denyJoinRequest` dropped some non-zero fraction of notifications when the catch-and-log path silently swallowed failures. C3's value (round 6 of the 2026-05-06 architectural session) is proportional to that historical drop rate.

## Methodology

Two counts over 90 days:

```sql
SELECT count(*) FROM community_join_requests
  WHERE reviewed_at > now() - interval '90 days'
    AND status IN ('approved','denied');

SELECT count(*) FROM notifications
  WHERE source_type = 'join_request'
    AND created_at > now() - interval '90 days';
```

Plus a follow-up that confirmed the schema was correct and pulled the distinct `source_type` values that DO appear in `notifications`.

## Results

| Measurement | Value |
|---|---|
| `community_join_requests` rows in last 90 days with `status IN ('approved','denied')` | **0** |
| `community_join_requests` rows total in production (all time) | **0** |
| `notifications` rows in last 90 days with `source_type='join_request'` | **0** |
| `notifications` rows total in last 90 days (all source types) | 82 |
| Distinct `source_type` values that DO exist | `announcement`, `document`, `maintenance`, `meeting`, `plan_upgrade_request`, `violation` |

**The community-join-request feature has never been exercised in production.** Zero records exist — not just in the last 90 days, but at all.

## Implication for C3

C3 (round 6) refactored `insertNotifications` to accept a transaction handle and moved both `approveJoinRequest` and `denyJoinRequest` to call it inside their `db.transaction` block. The change converts a silent-drop-on-failure pattern into a transactional all-or-nothing pattern.

Given the production state:

- **Historical drop rate is N/A.** The codepath has never run in prod.
- **No regression risk.** There are no production users who saw the old behavior, so there is no behavior to regress.
- **C3's transactional behavior is the only behavior production users will ever see** when the feature is eventually launched. No before/after comparison needed.
- **The new failure mode (notification table errors now roll back approve/deny) won't be observed in production until the feature ships and sees real traffic** — at which point it's just normal operation, not a behavior change.

## Recommended actions

| Action | Owner |
|---|---|
| Before launching the join-request feature: exercise the approve/deny flow in non-prod with a deliberately-failing notification insert (e.g., temporary RLS deny, FK violation, full-disk simulation) and confirm the error surfaces as a clear 5xx with audit-log integrity, not a half-committed approve. | Eng (when feature is unblocked) |
| Track join-request volume after launch and re-run this query. If the feature sees > 100 approves/deny per week and the prod 5xx rate on those endpoints is non-zero, revisit C3 with the full outbox pattern (separate `notification_outbox` table + worker). The minimal fix is correct *now*; the outbox becomes worth its weight only at scale. | Future revisit |

## What this audit did NOT find

- Evidence of any historical notification failure for join requests, because there were no join requests. The C3 fix's value cannot be quantified retroactively from production data.
- Drops in any of the 6 *active* notification source_types. The 82 rows over 90 days suggest those flows are operating, but this audit didn't compare them to their action-table counts (out of scope).

## Net

C3's risk profile is **lower than the chaos-engineering reframe initially feared**. It's a defensive change shipped ahead of feature use. Pair it with a non-prod exercise of the failure-injection scenarios before the join-request feature reaches real traffic.

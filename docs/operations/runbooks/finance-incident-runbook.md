# Finance Incident Runbook

## Incident Types

- Assessment generation failures (`5xx` on `/api/v1/assessments/*`).
- Ledger imbalance or missing entries.
- Payment intent / payment history inconsistencies.
- Stripe/accounting connector auth failures.

## 1. Initial Triage (0-15 minutes)

- Capture failing endpoint, request ID, actor, and community ID.
- Determine blast radius: single community vs multi-community.
- Check whether failures are read-only or mutation-impacting.

## 2. Containment

- If mutation integrity is at risk, temporarily disable affected write path via deployment rollback or guard.
- Preserve read access where safe.
- Do not run manual SQL fixes directly in production.

## 3. Diagnostics

- Correlate logs by `X-Request-ID`.
- Inspect `compliance_audit_log` rows for missing/duplicate mutation traces.
- Validate scope enforcement: ensure access attempts are community-filtered.
- Validate dependent tables availability:
  - `assessments`
  - `assessment_line_items`
  - `ledger_entries`
  - `stripe_connected_accounts`

## 4. Recovery

- Apply app hotfix for route/service logic.
- Re-run targeted integration checks for finance flows.
- Reconcile ledger consistency by replaying intended app-level mutations when needed.

## 5. Exit Criteria

- No active `5xx` spikes for finance endpoints.
- Cross-tenant checks return `403`/`404`.
- Audit events are present for recovered mutation flows.

## 6. Post-Incident

- Document root cause, fix commit, and affected communities.
- Add/adjust regression tests under `apps/web/__tests__/integration/`.

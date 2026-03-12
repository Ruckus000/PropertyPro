# Violations and ARC Incident Runbook

## Incident Types

- Violation lifecycle updates failing or producing invalid state transitions.
- ARC review/decision endpoints returning unexpected authorization results.
- Apartment communities incorrectly receiving violations/ARC access.

## 1. Initial Triage (0-15 minutes)

- Capture endpoint, request ID, actor role, community type, and community ID.
- Identify whether the incident affects violations, ARC, or both.
- Confirm whether issue is access-control, data integrity, or availability.

## 2. Containment

- If unauthorized updates are possible, disable the affected mutation endpoint path.
- Keep read-only endpoints available when safe.
- Preserve event logs and audit rows; avoid destructive cleanup.

## 3. Diagnostics

- Validate feature flags by community type (`hasViolations`, `hasARC`).
- Validate role checks and membership resolution at route boundaries.
- Confirm tenant isolation in scoped queries.
- Inspect relevant tables:
  - `violations`
  - `violation_fines`
  - `arc_submissions`

## 4. Recovery

- Patch route/service authorization and feature checks.
- Re-run targeted WS67 + WS72 integration suites.
- Confirm all recovered mutation paths emit audit events.

## 5. Exit Criteria

- Unauthorized role escalation is blocked (`403`).
- Apartment communities receive expected feature-disabled responses.
- Cross-tenant reads/writes fail (`403`/`404`).

## 6. Post-Incident

- Record defect class (authorization, feature gate, or state machine).
- Add a regression integration case for the failed scenario.

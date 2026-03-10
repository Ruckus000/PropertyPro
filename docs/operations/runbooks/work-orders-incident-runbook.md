# Work Orders and Amenities Incident Runbook

## Incident Types

- Work-order creation/assignment/completion failures.
- Amenity reservation conflicts not enforced.
- Unauthorized role mutation on vendor/amenity operations.

## 1. Initial Triage (0-15 minutes)

- Capture endpoint, request ID, actor role, and community ID.
- Determine whether impact is limited to work orders, amenities, or reservations.
- Identify if failures are permission, validation, or DB constraint related.

## 2. Containment

- If writes are unsafe, disable affected mutation routes.
- Preserve read routes when possible for operational visibility.

## 3. Diagnostics

- Check role boundary enforcement for:
  - `work_orders`
  - `amenities`
- Validate reservation overlap handling (`409` conflict behavior).
- Validate tenant scoping and no cross-community data exposure.
- Inspect tables:
  - `vendors`
  - `work_orders`
  - `amenities`
  - `amenity_reservations`

## 4. Recovery

- Deploy route/service fixes for authorization or state handling.
- Re-run WS69 and WS72 targeted integration suites.
- Verify audit rows for recovered mutations in `compliance_audit_log`.

## 5. Exit Criteria

- Staff/admin mutation paths are healthy.
- Unauthorized mutation attempts return `403`.
- Reservation conflict checks return `409` as expected.
- Cross-tenant checks return `403`/`404`.

## 6. Post-Incident

- Document timeline, root cause, and remediation.
- Add regression coverage for the exact failing behavior.

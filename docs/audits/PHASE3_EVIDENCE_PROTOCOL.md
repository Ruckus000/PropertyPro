# Phase 3 Evidence Protocol - PM, Mobile, and Ops Hardening

## Purpose
This protocol defines how to capture, redact, and review evidence for Phase 3 internal closeout.

## Pre-Capture Requirements
1. Capture evidence from `main` with clean working tree.
2. Ensure `.env.local` is loaded for integration commands:
```bash
set -a; source .env.local; set +a
```
3. Run migration reconciliation first:
```bash
pnpm --filter @propertypro/db db:migrate
```

## Required Command Evidence
Run and capture command + exit status + timestamp for:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
set -a; source .env.local; set +a; pnpm test:integration:preflight
pnpm plan:verify:phase3
pnpm perf:check
```

## Required Functional Evidence

Each item requires a verification method and pass/fail criteria.

### 1. PM portfolio scope isolation
**Method:** Integration test — call `GET /api/v1/pm/communities` as (a) an owner with no PM role, (b) a PM user.
**Pass:** (a) returns 403 Forbidden; (b) returns only communities where the PM holds `property_manager_admin`.
**Test ref:** `apps/web/__tests__/pm/` integration suite.

### 2. Maintenance transition enforcement
**Method:** Integration test — attempt each valid status transition and at least one invalid transition (e.g., `submitted -> closed`).
**Pass:** Valid transitions succeed; invalid transitions return 422 with descriptive error.

### 3. Maintenance internal notes hidden from residents
**Method:** Integration test — create an internal note as admin, then fetch the request as the owning resident.
**Pass:** Resident response payload does not contain any field from the internal note.

### 4. Contract bid embargo
**Method:** Manual or integration test — create a contract with a future bid-close date, then request bid details as a non-admin.
**Pass:** Before close date: bid details are withheld. After close date: bid details are visible.

### 5. Audit CSV export sanitization
**Method:** Integration test — insert audit records containing `=CMD()`, `+`, `-`, `@` prefixes, then export CSV.
**Pass:** Every cell starting with a formula character is prefixed with a single-quote (`'`) or tab in the exported file.

### 6. `/mobile/*` auth boundary
**Method:** HTTP request to any `/mobile/*` route without a session cookie.
**Pass:** Returns 302 redirect to login (not 200).

## Redaction Rules
Always redact:
- API keys, webhook secrets, and bearer tokens.
- Email addresses except controlled test identities.
- Full database URLs and Supabase project secrets.

## Evidence Freshness
Evidence older than 7 days is stale and must be regenerated.

## Outcome Template
```md
# Phase 3 Evidence - YYYY-MM-DD

## Context
- Branch:
- Commit:
- Environment:

## Command Evidence
- [ ] pnpm build
- [ ] pnpm typecheck
- [ ] pnpm lint
- [ ] pnpm test
- [ ] pnpm test:integration:preflight
- [ ] pnpm plan:verify:phase3
- [ ] pnpm perf:check

## Functional Evidence
- [ ] PM portfolio isolation
- [ ] Maintenance transition integrity
- [ ] Internal-note visibility enforcement
- [ ] Contract bid embargo
- [ ] Audit CSV sanitization
- [ ] Mobile auth boundary

## Blockers
- None / list blockers with owner and ETA

## Sign-Off
- Evidence captured by:
- Evidence reviewed by:
- Phase 3 status: PASS / FAIL / BLOCKED

**Gate definition:** PASS requires all command evidence exits 0 AND all 6 functional checks marked complete.
FAIL if any command exits non-zero or any functional check is incomplete with no approved waiver.
BLOCKED if an external dependency prevents evidence capture.
```

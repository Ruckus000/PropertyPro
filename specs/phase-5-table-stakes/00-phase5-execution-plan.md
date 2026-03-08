# Phase 5: Table-Stakes Features — Execution Plan

**Status:** Planning
**Prerequisite:** ADR-001 (Canonical Role Model) must be approved before implementation begins.
**Base commit:** Post-Phase 4 / Gate 4 (2026-02-26)

---

## 1) Execution Model

### One Spec Per Workstream
Each workstream has a single canonical spec file in `specs/phase-5-table-stakes/`. These are the only authoritative sources. No external documents, agent prompts, or chat transcripts supersede them.

### Workstream Ownership
- One lead agent/developer per workstream spec file.
- Cross-workstream dependency changes require explicit change notes in both files in the same PR.

### Merge Order + Tiering

| Tier | Workstreams | Merge Sequence | Rationale |
|---|---|---|---|
| **Tier 1** | 65 (Foundations) | First — prerequisite for all | Test harness, shared contracts, migration model |
| **Tier 1** | 66 (Finance), 67 (Violations/ARC) | After 65 lands, parallel to each other | Core compliance + revenue features |
| **Tier 2** | 68 (Polls), 69 (Work Orders) | After 65 lands | Operational features |
| **Tier 3** | 70 (Calendar/Connectors), 71 (Package/Visitor) | Assess after Tier 1 ships | Nice-to-have features |
| **Final** | 72 (Security/Hardening) | Last — cross-cutting gate | Security boundary tests, production readiness |

**WS 65 is a harness-only prerequisite PR.** Must merge before any 66-72 work begins.

---

## 2) Canonical Workstream Spec Files

| # | File | Scope | Complexity |
|---|---|---|---|
| 65 | `65-workstream-foundations-and-test-doctrine.md` | Shared contracts, RBAC/resources, feature flags, migration policy, test harness, no-mock guard, Playwright setup, ledger contract | Medium |
| 66 | `66-workstream-finance-dues-ledger.md` | Assessments, dues, AR ledger, Stripe Connect lifecycle, delinquency, exports | **Large** |
| 67 | `67-workstream-violations-and-arc.md` | Violation lifecycle, hearings/fines, ARC submission/review/decision | Large |
| 68 | `68-workstream-polls-and-community-board.md` | Informal polls and in-app forums/community board | Small |
| 69 | `69-workstream-work-orders-and-amenities.md` | Vendor dispatch work orders + amenity reservations | Medium |
| 70 | `70-workstream-calendar-sync-and-accounting-connectors.md` | ICS feeds, Google sync, accounting connector adapters | Medium |
| 71 | `71-workstream-package-and-visitor-logging.md` | Package intake/pickup and visitor pass/check-in | Small |
| 72 | `72-workstream-security-reliability-gates.md` | Security boundary tests, cross-tenant abuse tests, production readiness. **Chaos drills deferred to post-launch.** | Medium |

---

## 3) Spec Template (Complexity-Tiered)

### Required for ALL workstreams (sections 1-6, 10, 12):
1. `Objective And Business Outcome`
2. `In Scope`
3. `Out Of Scope`
4. `Dependencies`
5. `Data Model And Migrations`
6. `API Contracts`
10. `Testing Plan (Unit, Integration, Contract, E2E, Load)`
12. `Definition Of Done + Evidence Required`

### Additional for Medium+ (add sections 7, 9):
7. `Authorization + RLS Policy Family Mapping`
9. `Failure Modes And Edge Cases`

### Additional for Large (add sections 8, 11):
8. `UI/UX + Design-System Constraints`
11. `Observability And Operational Metrics`

### Testing Plan Required Subsections (all workstreams):
- Seed/fixture strategy
- Teardown rules (esp. for append-only tables)
- Tenant isolation matrix
- Concurrency/race condition cases
- Environment requirements (DATABASE_URL, API keys)

---

## 4) Test Taxonomy (5 Tiers — Locked)

| Tier | File Pattern | What It Tests | Mock Policy | When It Runs |
|---|---|---|---|---|
| Unit | `*.unit.test.ts` or `*.test.ts` | Pure logic | May mock anything | Every PR |
| Route-Unit | `*.route-unit.test.ts` | Route handlers with mocked DB/auth | May mock first-party | Every PR |
| Integration | `*.integration.test.ts` | Real DB, real tenant scoping | **No first-party mocks** (approved external stubs only) | Every PR |
| Contract | `*.contract.test.ts` | Real provider sandboxes (Stripe test mode, Google, Resend) | No mocks | Nightly only |
| E2E | `*.e2e.test.ts` | Full HTTP boundary via Playwright | No mocks | Every PR (smoke) + nightly (full) |

### What "No First-Party Mocks" Means in Integration Tests
- **Forbidden:** `vi.mock`, `jest.mock`, `mockImplementation` targeting first-party modules (`@propertypro/*`, `@/lib/*`)
- **Allowed:** Approved test infrastructure providers that replace *transport*, not *logic*:
  - Test auth provider (reads actor from `TestKitState` instead of Supabase cookies)
  - Event capture sinks for email, notifications, storage (in-memory queues, inspectable by assertions)
  - Deterministic test doubles for PDF extraction (fixed output per input hash)
- **Key distinction:** We replace auth *transport* (cookies → direct injection) while all RBAC, tenant-scoping, and business logic executes on the real code path.

### Migration of Existing Tests
- Current mocked "integration" tests (13 files) get a **per-file allowlist** in the guard script
- New integration tests must pass the guard from day 1
- Existing tests migrate to no-mock (using test providers) or rename to `*.route-unit.test.ts`
- WS 65 Definition of Done: allowlist is empty

---

## 5) No-Mock Guard Script

**File:** `scripts/verify-no-mocks-in-integration.ts`

### Scope (must match vitest integration configs exactly):
```
apps/web/__tests__/**/*integration.test.ts
packages/db/__tests__/**/*.integration.test.ts
apps/admin/__tests__/**/*integration.test.ts
```

### Forbidden Patterns:
- `vi.mock(` / `jest.mock(`
- `mockImplementation` / `mockReturnValue` / `mockResolvedValue`
- `vi.spyOn(` targeting first-party modules

### Allowlist:
- Per-file exceptions for the 13 existing integration tests
- Each exception includes a comment: `// LEGACY: migrate to test-auth-provider by WS-65 completion`
- Burn-down of allowlist is tracked in WS 65 progress

---

## 6) Migration Coordination

### Reserved Migration Ranges
Current state: highest file is `0035`, journal idx 27. Phase 5 starts at 0036.

| Workstream | Migration Range | Journal idx Range |
|---|---|---|
| 65 Foundations | 0036-0039 | 28-31 |
| 66 Finance | 0040-0054 | 32-46 |
| 67 Violations/ARC | 0055-0064 | 47-56 |
| 68 Polls/Board | 0065-0069 | 57-61 |
| 69 Work Orders | 0070-0079 | 62-71 |
| 70 Calendar/Connectors | 0080-0084 | 72-76 |
| 71 Package/Visitor | 0085-0089 | 77-81 |
| 72 Security/Hardening | 0090-0094 | 82-86 |

### Schema Owner
- One designated person rebases/renumbers and verifies Drizzle journal snapshots before merge to main.
- CI check (`scripts/verify-migration-ordering.ts`) validates:
  - `meta/_journal.json` `when` timestamps strictly ascending
  - No duplicate migration indices
  - No range overlaps between workstreams

---

## 7) CI/CD Quality Gates

### PR Required Checks (GitHub Actions job names):

| Job Name | What It Does |
|---|---|
| `lint` | `pnpm lint` (includes `guard:db-access`) |
| `typecheck` | `pnpm typecheck` |
| `unit-tests` | `pnpm test` |
| `build` | `pnpm build` |
| `integration-tests` | Postgres service container + `pnpm --filter @propertypro/db db:migrate` + integration suites |
| `no-mock-guard` | `pnpm exec tsx scripts/verify-no-mocks-in-integration.ts` |
| `migration-ordering` | `pnpm exec tsx scripts/verify-migration-ordering.ts` |
| `perf-check` | `pnpm perf:check` |

**Environment:** `DATABASE_URL` set as workflow env var pointing to ephemeral Postgres service container. NOT sourced from `.env.local`.

**Branch protection:** All jobs listed above are required status checks. No `if:` conditionals that allow skipping. The `vars.INTEGRATION_TESTS_ENABLED` guard in `integration-tests.yml` must be removed.

### Nightly Checks:
- Stripe sandbox contract suite (built as part of WS 66)
- Google sync contract suite (built as part of WS 70, Tier 3)
- Full Playwright E2E suite

---

## 8) Side Effect Containment (Integration Test Infrastructure)

Built in WS 65, used by all downstream workstreams.

**Location:** `apps/web/__tests__/integration/providers/`

| Provider | Replaces | Strategy |
|---|---|---|
| `test-auth-provider.ts` | `vi.mock('@/lib/api/auth')` | Reads actor from `TestKitState.currentActorUserId`. Registers via vitest setup file. |
| `test-capture-sinks.ts` | `vi.mock('@propertypro/email')`, `vi.mock('@/lib/services/notification-service')` | In-memory queues. Tests inspect queue contents. |
| `test-storage-provider.ts` | `vi.mock` of storage helpers | In-memory or local FS adapter with auto-cleanup. |
| `test-pdf-double.ts` | `vi.mock('@/lib/workers/pdf-extraction')` | Deterministic output per input hash. |

**Registration:** Vitest setup file (`apps/web/__tests__/integration/setup-integration.ts`) registers all providers. Only loaded by `vitest.integration.config.ts`.

---

## 9) Security, Consistency, and Design-System Gates

Each workstream spec must include concrete acceptance checks for:

### Security:
- All new routes wrapped with `withErrorHandler`
- All mutation paths emit audit events with request ID
- All new tenant tables added to RLS config with tested policy families
- All upload surfaces preserve magic-byte validation + presigned URL flow

### Consistency:
- New nav/routes use feature flags and centralized RBAC resources
- No raw Drizzle imports in runtime code (enforced by `guard:db-access`)
- No route-specific authorization forks outside shared access policy patterns unless documented in ADR

### Design-System:
- Only token-based spacing/radius/elevation/typography
- Status UI uses icon + text + color (never color-only)
- Touch targets and accessibility checks for interaction-heavy surfaces

---

## 10) Shared Contracts (Defined in WS 65)

### Ledger Interface
WS 65 defines the ledger table schema and write interface. WS 66 and 67 implement against it.
- `ledger_entries` table: id, communityId, entryType, amount, description, sourceType, sourceId, createdAt
- `LedgerEntryType` enum: `assessment`, `payment`, `refund`, `fine`, `fee`, `adjustment`
- `postLedgerEntry()` write function with audit logging
- This enables WS 66 (Finance) and WS 67 (Violations/fines) to develop truly in parallel

### RBAC Resource Extensions
WS 65 defines new RBAC resources for Phase 5 features in `rbac-matrix.ts`:
- `finances`, `violations`, `arc_submissions`, `polls`, `work_orders`, `amenities`, `packages`, `visitors`, `calendar_sync`, `accounting`
- Downstream workstreams implement authorization against these pre-defined resources

### Feature Flag Extensions
WS 65 defines new community feature flags:
- `hasFinance`, `hasViolations`, `hasARC`, `hasPolls`, `hasCommunityBoard`, `hasWorkOrders`, `hasAmenities`, `hasPackageLogging`, `hasVisitorLogging`, `hasCalendarSync`, `hasAccountingConnectors`
- Community-type matrix updated with `satisfies` exhaustiveness check

---

## 11) Audit Evidence

### Template
Each workstream completion produces `docs/audits/phase5-<workstream-number>-<date>.md` following the Gate 3/4 evidence protocol:

Required sections:
1. Context (commit, branch, date, runner)
2. Pre-Checks (clean tree, frozen lockfile, migrations)
3. Static Checks (build, typecheck, lint)
4. Integration Test Results (with command transcripts)
5. Cross-Tenant Isolation Verification
6. Security Gate Verification
7. Workstream-Specific Evidence

### Verifier
`scripts/verify-audit-evidence.ts` checks for required sections in each evidence file.

---

## 12) Definition of Done (Global)

A workstream is complete only when ALL are true:

1. Its spec checklist is fully checked
2. No-mock integration tests pass in CI (no allowlist entries for new tests)
3. Cross-tenant isolation tests pass for all newly introduced tables/routes
4. Security and design-system gates pass
5. Audit evidence doc exists in `docs/audits/` with exact commands and outcomes
6. No open P0/P1 defects remain for that workstream
7. Change notes updated in any dependent workstream spec files

---

## 13) Assumptions Locked

- Quality over speed
- No mocked first-party behavior as integration evidence (approved test providers for transport replacement only)
- Real-provider validation runs nightly (Stripe test mode, Google sandbox)
- Postgres service container for CI, not Supabase branch databases
- `specs/phase-5-table-stakes/` is the canonical planning location
- ADR-001 must be approved before WS 65 begins
- Chaos engineering drills deferred to post-launch; security boundary tests remain in WS 72
- WS 66 may be broken into sub-workstreams (66a-d) at implementation time if scope warrants it

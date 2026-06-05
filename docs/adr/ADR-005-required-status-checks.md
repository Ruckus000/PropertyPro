# ADR-005: Required status checks for `main`

- **Status:** Proposed
- **Date:** 2026-06-05
- **Context tags:** CI, branch protection, Plan B4

## Context

Plan B4 adds a parameterized contract-test suite
(`apps/web/__tests__/api-contract-suite/`) that asserts, per route contract,
malformed-input rejection (a) and RBAC-metadata integrity (b). It runs in the
**unit-test** CI job. A test/guard only prevents regressions if its job is a
**required** status check on `main`; otherwise a PR can merge red.

Prior observation (B6/B2 merges on 2026-06-05 auto-merged in ~30s) suggested the
full Build/Unit/integration suite is not gating — only Lint/guards.

## Observed required contexts (live audit, 2026-06-05)

Primary call:

```
gh api repos/Ruckus000/PropertyPro/branches/main/protection --jq '.required_status_checks.contexts'

{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}
gh: Branch not protected (HTTP 404)
```

Fallback call:

```
gh api repos/Ruckus000/PropertyPro/branches/main/protection/required_status_checks

{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-status-checks-protection","status":"404"}
gh: Branch not protected (HTTP 404)
```

Rulesets check (newer GitHub branch protection mechanism):

```
gh api repos/Ruckus000/PropertyPro/rulesets

[]
```

All three calls confirm: **there is no branch protection rule and no ruleset on `main`**.

## Finding

The audit reveals a stronger result than anticipated: `main` has **no branch
protection at all** — no required reviewers, no required status checks, no
dismiss-stale-reviews, and no rulesets. This is consistent with the prior
observation that B6/B2 PRs auto-merged in ~30s (no review gate, no required CI
gate).

Consequently:

- **Zero** CI jobs are required status checks today — not `Lint`, not
  `Typecheck`, not `Unit Tests`, not `Build`, not `migration-ordering`, not
  `no-mock-guard`, not `integration-tests`, not `perf-check`.
- The new B4 suite (`apps/web/__tests__/api-contract-suite/`) runs inside the
  **`Unit Tests`** job (job id: `test`, workflow: `.github/workflows/ci.yml`,
  step: `pnpm exec vitest run --coverage` in `apps/web/`). Because that job
  is not required, a PR can merge while B4 tests are red.
- This also means every other unit test, guard script, and the full build are
  non-gating today.

## Decision

This ADR is **documentation + recommendation only**; it does not change the
GitHub setting (an outward-facing repo-admin action the maintainer must apply).

**Recommended:** enable branch protection on `main` with the following required
status checks drawn from `.github/workflows/ci.yml`:

| Job id | Display name | Rationale |
|---|---|---|
| `lint` | Lint | ESLint + DB access guard + CSS var check |
| `typecheck` | Typecheck | Full TypeScript compile across all packages |
| `test` | Unit Tests | Vitest suite including B4 contract tests |
| `no-mock-guard` | no-mock-guard | Prevents mocks from creeping into integration tests |
| `migration-ordering` | migration-ordering | Prevents journal drift / out-of-order migrations |
| `build` | Build | Full Next.js production build (depends on all above) |

`integration-tests` (`.github/workflows/integration-tests.yml`) and
`perf-check` (job `perf-check` in `ci.yml`) are candidates once their
stability and runtime are confirmed acceptable as merge blockers.

Also recommended: require at least one approving review before merge, to
restore the human-review gate that currently does not exist.

Until the protection is applied, the B4 suite (and all CI) is a local +
CI-visible signal (`pnpm test`) but **not** a merge gate.

## Consequences

- **Once applied**, B4's checks (a)+(b) become merge-blocking — the intended
  value of the B4 investment.
- Making `Unit Tests` required also makes every other unit test merge-blocking;
  the team should confirm the suite has no persistent flakiness first.
- The `build` job already `needs: [lint, typecheck, test, no-mock-guard,
  migration-ordering, perf-check]` in ci.yml — requiring only `Build` would
  transitively block on all its dependencies, but GitHub only honors the
  explicitly-listed context names, so each job to be enforced must be named
  individually in the protection config.
- Adding required reviews closes the current gap where a single author can
  merge their own PRs without any approval.

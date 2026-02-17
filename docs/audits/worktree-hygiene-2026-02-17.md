# Worktree Hygiene Audit — 2026-02-17

## Scope
- Inventory all known local worktrees and compare each `HEAD` to `origin/main`.
- Enforce freshness policy: no feature work on branches more than 20 commits behind `origin/main`.

## Snapshot
- `origin/main` baseline: `5a9d449`
- Data captured on: `2026-02-17`

## Inventory and Disposition

| Worktree | Branch | HEAD | Ahead | Behind | Category | Required action |
|---|---|---:|---:|---:|---|---|
| `/Users/jphilistin/Documents/Coding/PropertyPro` | `codex/recover-p1-12-validation` | `5a9d449` | 0 | 0 | baseline | continue remediation |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-09` | `feature/p1-09-compliance-engine` | `1667fa2` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-10` | `codex/p1-10-compliance-dashboard-ui` | `b5be906` | 0 | 49 | rebase-required | rebase/recreate before any edits |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-11` | `feature/p1-11-document-upload` | `a0c4936` | 0 | 82 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-12` | `codex/p1-12-magic-bytes` | `ce5af77` | 1 | 50 | salvage | keep WIP checkpoint only; rebuild on fresh branch |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-13` | `codex/p1-13-text-extraction` | `7966834` | 0 | 49 | rebase-required | rebase/recreate before any edits |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-16` | `codex/p1-16-meeting-management` | `e6d6084` | 1 | 50 | salvage | keep WIP checkpoint only; rebuild on fresh branch |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-17` | `feature/p1-17-announcements` | `9c6d100` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-18` | `feature/p1-18-resident-management` | `84b026b` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-19` | `codex/p1-19-csv-import` | `3419780` | 0 | 49 | rebase-required | rebase/recreate before any edits |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-20` | `codex/p1-20-invitation-auth` | `e5fcf4c` | 0 | 49 | rebase-required | rebase/recreate before any edits |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-21` | `feature/p1-21-password-reset` | `36fc555` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-22` | `feature/p1-22-session-management` | `e51d8c0` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-26` | `codex/p1-26-notification-preferences` | `848f1bd` | 1 | 50 | salvage | keep WIP checkpoint only; rebuild on fresh branch |
| `/Users/jphilistin/Documents/Coding/pp-worktrees/p1-28` | `feature/p1-28-email-infrastructure` | `73ade5d` | 0 | 81 | archive | close/remove worktree |
| `/Users/jphilistin/.codex/worktrees/b552/PropertyPro` | `HEAD` (detached) | `ae85e5c` | 0 | 5 | rebase-required | reattach/recreate when reused |

## Policy
- Hard fail in CI when branch is more than 20 commits behind `origin/main`.
- No merges from salvaged stale branches (`p1-12`, `p1-16`, `p1-26`); only from fresh recovery branches rebased from current `main`.

## Closeout Update (2026-02-17)
- Recovery merges from fresh branches completed on `main` in planned order:
  - `codex/recover-p1-16-meetings` -> merge `5a37de7`
  - `codex/recover-p1-26-notification-preferences` -> merge `6d43950`
  - `codex/recover-p1-12-validation` -> merge `01b92af`
- Post-merge targeted verification passed (`16 + 10 + 24` tests, plus web typecheck and db build).
- Networked rerun of `apps/web/__tests__/integration/multi-tenant-routes.integration.test.ts` passed (`45/45`) after shared-env migration reconciliation (`pnpm --filter @propertypro/db db:migrate`).
- `main` was pushed and is aligned with `origin/main` at `01b92af`.

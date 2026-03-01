# Agent Orchestration Guide

> **How to run this plan with OpenAI Codex agents, maximizing parallelism.**
>
> Each task file is self-contained: it includes a `## Context Files to Read` section
> listing which files the agent must read at the start. Always include `SHARED-CONTEXT.md`.

## Execution Model

1. Each task = one Codex task (via `codex` CLI or Codex dashboard)
2. Each task gets: the prompt below pointing at the task file + SHARED-CONTEXT.md + CLAUDE.md
3. Agent works on a branch, makes a PR
4. You review and merge before kicking off dependent tasks
5. Parallel tasks can run simultaneously — Codex handles isolation automatically

### Codex-Specific Notes

- **Codex runs in sandboxed containers** — each task is already isolated. No git worktree
  tricks needed. Codex creates its own branch and PR automatically.
- **Environment setup:** Codex needs `pnpm install` to work. Add a setup command or
  `codex.md`/`AGENTS.md` at repo root (see below).
- **No internet access:** Codex runs in a sandboxed environment with no network.
  Dependencies must already be in `node_modules` or lockfile. If a task needs a new
  dependency (e.g., `@dnd-kit/core` in Task 3.4), the agent must `pnpm add` it — but
  this only works if the package is resolvable from the lockfile/cache. Pre-install
  new dependencies on `main` before launching tasks that need them.
- **AGENTS.md:** Create an `AGENTS.md` at the repo root with setup and verification
  commands so Codex knows how to bootstrap (see below).

## Run Order

### Wave 1 — Zero dependencies, zero file overlap (run ALL simultaneously)

| Task File | Branch Name | Estimated Time | Touches |
|-----------|-------------|----------------|---------|
| `TASK-0.3-platform-admin-table.md` | `feat/platform-admin-table` | 30 min | New migration, new schema file |
| `TASK-0.4-theme-package.md` | `feat/theme-package` | 1-2 hours | New `packages/theme/` directory |
| `TASK-0.5-css-var-migration.md` | `feat/css-var-rename` | 15 min | `mobile.css` (2 lines), new CI script |
| `TASK-0.6-ci-guard-multiapp.md` | `feat/ci-guard-multiapp` | 1 hour | `scripts/verify-scoped-db-access.ts` only |
| `TASK-0.8-seed-refactor.md` | `feat/seed-refactor` | 3-4 hours | New file + `scripts/seed-demo.ts` |

**Why these are safe in parallel:** Each task touches completely different files.
No migration number conflicts because they should each check the current highest
before creating theirs. If you're worried, assign migration numbers upfront:
- 0.3 → migration 0029
- 0.7 → migration 0030 (Wave 2)
- 0.2 → migration 0031 (Wave 2)

### Wave 2 — Depends on Wave 1 merging (run ALL simultaneously)

| Task File | Branch Name | Depends On | Touches |
|-----------|-------------|------------|---------|
| `TASK-0.1-dev-infrastructure.md` | `feat/dev-infrastructure` | Nothing critical, but easier after Wave 1 | Config files: `setup.sh`, `turbo.json`, `README.md` |
| `TASK-0.2-branding-extension.md` | `feat/branding-extension` | 0.4 (needs ALLOWED_FONTS from theme package) | `packages/shared/src/branding.ts`, branding API, form, route, new migration |
| `TASK-0.7-demo-columns.md` | `feat/demo-columns` | Nothing critical | `packages/db/src/schema/communities.ts`, new migration |

**Potential conflict:** 0.2 and 0.7 both modify `communities.ts`. Run them simultaneously
but merge 0.7 first (smaller change) then rebase 0.2.

### Wave 3 — Phase 1 (mostly sequential, one large task)

| Task File | Branch Name | Depends On |
|-----------|-------------|------------|
| `TASK-1-admin-app.md` | `feat/admin-app` | All Wave 1 + Wave 2 merged |

Phase 1 is one large task because the admin app bootstrap, middleware, auth, and
portfolio view are tightly coupled. Splitting into 8 sub-tasks would create more
merge conflicts than time saved. One agent, one branch, one PR.

**However**, 0.9 (Sentry wiring) can split off:

| Task File | Branch Name | Depends On |
|-----------|-------------|------------|
| `TASK-0.9-sentry-admin.md` | `feat/sentry-admin` | TASK-1 (admin app exists) |

### Wave 4 — Phase 2 (three parallel tracks after Phase 1 merges)

| Task File | Branch Name | Depends On | Can Parallel With |
|-----------|-------------|------------|-------------------|
| `TASK-2.1-demo-schema.md` | `feat/demo-schema` | Phase 1 | 2.2, 2.4 |
| `TASK-2.2-demo-token-system.md` | `feat/demo-tokens` | Phase 1 | 2.1, 2.4 |
| `TASK-2.4-2.6-theme-injection.md` | `feat/theme-injection` | Phase 0.4 | 2.1, 2.2 |

Then sequential:

| Task File | Branch Name | Depends On |
|-----------|-------------|------------|
| `TASK-2.3-demo-generator.md` | `feat/demo-generator` | 2.1 + 2.2 merged |
| `TASK-2.7-2.11-demo-ui.md` | `feat/demo-ui` | 2.3 merged |

### Wave 5 — Phase 3 (can start after 2.4-2.6 merges, parallel with Phase 2 demo UI)

| Task File | Branch Name | Depends On | Can Parallel With |
|-----------|-------------|------------|-------------------|
| `TASK-3.1-3.2-site-blocks-schema.md` | `feat/site-blocks` | Phase 1 | 2.7-2.11 |
| `TASK-3.3-public-site-renderer.md` | `feat/public-site` | 3.1-3.2 merged | 2.7-2.11 |
| `TASK-3.4-site-builder-ui.md` | `feat/site-builder` | 3.1-3.2 merged | 3.3 |

## Gantt View (Approximate)

```
Week 1:  [====Wave 1 (5 parallel agents)====]
Week 2:  [==Wave 2 (3 parallel)==] [merge/review]
Week 3:  [==========Phase 1 (admin app)==========]
Week 4:  [==========Phase 1 contd.===============]
Week 5:  [2.1][2.2][2.4-2.6] ← 3 parallel
Week 6:  [====2.3 demo generator====][3.1-3.2]
Week 7:  [==2.7-2.11 demo UI==][3.3 renderer][3.4 builder]
Week 8:  [==2.7-2.11 contd.===][3.4 contd.===============]
Week 9:  [3.4 contd.][polish/test]
```

## AGENTS.md (Create at Repo Root)

Create `AGENTS.md` at the repository root so Codex knows how to set up and verify:

```markdown
# Agent Instructions

## Setup
pnpm install

## Verification
pnpm typecheck && pnpm lint && pnpm test

## Task Execution
1. Read `docs/agent-tasks/SHARED-CONTEXT.md` for project conventions
2. Read the specific task file assigned to you in `docs/agent-tasks/`
3. Follow the CLAUDE.md project instructions for architecture context
4. Implement the task per the acceptance criteria in the task file
5. Run verification commands before marking complete
```

## Prompting Codex

For each task, use this prompt format in the Codex CLI or dashboard:

```
Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-X.X-name.md, then implement the task. Follow all instructions in the task file exactly. Run pnpm typecheck && pnpm lint after completing implementation.
```

### Wave 1 Example (5 parallel tasks):

```bash
codex --task "Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-0.3-platform-admin-table.md, then implement the task. Run pnpm typecheck && pnpm lint after."
codex --task "Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-0.4-theme-package.md, then implement the task. Run pnpm typecheck && pnpm lint after."
codex --task "Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-0.5-css-var-migration.md, then implement the task. Run pnpm typecheck && pnpm lint after."
codex --task "Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-0.6-ci-guard-multiapp.md, then implement the task. Run pnpm typecheck && pnpm lint after."
codex --task "Read docs/agent-tasks/SHARED-CONTEXT.md and docs/agent-tasks/TASK-0.8-seed-refactor.md, then implement the task. Run pnpm typecheck && pnpm lint after."
```

All 5 can be launched simultaneously — Codex isolates each in its own sandbox.

## Tips for Running Agents

1. **Prompt format:** Always point at both `SHARED-CONTEXT.md` AND the specific task file.
   End with "Run pnpm typecheck && pnpm lint after." so the agent self-verifies.

2. **Branch naming:** Codex auto-creates branches. If your Codex setup supports naming,
   use the names in the wave tables so PRs are easy to identify.

3. **Migration conflicts:** If two agents run simultaneously and both need migrations,
   the numbers are pre-assigned in each task file. No conflicts.

4. **After merging a wave:** Run `pnpm typecheck && pnpm lint && pnpm test` on main
   before starting the next wave. This catches integration issues early.

5. **If an agent gets confused:** The task file is the source of truth, not the
   v4.1 plan. Task files have been distilled to just what that agent needs.

6. **New dependencies before launch:** Tasks 3.4 needs `@dnd-kit/core`, `@dnd-kit/sortable`,
   `@dnd-kit/utilities`. Since Codex has no internet, pre-install these on `main`
   before launching Wave 5:
   ```bash
   cd apps/admin && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
   git add -A && git commit -m "chore: pre-install dnd-kit for site builder"
   ```

7. **Codex dashboard vs CLI:** If using the dashboard, paste the full prompt into the
   task description. If using CLI, use the `--task` flag as shown above.

## File Checklist

After all tasks, these new files/directories should exist:

```
packages/theme/                    (Wave 1 — 0.4)
packages/db/src/schema/platform-admin-users.ts  (Wave 1 — 0.3)
packages/db/src/seed/seed-community.ts          (Wave 1 — 0.8)
packages/db/migrations/0029_*.sql               (Wave 1 — 0.3)
packages/db/migrations/0030_*.sql               (Wave 2 — 0.7)
packages/db/migrations/0031_*.sql               (Wave 2 — 0.2)
packages/db/migrations/0032_*.sql               (Wave 4 — 2.1)
packages/db/migrations/0033_*.sql               (Wave 5 — 3.1)
packages/shared/src/auth/platform-admin.ts      (Wave 3 — 1)
packages/shared/src/site-blocks.ts              (Wave 5 — 3.1)
scripts/verify-css-var-migration.sh             (Wave 1 — 0.5)
apps/admin/                                     (Wave 3 — 1)
apps/web/src/components/public-site/blocks/     (Wave 5 — 3.3)
```

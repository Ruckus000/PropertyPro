# Phase 2 Batch 2C - Claude Ralph Loop Setup (P2-33 + P2-33.5)

Generated: 2026-02-17

## Scope

This setup handles the two current blockers on the Phase 2 critical path:
- `P2-33` Self-Service Signup
- `P2-33.5` Billing and provisioning schema migration (hard gate before `P2-34`)

## Worktrees Provisioned

- `/Users/jphilistin/Documents/Coding/pp-worktrees/p2-33` on branch `codex/p2-33-self-service-signup`
- `/Users/jphilistin/Documents/Coding/pp-worktrees/p2-33-5` on branch `codex/p2-33-5-billing-provisioning-schema`

## Pre-Loop Sanity Check (run in each worktree)

```bash
pwd
git branch --show-current
pnpm install --frozen-lockfile
```

Required outputs:
- `pwd` matches the intended worktree path
- branch name matches the task branch

## Loop Runner

Use the shared loop script from repo root:

```bash
scripts/claude-ralph-loop.sh <prompt-file> <max-iterations> "<success-marker>"
```

The runner uses direct `claude "..."` prompt invocation (no `claude -p`) to align with AGENTS.md learnings.

## Run P2-33 Loop

```bash
cd /Users/jphilistin/Documents/Coding/pp-worktrees/p2-33
/Users/jphilistin/Documents/Coding/PropertyPro/scripts/claude-ralph-loop.sh \
  /Users/jphilistin/Documents/Coding/PropertyPro/docs/agent-prompts/phase2-batch-2c/p2-33.prompt.md \
  12 \
  "<promise>ALL TESTS PASSING</promise>"
```

## Run P2-33.5 Loop

```bash
cd /Users/jphilistin/Documents/Coding/pp-worktrees/p2-33-5
/Users/jphilistin/Documents/Coding/PropertyPro/scripts/claude-ralph-loop.sh \
  /Users/jphilistin/Documents/Coding/PropertyPro/docs/agent-prompts/phase2-batch-2c/p2-33-5.prompt.md \
  8 \
  "<promise>ALL TESTS PASSING</promise>"
```

## Merge Order

Recommended:
1. Merge `P2-33.5` first (hard gate for `P2-34`)
2. Merge `P2-33`
3. Start `P2-34/P2-34a`

## Merge-Gate Command (migrate-first rule)

After each merge to `main`, run:

```bash
set -a; source .env.local; set +a
pnpm --filter @propertypro/db db:migrate
pnpm exec vitest run --config apps/web/vitest.integration.config.ts apps/web/__tests__/integration/multi-tenant-routes.integration.test.ts
```

Do not run the networked integration gate before `db:migrate`.

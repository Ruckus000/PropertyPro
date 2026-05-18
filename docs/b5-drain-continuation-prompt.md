<!--
SYNC NOTICE — this file is mirrored. Two copies exist and MUST be edited together:
  • Repo copy (this file, source of truth):  docs/b5-drain-continuation-prompt.md
  • Plans copy (local convenience pointer):   ~/.claude/plans/b5-drain-continuation-prompt.md
When the continuation prompt changes (after every B5 batch lands), update BOTH
files in the same change. This repo copy is version-controlled and code-reviewed
and is authoritative; copy its merged body verbatim into the plans copy
(preserving that file's SYNC NOTICE header).
-->

# B5 Drain — Continuation Prompt (canonical)

Paste the fenced block below into a new chat to continue the B5 batched-drain
work. Distilled from the sessions through PR #370 (batch #1). Keep it current
after every batch lands (and mirror to `~/.claude/plans/b5-drain-continuation-prompt.md`).

---

```
You are continuing the PropertyPro Florida architectural-standardization work (Phase B, item B5). This is a continuation, not a fresh audit. Work end-to-end autonomously; make the reasonable call and proceed without stopping for confirmation. If plan mode is active, do parallel read-only discovery, write the plan, then call ExitPlanMode.

## The task: B5 batch #2

Drain ~3 components off the `KNOWN_DIRECT_API_CALL_FILES` allowlist in `scripts/verify-component-api-calls.ts` in ONE batched PR (ADR-003: components must not call `fetch('/api/v1/*')` directly — they go through a TanStack Query hook in `apps/web/src/hooks/`). Workflow was switched to batching ~3 lookalike drains per PR to pay the CI/review tax once. Do NOT reopen A3, B3, A1/A4/B1/B2/B4/B6, or any completed B5 drain.

## Verified current state (read the canonical docs to confirm before acting)

- origin/main HEAD: PR #370 / merge commit `c7e2450c3104ba0e489a841467c4e679602cdaeb` (B5 batch #1, drains #21-#23).
- Allowlist floor: **40** grandfathered files. 23 drained total.
- This is a git worktree; the PRIMARY worktree owns `main`. Never `git switch main` here. Branch from `origin/main`: `git switch -c codex/b5-drain-batch-2 origin/main`.
- node_modules may be missing — `pnpm install` if so.

## Read these FIRST, in parallel (multiple tool calls in one message)

(The `~/.claude/projects/-Users-jphilistin-Documents-Coding-PropertyPro` segment below is this environment's memory slug — the project's absolute path with `/`→`-`. On a different machine, substitute your own `~/.claude/projects/<slug>/…`. The literal path is kept here so the continuation agent can read these files directly without resolving a placeholder.)

1. `~/.claude/projects/-Users-jphilistin-Documents-Coding-PropertyPro/memory/MEMORY.md` — esp. the "Continuation Prompt" + `KNOWN_DIRECT_API_CALL_FILES` drain-progress sections (full do-not-restart list, batching rules).
2. `~/.claude/projects/-Users-jphilistin-Documents-Coding-PropertyPro/memory/project_architectural_standardization_plan.md`
3. `~/.claude/plans/draft-a-plan-that-reflective-pie.md`
4. Repo root: `CLAUDE.md`, `AGENTS.md`, `.claude/rules/api-patterns.md`, `.claude/rules/tenant-isolation.md`
5. `scripts/verify-component-api-calls.ts` (the live 40-file allowlist) and `apps/web/src/lib/api/request-json.ts` (envelope contract).

## Batch selection rules (hard-won)

ELIGIBLE for a batch: single mount-time GET, OR single mutation, OR a query + one mutation; standard `{ data }` envelope (or a cleanly-documented flat/raw-fetch exception); 0-2 props-only consumers; an existing or obvious hook home.

EXCLUDE from batches — these get SOLO PRs, not batched (one tricky file blocks the whole batch): debounced/aborted search inputs; blob/file downloads; multi-endpoint imperative forms. Known solo-only files still on the list: `help-faq-manage-client.tsx` (3 endpoints + local-list reconciliation), `settings/payments/connected/page.tsx` (one-shot effect + ref-dedupe + base64url decode + setTimeout redirect), `sms-consent-form.tsx` (3-endpoint phone-verify flow), `request-access-form.tsx` (2 endpoints), `signup/subdomain-checker.tsx` (debounced), `documents/document-search.tsx` (debounced), `command-palette/useDataSearch.ts` (debounced), `settings/export-button.tsx` (blob download).

Runway reality: the easy single-call components are mostly drained; remaining 40 skew toward multi-endpoint/imperative. Safe batches will realistically be ~3 "query + one mutation" shapes. Do real discovery (an Explore agent that reports per-file line count, fetch count, exact endpoint+method, route `NextResponse.json` envelope, importer count) — verify the agent's findings yourself; a prior survey under-counted endpoints and mislabeled a live file as a dead allowlist entry.

## MANDATORY pre-commit gate (this is the lesson that cost a CI cycle)

For EVERY component you put in the batch, BEFORE committing run:
`grep -rlE "<ComponentName>|<endpoint-substring>" apps/web/__tests__`
Then OPEN every match. Any pre-existing test that bare-renders the component (e.g. `createRoot`/`render` without a `QueryClientProvider`) WILL fail CI once the component uses `useQuery`/`useQueryClient` — migrate it to render inside a `QueryClientProvider` with RTL `waitFor`, locating fetch calls by method (a post-save invalidation adds a refetch, so positional `calls[1]` assertions break). Route-handler tests that only `import('../../src/app/api/.../route')` are unaffected. Batch #1's first CI run was blocked by exactly one missed test (`__tests__/notification-preferences/form.test.tsx`).

## Pre-empt checklist — bake into every hook up front (kills the Gemini follow-up + 2nd CI cycle)

- Build query strings with `URLSearchParams`, not interpolation.
- Forward TanStack's `signal` on GET `queryFn`s.
- Use `requestJson<T>` ONLY when the route returns the standard `{ data: T }` envelope. If the component renders a thrown error message verbatim, or the route uses a flat/`error.details`-shaped body, keep raw `fetch` in the hook and add a one-line comment: `// Documented exception to the requestJson rule: <why>`.
- Mutations that have a corresponding query: `useQueryClient` + `invalidateQueries` on success/settle. Mutation-only flows with no cached query: no invalidation.
- Stable `queryKey` (exported `*_QUERY_KEY` const or `key(id)` factory); `enabled` guards for falsy ids.
- When seeding local component state from query data, guard with a per-key ref so a background/post-save refetch CANNOT clobber unsaved edits — DO NOT use a bare `useEffect(() => setX(data), [data])` (this was a Gemini HIGH-severity bug in batch #1):
  ```
  const seededRef = useRef<number | null>(null);
  useEffect(() => {
    if (query.data && seededRef.current !== id) { seededRef.current = id; setValues(query.data); }
  }, [query.data, id]);
  ```
- Behavior-preservation nuance: if a component keys off `isError`/`mutation.error` truthiness with FIXED banner copy (not the thrown message), `requestJson`'s different error string is invisible and behavior is preserved — fine to use `requestJson` there. Only preserve exact thrown literals when they are rendered to the user.

## Per-component work

Move the owned `/api/v1/*` call(s) into a new (or existing-domain) hook under `apps/web/src/hooks/`. Preserve EXACTLY: loading/empty/error/success states, all error-copy string literals, redirects/side-effects, cleanup, debounce, selection, and cache-invalidation behavior. Consumers are usually props-only — grep importers; only edit them if a type genuinely changed. Remove each file from `KNOWN_DIRECT_API_CALL_FILES` only after `pnpm guard:component-api-calls` proves no direct fetch remains. No unscoped DB access, route-table imports, migrations, or admin/platform boundary changes.

## Tests (both layers, per drained file, all in the one PR)

- Hook test in `apps/web/src/hooks/__tests__/` — `renderHook` + `QueryClientProvider` (`retry:false`, `mutations:{retry:false}`) + `vi.stubGlobal('fetch')`. Cover: stable key; every `enabled` guard; exact URL (incl. params) + method + body + `AbortSignal`; envelope unwrap; empty result; non-OK error; refetch-on-key-change; any documented-exception error mapping.
- Component test in `apps/web/__tests__/<domain>/` — `vi.mock('@/hooks/...')` returning controllable query/mutation state; `render`+`screen`; cover every data-state render + key interactions, asserting preserved literals precisely. Mirror `apps/web/__tests__/contracts/contract-table.test.tsx` and the batch-#1 tests.

## Verification ladder

git fetch origin --prune
git switch -c codex/b5-drain-batch-2 origin/main
pnpm install            # if node_modules missing
pnpm exec vitest run <all new test files> <every migrated pre-existing test>
pnpm guard:component-api-calls          # expect 37 if 3 drained
pnpm exec tsc --noEmit --project apps/web/tsconfig.json
pnpm lint && pnpm typecheck
pnpm exec tsx scripts/verify-no-mocks-in-integration.ts   # "17 legacy files" warning is pre-existing/passing
pnpm exec tsx scripts/verify-migration-ordering.ts
pnpm perf:check

Build is env-bound: this worktree has no `.env.local`. To confirm compilation, write a gitignored dummy `.env.local` (`DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy`, dummy `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`), run `pnpm --filter @propertypro/web build`, then DELETE it before committing. The build will fail at "Failed to collect page data for /api/v1/accounting/*" under dummy env — that is EXPECTED and unrelated (it fails after successful compilation; tsc already proves types). Rely on GitHub CI for env-bound checks.

## PR + review + merge workflow

1. Commit the focused batch (stage files explicitly, never `git add -A`); push; open the PR with a Summary table + Test plan body.
2. Run Claude `/review` on the PR; fix every real finding with covering tests.
3. Poll for Gemini/Google Code Assist. Background poll loop (don't sit idle; use ScheduleWakeup ~270s while waiting):
   - checks: `gh pr checks <N>`
   - reviews: `gh api repos/Ruckus000/PropertyPro/pulls/<N>/reviews`
   - inline comments: `gh api repos/Ruckus000/PropertyPro/pulls/<N>/comments`
   For each actionable comment: fix with a covering test, OR answer with concrete route-envelope/behavior evidence. Then reply + resolve each thread via GraphQL. GraphQL queries with nested braces fail through `gh api graphql -f query=...`; write the query/mutation to a temp file and use `gh api graphql -F query=@/tmp/q.graphql`. Mutations: `addPullRequestReviewThreadReply` then `resolveReviewThread`.
4. Wait for ALL GitHub checks green (lint, typecheck, unit, integration-tests, no-mock-guard, migration-ordering, perf-check, perf-budget, build, branch-freshness, scoped-DB ×2, both Vercel previews) AND zero unresolved review threads AND `/review` clean.
5. Squash-merge + delete remote branch: `gh pr merge <N> --squash --delete-branch`. The post-merge `gh` error "fatal: 'main' is already used by worktree" is HARMLESS (primary worktree owns main); the merge still succeeds. Then explicitly `git push origin --delete codex/b5-drain-batch-2` and verify with `git ls-remote --heads origin <branch>`.

## After merge — update docs, then stop

Update `MEMORY.md` (incl. its "Continuation Prompt" block, "Do Not Restart" list, drain-progress count, branch placeholders), `project_architectural_standardization_plan.md` (memory dir), `~/.claude/plans/draft-a-plan-that-reflective-pie.md`, AND both copies of THIS continuation prompt (`docs/b5-drain-continuation-prompt.md` + `~/.claude/plans/b5-drain-continuation-prompt.md`) with: PR #, merge SHA, components+hooks drained, tests added, `/review` + Gemini state, remote-branch deletion, new allowlist count, and next target (B5 batch #3). Then report a concise summary and STOP — do not autonomously start the next batch (if a `<<autonomous-loop>>` wakeup fires after completion, end the loop; the work is done).

## Final response must include

Selected components and why each was batch-eligible; the pre-commit `apps/web/__tests__` sweep result (which pre-existing tests existed and how each was handled); files changed; tests/checks run; PR # and merge commit; `/review` result; Gemini/Google Code Assist result; remote-branch deletion confirmation; new allowlist count; next target.
```

## Maintenance

- **Source of truth:** this repo copy. Edits land via PR (code-reviewed,
  version-controlled). After merge, copy the body verbatim into
  `~/.claude/plans/b5-drain-continuation-prompt.md` (keep that file's SYNC
  NOTICE header intact).
- **Update cadence:** after every B5 batch merges, refresh the "task",
  "verified current state", "batch selection rules", and counts here, then
  re-mirror to the plans copy. The post-merge checklist inside the prompt
  already lists both files so future runs keep them in lockstep.

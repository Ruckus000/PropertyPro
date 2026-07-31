---
name: phase-run
description: Ship one decision-ledger plan end to end — derive waves from declared file ownership, implement in parallel worktrees, integrate, verify independently, dual-review, adopt, PR, CI, merge. Use when a plan file plus its slice spec exist and the phase is approved to build.
---

# /phase-run

Ships one approved phase autonomously. Proven on website-editor v3 Phase 11b-2
(PR #883, merged with zero human interrupts).

**This skill owns all filesystem access.** The workflow it invokes
(`.claude/workflows/phase-run.workflow.js`) is pure orchestration and cannot read
disk, use a clock, or use RNG — everything it needs arrives as args. Keep that
split; it is what makes the workflow testable by reading.

## Deliberately NOT built (YAGNI — do not add without a real trigger)

- **No plan-markdown parser.** Slices come from a hand-authored JSON sidecar. A
  parser is fragile and there is no second consumer.
- **No lock file / staleness abort.** `/drain-loop` needs one because it mutates a
  shared allowlist across runs. A phase run is one branch and one PR; two
  concurrent runs of the same phase is not a real scenario. Add it when it is.
- **No multi-phase loop.** One invocation ships one phase. A human reads the
  result before the next phase starts — that checkpoint is the point.
- **No migration automation beyond a classifier and a hard stop.** The full
  apply/verify/rollback ladder gets built when a phase actually declares a
  migration, not before.

---

## Inputs

Two files per phase, both authored by hand before invoking:

1. **The plan**, `~/.claude/plans/<name>.md`, containing a **Decision Ledger**
   (every product question pre-answered, declared normative) and a **slice list**.
   Without a ledger, do not run this — the whole design assumes implementers never
   need to ask.
2. **The slice spec**, `~/.claude/plans/<name>.slices.json`:

```json
{
  "phaseName": "11b-2",
  "planPath": "/Users/…/plans/<name>.md",
  "integrationBranch": "claude/<something>",
  "prTitle": "feat(scope): … [11b-2]",
  "prBody": "markdown draft; the PR agent corrects it against the real diff",
  "migration": null,
  "slices": [
    {
      "id": "S4",
      "slug": "reader",
      "title": "public reader: slug, redirect, nav",
      "blast": "INTERNAL",
      "dependsOn": [],
      "ownedFiles": [
        "apps/web/src/lib/db/public-community-reader.ts",
        "apps/web/__tests__/lib/db/public-community-reader.test.ts"
      ],
      "scope": "markdown — what to build, and WHY where it is non-obvious",
      "doneCriteria": ["pnpm --filter @propertypro/web exec vitest run …"]
    }
  ],
  "verifyCommands": [
    { "command": "node scripts/run-lint-guards.mjs", "expect": "all guards pass" }
  ],
  "spotChecks": [
    { "command": "rg \"'use client'\" apps/web/src/components/public-site", "expect": "no new client island" }
  ]
}
```

**`ownedFiles` is load-bearing, not documentation.** The workflow derives waves
from it: slices at the same dependency level that share any file are merged into
one agent automatically. Declare every file a slice will touch, including tests.
An undeclared edit is the one failure mode that breaks a run — the workflow makes
agents report undeclared edits, and a merge conflict during integration means
exactly that happened.

**`spotChecks` are for done-criteria a green suite cannot prove** — "exactly one
definition site", "no new client island", "this fix is asserted, not just
present". Write one for every criterion phrased as an absence.

`migration` is `null` or
`{ "number": "0048", "class": "EXPAND" | "REVERSIBLE_CONTRACT" | "DESTRUCTIVE", "expect": { … } }`.
**A `DESTRUCTIVE` class refuses to run** — DROP COLUMN/TABLE and non-idempotent
DML are not reversible by any harness and PITR is a whole-project rollback, not an
undo. Split the destructive statements into their own migration and apply them by
hand.

---

## Steps

Abort at any step that fails; do not proceed on a warning.

### 1. Preconditions

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin --quiet
git log origin/main --oneline -1
git rev-parse origin/main
```

Confirm the plan file and slice spec both exist and the JSON parses. Confirm
`integrationBranch` does not already exist locally or on origin.

### 2. Validate the slice spec

Check, and abort with a specific message on any failure:
- every `dependsOn` names a real slice id; no cycles
- every slice has a non-empty `ownedFiles` and at least one `doneCriteria`
- two slices owning the same file is fine in exactly two shapes, and a hazard
  otherwise:
  - **same dependency level** → the deriver merges them into one agent. Fine.
  - **different levels WITH a dependency path between them** → the later branches
    from the earlier one's merged tip, so there is nothing to conflict with. Fine.
    (11b-2's S7 legitimately appends to a file S4 owns, because S7 `dependsOn` S4.)
  - **different levels with NO dependency path** → abort. Nothing orders them, so
    whichever merges second conflicts. Either add the `dependsOn` that was already
    implied, or split the file.
- `blast` is one of the project's tags, and the riskiest tag appears in a slice
  whose `dependsOn` is honest about ordering

### 3. Integration worktree

The integration branch needs its own worktree, separate from wherever you are
working — the workflow's integrator requires a clean tree there and any stray file
of yours will abort it.

```bash
git worktree add .claude/worktrees/<phase>-integration -b <integrationBranch> origin/main
cd .claude/worktrees/<phase>-integration && git status --porcelain   # must be empty
```

### 4. Invoke

Read `.claude/phase-run/corpus.md` and pass its **full text** as `corpus`. Capture
the timestamp outside the sandbox (the workflow has no clock).

```
Workflow({
  scriptPath: "<REPO_ROOT>/.claude/workflows/phase-run.workflow.js",
  args: {
    repoRoot, integrationWorktree, integrationBranch,
    baseSha:   "<git rev-parse origin/main>",
    tsIso:     "<date -u +%Y-%m-%dT%H:%M:%S.000Z>",
    phaseName, planPath, corpus,
    slices, verifyCommands, spotChecks, migration, prTitle, prBody
  }
})
```

Invoke by **scriptPath, not name** — project workflows are only name-resolvable at
session startup. Compute the root with `git rev-parse --show-toplevel` rather than
hardcoding it, so this works from a feature-branch worktree.

Structured args stringify across the tool boundary; the workflow parses
defensively.

### 5. On completion

The result is JSON (possibly as a string). Report to the user:

- PR number/URL and merge state
- the derived waves, so they can see the grouping the spec produced
- **any slice with a non-empty `undeclaredFiles`** — this is the ownership contract
  breaking and it needs a human's eye even when the run succeeded
- verify results, with `ENV:`-prefixed failures called out as environmental
- findings: total / HIGH / adopted / dismissed / failed
- anything in `integrateFailures`

Then **verify the claims independently** rather than relaying them — at minimum
`git log origin/main --oneline -3`, `gh pr view <n> --json state,mergeCommit`, and
`gh pr checks <n>`. The runner reporting success is not evidence that it succeeded.

Clean up: `git worktree remove` any surviving `phase-run/` worktrees, and
`git worktree prune`.

### 6. On a `stopped` result

The workflow returns `{ stopped: <reason> }` rather than merging when it cannot
proceed safely. Each is a real signal, not a retry prompt:

| `stopped` | Means | Do |
|---|---|---|
| `DESTRUCTIVE_MIGRATION` | The phase declares an irreversible migration | Split it out; a human applies it |
| `WAVE_TOTAL_FAILURE` | Every agent in a wave failed | Read their `reason`s — usually the slice scope is underspecified |
| `INTEGRATE_FAILED` | Merge conflict or dirty tree | A slice edited a file it did not declare. Fix `ownedFiles`, do not resolve by hand |
| `VERIFY_FAILED` | Local gate red after two repair rounds | Read it. This is the gate doing its job |
| `POST_ADOPT_VERIFY_FAILED` | A review fix broke the gate | Inspect the adopt commits |
| `CI_NOT_GREEN` | CI red/timeout after two repair rounds | Read the job logs |

**Do not re-run a stopped phase blindly.** Every stop above means a human should
look first.

---

## Notes that have cost real time

- Keep the runner script **out of the integration worktree**. On 11b-2 it was
  written into the repo first, which would have dirtied the tree the integrator
  requires clean and landed the tooling in the phase's PR.
- A fresh worktree after `pnpm install` has **unbuilt workspace packages**;
  `pnpm test` then reports ~269 bogus failures. The workflow's prompts build the
  non-app packages first — keep that.
- `parallel()` absorbs a thrown agent to `null`; direct awaits do not, which is why
  the workflow wraps them in `safeAgent`. Any new direct call needs the same.
- The reviewers' two guards are not optional: *never read local-disk files* (the
  tree has moved on) and *you MUST call StructuredOutput even for zero findings*
  (a turn without it is dropped as null and wastes the review).

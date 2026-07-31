---
name: phase-run
description: Take a plan, stress-test it against the codebase, report where it is weak, then implement it end to end unattended — waves, independent verification, adversarial diagnosis, four-lens review, migration ladder, merge, and a production health check with automatic rollback. Use when handed a plan to build.
---

# /phase-run

**Give it a plan. It tells you where the plan is weak. You approve once. It ships.**

One human gate, at the start. After that it runs to completion — through failing
tests, red CI, review findings and merge conflicts — and only comes back for the
three things that genuinely belong to a human.

```
/phase-run <path-to-plan> [phase hint]
```

The plan can be prose. It does **not** need a pre-written decision ledger or
slice spec — deriving those is this skill's job. Having to hand-write them was
the flaw in the previous version: it automated the easy half and left the hard
half blocking on a human.

**This skill owns all filesystem access.** Both workflows it invokes are pure
orchestration and cannot read disk, use a clock, or use RNG — everything arrives
as args. Keep that split; it is what makes them testable by reading.

---

## Stage 1 — Intake (the only stop)

Run `.claude/workflows/phase-intake.workflow.js` by **scriptPath**, passing
`repoRoot`, `planPath`, the full text of `.claude/phase-run/corpus.md`, and any
phase hint.

It reads the plan, then does the thing that matters most: **extracts every
factual claim the plan makes about the codebase and verifies each one against the
actual code, in parallel.** A plan is a set of assertions written by someone who
was not reading every file at the time. When one is wrong, faithful
implementation produces a broken product and no downstream review catches it,
because the code correctly implements the plan. The 11b-0 plan asserted that
community subdomains do not serve the authenticated app; that was false, and
building it as written would have routed every resident's dashboard to the public
site renderer.

Present to the human in this order:

1. **Weaknesses** — BLOCKER first. Lead with any `FALSE_PREMISE`: "the plan says
   X, the code says Y, here is what breaks."
2. **Decisions** — the derived ledger. Call out `confidence: LOW` (a guess) and
   `reversible: false` (permanent once shipped) explicitly. These are what they
   actually need to read.
3. **The shape** — phases, slices, derived waves, what runs in parallel.
4. **Risk** — migration class, blast radius, what the rollback is.
5. **Readiness** — READY / NEEDS_DECISIONS / BLOCKED.

Be concise and lead with the bad news. The human is answering one question: *is
this plan sound enough to build unattended?* Never run stage 2 on a `BLOCKED`
intake, and never soften a blocker to get moving.

## Stage 2 — Run (unattended)

On approval, run `.claude/workflows/phase-run.workflow.js` by scriptPath with the
approved `spec.phases`, the full text of **`corpus.md`**, **`bug-protocol.md`**
and **`recovery.md`**, `baseSha` (`git rev-parse origin/main`), `tsIso` (the
sandbox has no clock), and `stateDir: ~/.claude/state/phase-run`.

Create that state directory and the integration-worktree root first. Each phase
gets its own integration worktree — never the one you are working in, since the
integrator requires a clean tree there.

Per phase: capture a verified restore point → derive waves from declared file
ownership → implement in parallel worktrees → integrate → verify via an agent
that did not write the code → **adversarially diagnose anything red before fixing
it** → apply any migration through the ladder → open a PR → four review lenses
(correctness, corpus, DevOps+chaos, security) → adjudicate findings adversarially
→ adopt only what survives → re-verify → CI → merge → **confirm production is
healthy, and roll back automatically if it is not.**

Phases chain. A phase with a `deploy-live` gate waits for the previous one to be
genuinely live in production, not merely merged.

---

## Reference — the slice spec the intake produces

You do not write this by hand; it is here so you can read and correct what intake
derived.

One entry per phase, in execution order:

```json
{
  "phaseName": "11b-2",
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
`{ "number", "class": "EXPAND" | "REVERSIBLE_CONTRACT" | "DESTRUCTIVE", "classRationale", "statements": [], "expect": {} }`.
`gate` is `{ "kind": "deploy-live" | "none", "verifyCommand", "rationale" }` — use
`deploy-live` when a phase cannot start until the previous one is live in
production, which is a real wait, not a checkpoint.

---

## What it will not do

Three stops, and they are not configurable:

**Irreversible operations.** `DROP COLUMN`/`DROP TABLE`, non-idempotent DML, a
force-push over commits that are not its own, deleting a branch with unmerged
work, or anything outward-facing (mail, third-party posts, charges). Nothing can
undo these, and PITR is a whole-project rollback rather than an undo. A
DESTRUCTIVE migration is refused *before* any work starts, not halfway through.

**A decision that changes what gets built.** If following the plan would produce
the wrong product, it stops. "This is hard" is not that; "this plan step is
wrong" is.

**An external blocker.** A credential, an account, an access grant. It will never
read, echo, log or commit a secret in order to get past one.

Everything else — failing tests, red CI, review findings, merge conflicts,
re-scoping inside a slice's blast radius — is work, and it does the work.

## Safety model

Full detail in `.claude/phase-run/recovery.md`. Four properties:

- **Capture before change.** A verified restore point per phase — main SHA, live
  deployment id, migration ledger tip, advisor baseline — written to
  `~/.claude/state/phase-run/`, deliberately outside the repo. A restore point
  stored in the thing you are about to break is not a restore point. **No restore
  point, no run.**
- **Retain.** Nothing is deleted until production is confirmed healthy. Slice
  branches are pushed to origin and never deleted; worktrees survive the phase.
- **Detect.** Green CI is not evidence production works, and the failure this
  guards against is *not noticing for a week*. Every phase ends with a real check
  against production: did the deploy land, does the steady state hold, are there
  new advisor errors or new Sentry issue classes.
- **Restore.** A runbook written and *verified* at capture time, not improvised
  under pressure. Unhealthy production triggers rollback immediately — Vercel
  instant rollback first, then a revert PR. Diagnose from a healthy production,
  never a broken one. **Ambiguity is escalation, never a pass.**

## Security

Mandatory, not advisory:

- A **security lens runs on every PR** and its findings need a much stronger
  defence than any other lens to be dismissed. "Unlikely to be exploited" is not
  a defence; "the caller cannot reach this path because file:line" is.
- Priorities in this codebase's order: tenant isolation → broken access control
  (especially **a privilege flag derived from something the caller controls** —
  that shipped in 11b-2) → data exposure → injection → RLS → OWASP generally.
- **Least privilege.** A phase without a migration never touches production
  credentials; `.env.local`'s `DATABASE_URL` is production and integration tests
  use the local disposable DB.
- The runner **may not edit its own safety machinery** while shipping a phase. A
  diff touching `.claude/phase-run/*` or `.claude/workflows/phase-run*` is a HIGH
  security finding regardless of how correct it looks.

## How problems get handled

`.claude/phase-run/bug-protocol.md`, injected into every implement, repair and
review prompt. Two mechanisms:

**Adversarial diagnosis before any fix.** A critic states findings; a defender
answers them; only what the defender cannot answer is treated as real. Adapted
from the `/dg` pattern (github.com/v1r3n/dinesh-gilfoyle) — the logic, not the
code. It exists because a retry loop thrashes on a misdiagnosed symptom and, far
worse, can go *green* by hiding the fault: weaken an assertion, add a guard, ship
the bug with a passing suite. **A red gate with no confirmed finding stops the
run** — an unexplained failure is not something to guess at against production.

**The verification checklist**, walked item by item on every fix with the result
reported per item, and every non-trivial decision considered from **both** the
DevOps and the chaos engineer's perspective, saying which lens drove it. Where
they conflict: chaos wins on anything irreversible, DevOps on anything routine.

---

## Validating what intake derived

Before stage 2, check and abort with a specific message on any failure:
- every `dependsOn` names a real slice id; no cycles
- every slice has a non-empty `ownedFiles` and at least one `doneCriteria`
- **every done-criterion is a runnable command, and would FAIL if the slice did
  nothing.** A criterion that cannot fail is not a criterion.
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

## Invoking stage 2

Create `~/.claude/state/phase-run/` and an integration-worktree root first. The
workflow makes one integration worktree per phase; none of them may be the tree
you are working in, since the integrator requires it clean.

Invoke by **scriptPath, not name** — project workflows are only name-resolvable
at session startup. Compute the root with `git rev-parse --show-toplevel`, never
hardcoded, so this works from a feature-branch worktree. Pass the **full text**
of `corpus.md`, `bug-protocol.md` and `recovery.md`; capture `tsIso` outside the
sandbox. Structured args stringify across the tool boundary; both workflows parse
defensively.

## On completion

Report per phase: PR/merge/health, the derived waves (so the grouping is
visible), migration stage and ledger id, findings raw-vs-confirmed-vs-refuted,
any `ENV:` verification gaps, and — importantly — **any `undeclaredEdits`**. That
is the ownership contract breaking, and it needs a human's eye even on a green
run.

Then **verify independently rather than relaying**: `git log origin/main
--oneline -3`, `gh pr view <n> --json state,mergeCommit`, `gh pr checks <n>`, and
the live production deployment. The runner reporting success is not evidence that
it succeeded.

Sweep worktrees only after the human has read the report
(`git worktree remove … && git worktree prune`). **Leave the branches.**

## Stop codes

| Code | Means | Do |
|---|---|---|
| `DESTRUCTIVE_MIGRATION` | Irreversible statement declared | Split it out; a human applies it |
| `NO_RESTORE_POINT` | Could not capture or verify one | Fix access first — never run blind |
| `GATE_NOT_MET` | Previous phase not live in prod | Check the deploy |
| `BAD_SLICE_SPEC` | Cycle or unknown dependency | Fix the spec |
| `WAVE_TOTAL_FAILURE` | Every agent in a wave failed | Scope is underspecified |
| `INTEGRATE_FAILED` | Merge conflict | A slice edited an undeclared file — fix `ownedFiles`, never hand-resolve |
| `VERIFY_FAILED` | Red after 3 diagnose-and-fix rounds | Read it; the gate is working |
| `VERIFY_FAILED_NO_DIAGNOSIS` | Red, but nothing confirmed | The failure is not understood — do not guess |
| `MIGRATION_NOT_APPLIED` | Ladder stopped or rolled back | Read `expectMismatches` |
| `DIAGNOSIS_NEEDS_HUMAN` | Fix needs an irreversible op or a real decision | Yours |
| `POST_ADOPT_VERIFY_FAILED` | A review fix broke the gate | Inspect the adopt commits |
| `CI_NOT_GREEN` | Red/timeout after 2 rounds | Read the job logs |
| `ROLLED_BACK` | Prod was unhealthy; rollback succeeded | Diagnose from healthy prod |
| `ROLLBACK_FAILED` | **Urgent** — prod unhealthy, rollback failed | Manual intervention now |
| `HEALTH_UNVERIFIED` | Could not confirm prod health | Chaining stopped deliberately |

**Never re-run a stopped phase blindly.** Every code means a human should look
first.

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

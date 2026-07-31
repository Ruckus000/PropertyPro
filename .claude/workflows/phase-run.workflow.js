// Generic phase runner: ships one decision-ledger plan end to end.
//
// Proven on website-editor v3 Phase 11b-2 (PR #883, merged with zero human
// interrupts) as a one-off with the slice specs hardcoded; this is that runner
// with the repo- and phase-specific parts lifted out into args.
//
// Responsibilities (SRP — this file does orchestration and NOTHING else):
//   - derive waves from declared file ownership + dependencies
//   - fan slices out, integrate them, verify, review, adopt, ship
// It knows nothing about PropertyPro. Repo knowledge arrives as `corpus`;
// phase knowledge arrives as `slices`. The skill owns all filesystem access.
//
// Sandbox constraints:
//   - no filesystem, no Date.now()/new Date()/Math.random()
//   - self-contained: no imports
//   - meta must be a pure literal

export const meta = {
  name: 'phase-run',
  description: 'Ship one decision-ledger plan: derive waves → parallel implement → integrate → independent verify → dual review → adopt → re-verify → PR → CI → merge',
  whenToUse: 'Invoked by the /phase-run skill. Do not call directly — the skill reads the plan, slices and corpus off disk and passes them in.',
  phases: [
    { title: 'Implement' },
    { title: 'Integrate' },
    { title: 'Verify' },
    { title: 'Review' },
    { title: 'Adopt' },
    { title: 'Ship' },
  ],
}

// Structured args stringify across the Workflow tool boundary but survive as
// real objects through an inline workflow() call. Handle both.
const A = typeof args === 'string' ? JSON.parse(args) : args
const {
  repoRoot,
  integrationWorktree,
  integrationBranch,
  baseSha,
  tsIso,
  phaseName,
  planPath,
  corpus,
  slices,
  verifyCommands,
  spotChecks = [],
  migration = null,
  prTitle,
  prBody,
} = A

log(`phase-run "${phaseName}" starting ${tsIso}; ${slices.length} slices from ${baseSha.slice(0, 8)}`)

// ============================================================ wave derivation

// Group slices into waves. Two rules, both mechanical:
//
//   1. A slice runs only after everything in `dependsOn` has landed → topological
//      levels.
//   2. Slices at the same level that declare ANY file in common are merged into
//      ONE agent → union-find over `ownedFiles`.
//
// Rule 2 is the whole point. On 11b-2 the grouping was done by hand and one agent
// still had to break file discipline; deriving it from the declared ownership
// makes an overlap impossible to miss, and makes a merge conflict during
// integration mean "a slice edited a file it did not declare" rather than "bad
// luck". Keep this simple — it is a grouping rule, not a scheduler.
function deriveWaves(slices) {
  const byId = new Map(slices.map(s => [s.id, s]))
  const level = new Map()

  // Longest-path level assignment. Iterate to a fixed point; slices.length passes
  // is a hard ceiling, and exceeding it means a dependency cycle.
  for (const s of slices) level.set(s.id, 0)
  let settled = false
  for (let pass = 0; pass <= slices.length && !settled; pass++) {
    settled = true
    for (const s of slices) {
      for (const dep of s.dependsOn ?? []) {
        if (!byId.has(dep)) throw new Error(`slice ${s.id} dependsOn unknown slice ${dep}`)
        const want = level.get(dep) + 1
        if (want > level.get(s.id)) { level.set(s.id, want); settled = false }
      }
    }
  }
  if (!settled) throw new Error('dependency cycle in slices')

  const waves = []
  const maxLevel = Math.max(...slices.map(s => level.get(s.id)))
  for (let lv = 0; lv <= maxLevel; lv++) {
    const here = slices.filter(s => level.get(s.id) === lv)
    if (here.length === 0) continue

    // Union-find on shared owned files.
    const parent = new Map(here.map(s => [s.id, s.id]))
    const find = id => (parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id)))
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
    const owner = new Map()
    for (const s of here) {
      for (const f of s.ownedFiles ?? []) {
        if (owner.has(f)) union(owner.get(f), s.id)
        else owner.set(f, s.id)
      }
    }
    const groups = new Map()
    for (const s of here) {
      const root = find(s.id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root).push(s)
    }
    waves.push([...groups.values()])
  }
  return waves
}

const waves = deriveWaves(slices)
log(`derived ${waves.length} wave(s): ${waves.map((w, i) => `W${i + 1}=[${w.map(g => g.map(s => s.id).join('+')).join(', ')}]`).join(' ')}`)

// ==================================================================== schemas

const SLICE_RESULT_SCHEMA = {
  type: 'object',
  required: ['ok', 'sliceId'],
  properties: {
    ok: { type: 'boolean' },
    sliceId: { type: 'string' },
    branch: { type: 'string' },
    worktreePath: { type: 'string' },
    commitSha: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    undeclaredFiles: { type: 'array', items: { type: 'string' } },
    commandsRun: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'passed'],
        properties: {
          command: { type: 'string' },
          passed: { type: 'boolean' },
          summary: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
    reason: { type: 'string' },
  },
}

const INTEGRATE_RESULT_SCHEMA = {
  type: 'object',
  required: ['ok', 'tipSha', 'merged', 'failed'],
  properties: {
    ok: { type: 'boolean' },
    tipSha: { type: 'string' },
    merged: { type: 'array', items: { type: 'string' } },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sliceId', 'reason'],
        properties: { sliceId: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
}

const VERIFY_RESULT_SCHEMA = {
  type: 'object',
  required: ['allPassed', 'results'],
  properties: {
    allPassed: { type: 'boolean' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'passed', 'evidence'],
        properties: {
          command: { type: 'string' },
          passed: { type: 'boolean' },
          evidence: { type: 'string' },
          failureDetail: { type: 'string' },
        },
      },
    },
    slicesFailing: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'confidence', 'file', 'description', 'isCoverageExpansion'],
        properties: {
          severity: { enum: ['HIGH', 'MEDIUM', 'LOW'] },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          file: { type: 'string' },
          line: { type: 'integer' },
          description: { type: 'string' },
          suggestedFix: { type: 'string' },
          isCoverageExpansion: { type: 'boolean' },
          sliceId: { type: 'string' },
        },
      },
    },
  },
}

const ADOPT_RESULT_SCHEMA = {
  type: 'object',
  required: ['adopted', 'dismissed', 'failed'],
  properties: {
    adopted: { type: 'array', items: { type: 'string' } },
    dismissed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'reason'],
        properties: { finding: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'reason'],
        properties: { finding: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    headSha: { type: 'string' },
  },
}

const PR_RESULT_SCHEMA = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
    prNumber: { type: 'integer' },
    prUrl: { type: 'string' },
    reason: { type: 'string' },
  },
}

const CI_WAIT_RESULT_SCHEMA = {
  type: 'object',
  required: ['state', 'waitedSeconds'],
  properties: {
    state: { enum: ['GREEN', 'RED', 'TIMEOUT'] },
    failedChecks: { type: 'array', items: { type: 'string' } },
    waitedSeconds: { type: 'integer' },
  },
}

const MERGE_RESULT_SCHEMA = {
  type: 'object',
  required: ['state'],
  properties: {
    state: { enum: ['MERGED', 'REBASE_FAILED', 'MERGE_FAILED', 'CI_FAILED_AFTER_REBASE'] },
    mergeCommit: { type: 'string' },
    reason: { type: 'string' },
  },
}

// A direct `await agent({schema})` THROWS if the subagent finishes without
// calling StructuredOutput. parallel() already absorbs that to null; safeAgent
// gives direct calls the same graceful degradation.
async function safeAgent(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log(`agent ${opts?.label ?? '(unlabeled)'} dropped/failed: ${e?.message ?? e}`)
    return null
  }
}

// ==================================================================== prompts

const STRUCTURED_OUTPUT_MANDATE = `**You MUST end your turn by calling the StructuredOutput tool**, even on failure and
even with zero findings. A turn that ends without it is dropped as a null result and wastes the work.`

const NO_LOCAL_DISK = `## CRITICAL: do NOT read files from local disk
Other agents have moved on and the working tree is not what you are reviewing. Read the code under
review ONLY through \`gh pr diff <n>\`, \`gh pr diff <n> --name-only\`, and
\`git show "origin/${'<branch>'}:<path>"\` for full-file context. A finding based on a stale local
file is a false positive that wastes an adopt cycle.`

function fmtCommands(cmds) {
  return cmds.map(c => `- \`${typeof c === 'string' ? c : c.command}\`${typeof c === 'object' && c.expect ? ` — expect: ${c.expect}` : ''}`).join('\n')
}

function implementPrompt(group, worktreePath, branch, fromSha) {
  const ids = group.map(s => s.id)
  const ownedFiles = [...new Set(group.flatMap(s => s.ownedFiles ?? []))]
  return `You are implementing part of an APPROVED plan. Read it first — it is normative:

\`\`\`
${planPath}
\`\`\`

Implement ONLY slice(s) **${ids.join(', ')}** of phase ${phaseName}.

The plan's **Decision Ledger** answers every product question. If you find yourself wanting to ask
the user something, the answer is in the ledger. If you genuinely disagree with a ledger entry,
**implement it as written and record your objection in \`notes\`** — do not deviate, do not stop.

## Workspace
\`\`\`bash
cd ${repoRoot}
git worktree add ${worktreePath} ${fromSha} -b ${branch}
cd ${worktreePath}
pnpm install --silent
pnpm --filter "@propertypro/*" --filter "!@propertypro/web" --filter "!@propertypro/admin" build
\`\`\`
That last build is not optional — a fresh worktree has unbuilt workspace packages and \`pnpm test\`
will report ~269 bogus failures without it.

Work ONLY inside \`${worktreePath}\`. Other agents are working in sibling worktrees concurrently.

## File ownership — this is what keeps the parallel waves conflict-free
You own exactly these paths:
${ownedFiles.map(f => `- \`${f}\``).join('\n')}

Do not edit anything else. If you believe you must, **do not** — record the path and the reason in
\`undeclaredFiles\` and \`notes\` and work around it. Editing a file another slice owns is the one
failure mode that breaks the whole run. (If a file genuinely must change and cannot be worked
around, edit it, but you MUST list it in \`undeclaredFiles\` — a silent extra edit is far worse
than a declared one.)

${group.map(s => `## Slice ${s.id} — ${s.title}  [blast: ${s.blast}]\n${s.scope}\n\n**Done-criteria — run each and report the real output:**\n${fmtCommands(s.doneCriteria ?? [])}`).join('\n\n---\n\n')}

---

${corpus}

## Commit
Conventional-commit messages scoped to the phase, e.g.
\`feat(<scope>): <what> [${phaseName} ${ids.join('+')}]\`. Multiple commits are fine.
Do NOT push, open a PR, or merge — the runner does that.

## Return
StructuredOutput with \`ok\`, \`sliceId: "${ids.join('+')}"\`, \`branch\`, \`worktreePath\`,
\`commitSha\`, \`filesChanged\`, \`undeclaredFiles\`, \`commandsRun\` (one entry per done-criterion
with \`passed\` and a one-line \`summary\` of the ACTUAL output — never report a command you did not
run), and \`notes\`. On failure \`ok: false\` plus \`reason\`.

${STRUCTURED_OUTPUT_MANDATE}`
}

function integratePrompt(waveIndex, results) {
  return `Integrate wave ${waveIndex} of phase ${phaseName} into the integration branch.

## Inputs
Integration worktree: \`${integrationWorktree}\`
Integration branch: \`${integrationBranch}\`
Slice branches to merge, IN THIS ORDER:
\`\`\`json
${JSON.stringify(results.map(r => ({ sliceId: r.sliceId, branch: r.branch, worktreePath: r.worktreePath, filesChanged: r.filesChanged, undeclaredFiles: r.undeclaredFiles, notes: r.notes })), null, 2)}
\`\`\`

## Procedure
\`\`\`bash
cd ${integrationWorktree}
git status --porcelain     # must be empty; if not, STOP and report ok:false
\`\`\`
Then for each branch in order: \`git merge --no-ff <branch> -m "merge(${phaseName}): <sliceId>"\`.

The waves were DERIVED so that everything merged here owns a disjoint file set. **A conflict
therefore means a slice edited a file it did not declare.** On conflict:
1. \`git merge --abort\`
2. record that slice in \`failed\`, reason = the conflicting paths
3. continue with the remaining branches
Do NOT resolve conflicts by hand — a conflict is a signal the plan's ownership map is wrong, and
papering over it hides that.

Any slice reporting a non-empty \`undeclaredFiles\` merged fine but broke the ownership contract.
Note it in the \`failed\` reason of no slice — instead surface it by listing those paths in your
returned \`merged\` entry as \`"<sliceId> (undeclared: a, b)"\` so a human sees it.

Sanity-check the merged tree compiles at all:
\`\`\`bash
pnpm --filter @propertypro/web exec tsc --noEmit
\`\`\`
Do not fix failures — the Verify phase owns that. Report the error summary.

Then remove each SUCCESSFULLY merged slice's worktree (\`git worktree remove <path> --force\`),
leaving any failed slice's worktree in place for inspection.

## Return
StructuredOutput with \`ok\`, \`tipSha\` (\`git rev-parse HEAD\` after merging), \`merged\`, \`failed\`.
${STRUCTURED_OUTPUT_MANDATE}`
}

function verifyPrompt(tipSha, label) {
  const migrationSection = migration
    ? `## Migration \`expect\` block — phase ${phaseName} ships migration ${migration.number} (${migration.class})
Assert the catalog and probe expectations below against the LOCAL disposable DB only. **Do not
touch production.** If any assertion mismatches, report it as a failed command — do not improvise.
\`\`\`json
${JSON.stringify(migration.expect ?? {}, null, 2)}
\`\`\``
    : `## Migration
Phase ${phaseName} ships NO migration. Assert it mechanically:
\`git diff --name-only origin/main...HEAD -- packages/db/migrations packages/db/src/schema | wc -l\`
must be **0**.`

  return `You are the VERIFY gate for phase ${phaseName}. You did not write this code. Re-run the
verification sweep independently and report **what actually happened**, not what should have.

## Workspace
\`\`\`bash
cd ${integrationWorktree}
pnpm install --silent
pnpm --filter "@propertypro/*" --filter "!@propertypro/web" --filter "!@propertypro/admin" build
git log --oneline -1        # expect ${tipSha.slice(0, 8)}
git status --porcelain      # expect empty, before AND after install
\`\`\`
Read-only apart from running commands. Do not fix anything. Do not commit.

${migrationSection}

## Run every one of these, in order, and read the output
${fmtCommands(verifyCommands)}

${spotChecks.length ? `## Spot-checks — done-criteria a green suite does not prove\n${fmtCommands(spotChecks)}` : ''}

${corpus}

## Return
StructuredOutput: \`allPassed\` (true only if EVERY command passed), \`results\` (one entry per
command with \`passed\` and \`evidence\` = the actual key line of output — a test count, a guard
verdict, a byte size), and \`slicesFailing\`.

**Report faithfully. A false green here defeats the entire point of this gate.** If a command
could not be RUN in this environment, mark it \`passed: false\` with a \`failureDetail\` starting
\`ENV:\` — those are tolerated and distinguished from real failures. Never mark an unrun command
passed.
${STRUCTURED_OUTPUT_MANDATE}`
}

function repairPrompt(verifyResult, tipSha) {
  return `The VERIFY gate for phase ${phaseName} failed. Fix it.

## Workspace
\`\`\`bash
cd ${integrationWorktree}
git log --oneline -3        # tip should be ${tipSha.slice(0, 8)}
\`\`\`
Work directly on \`${integrationBranch}\` here. Commit your fixes.

## What failed
\`\`\`json
${JSON.stringify(verifyResult, null, 2)}
\`\`\`

## Rules
- Fix the CAUSE. Never delete or skip a failing test to go green, and never loosen an assertion
  that is catching a real defect.
- The plan (\`${planPath}\`) and its Decision Ledger are the spec. If a failure means a ledger
  decision was wrong, implement the ledger as written and record the objection — do not redesign
  mid-run.
- \`ENV:\`-prefixed failures are not yours to fix. Leave them and say so.

${corpus}

## Return
StructuredOutput in the slice-result shape: \`ok\`, \`sliceId: "repair"\`, \`commitSha\`,
\`filesChanged\`, \`commandsRun\`, \`notes\`.
${STRUCTURED_OUTPUT_MANDATE}`
}

function codeReviewPrompt(pr) {
  return `Review PR #${pr.prNumber} (${pr.prUrl}) — phase ${phaseName}. You are the GENERAL
CORRECTNESS reviewer; a separate agent covers this repo's conventions. Do not duplicate its work.

Use \`/code-review --effort high\` if available, otherwise review the diff directly.

${NO_LOCAL_DISK.replace('<branch>', pr.branch)}

## The approved plan (normative)
\`${planPath}\` — read it. Its Decision Ledger is the spec. A **deviation** from a ledger entry is
a finding; **disagreeing** with a ledger entry is not.

## What to look for
- Logic errors, off-by-one, inverted conditions, wrong branch order.
- Anything that changes which requests reach which handler. In this codebase that is the highest
  severity class — a request that previously reached the authenticated app and now does not is a
  user-facing outage.
- Authorization and visibility: can an unauthenticated or unauthorized caller reach data they
  could not before? Is any privilege flag derived from something the caller controls?
- Tenancy: is every new query scoped?
- Redirect loops, unbounded walks, links to things that do not exist.
- Error handling and null propagation on new code paths.
- Behaviour the plan says must be UNCHANGED that the diff changes anyway.

## Severity
- **HIGH**: a user sees the wrong thing, a security or tenancy boundary is crossed, a live URL
  breaks, or previously-working functionality stops.
- **MEDIUM**: a real defect with a narrow trigger, a missing test for a stated done-criterion, a
  contract that will break at the next phase.
- **LOW**: style, naming, comment accuracy.

Set \`isCoverageExpansion: true\` for findings that are purely "add a test for X" rather than "this
code is wrong". Set \`sliceId\` when you can attribute it.

## Return
StructuredOutput with \`findings\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

function corpusReviewPrompt(pr) {
  return `Review PR #${pr.prNumber} (${pr.prUrl}) against THIS CODEBASE's conventions and its
specific history. You are the CORPUS reviewer; a separate agent covers general correctness.

${NO_LOCAL_DISK.replace('<branch>', pr.branch)}

## The approved plan
\`${planPath}\`. Its Decision Ledger is normative.

${corpus}

## Your job
Every numbered item above is a lens. Walk the diff against each one and report what it catches.
The "Review lenses" section at the end is ranked by how often each has found a real defect here —
start there. Pay particular attention to **tests that pass for the wrong reason**: that is the
single most common finding on this programme, and a green suite is not evidence against it.

## Severity
- **HIGH**: user-visible breakage, tenancy or draft/published leakage, a CI-red that is locally
  invisible, or a fix that is untestable by construction.
- **MEDIUM**: real defect with a narrow trigger, missing test for a stated done-criterion, a
  convention break that will bite next phase.
- **LOW**: style, naming, comment accuracy.

\`isCoverageExpansion: true\` for pure "add a test" findings. Set \`sliceId\` when you can.

## Return
StructuredOutput with \`findings\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

function dedupeFindings(a, b) {
  // Same file + line within ±2 + same severity. Descriptions are too freeform
  // for an exact match.
  const seen = []
  for (const f of [...a, ...b]) {
    const dup = seen.find(s =>
      s.file === f.file &&
      Math.abs((s.line ?? 0) - (f.line ?? 0)) <= 2 &&
      s.severity === f.severity
    )
    if (!dup) seen.push(f)
  }
  return seen
}

function isActionable(f) {
  return f.severity === 'HIGH' || (f.severity === 'MEDIUM' && !f.isCoverageExpansion)
}

function adoptPrompt(pr, findings) {
  return `Adopt the actionable review findings on PR #${pr.prNumber} (phase ${phaseName}).

## Workspace
\`\`\`bash
cd ${integrationWorktree}
git status --porcelain     # must be empty
\`\`\`

## Findings (HIGH + non-coverage MEDIUM)
\`\`\`json
${JSON.stringify(findings.filter(isActionable), null, 2)}
\`\`\`

## Rules
1. **Verify each finding against the diff first** — \`gh pr diff ${pr.prNumber}\`. A reviewer
   working from a stale local file produces plausible findings about code that is not there.
   Dismiss those with reason \`"false-positive-on-diff-inspection"\`.
2. **Check each finding against the plan's Decision Ledger** (\`${planPath}\`). A finding asking for
   behaviour the ledger explicitly decided against is dismissed with reason
   \`"contradicts ledger D<n>"\`. The ledger is the spec; re-litigating it mid-run is exactly what
   this format exists to prevent.
3. For each surviving finding: make the fix, re-run the affected tests, commit on pass. On failure
   \`git checkout -- <file>\` and record it in \`failed\`.
4. Never weaken or delete a test to make a finding go away.
5. Re-run the local gate after all fixes, then \`git push --force-with-lease\`.

${corpus}

## Return
StructuredOutput: \`adopted\`, \`dismissed\` ({finding, reason}), \`failed\` ({finding, reason}),
\`headSha\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

function openPrPrompt() {
  return `Open the pull request for phase ${phaseName}.

\`\`\`bash
cd ${integrationWorktree}
git status --porcelain            # must be empty
git log --oneline origin/main..HEAD
git push -u origin ${integrationBranch}
\`\`\`

Read the plan at \`${planPath}\` and write the PR body from it — do not invent scope. A draft body
is below; correct anything it gets wrong against the actual diff, and keep the test-plan checklist
honest (only tick what the Verify gate actually ran).

\`\`\`markdown
${prBody}
\`\`\`

\`\`\`bash
gh pr create --base main --head ${integrationBranch} --title "${prTitle}" --body "$(cat <<'PRBODY'
<the corrected body>
PRBODY
)"
\`\`\`

## Return
StructuredOutput with \`ok\`, \`prNumber\`, \`prUrl\`; on failure \`ok:false\` + \`reason\`.
${STRUCTURED_OUTPUT_MANDATE}`
}

function ciWaitPrompt(prNumber) {
  return `Wait for CI on PR #${prNumber}.

Poll \`gh pr checks ${prNumber}\` every 90 seconds.
- Any REQUIRED check failing → \`state: "RED"\` with \`failedChecks\`.
- All required checks passing → \`state: "GREEN"\`.
- Wall-clock cap 30 minutes → \`state: "TIMEOUT"\`.

Vercel checks are auto-skipped via \`ignoreCommand\`; ignore them. **\`Build\` does not build** —
\`perf-check\` owns the only production build and \`Build\` asserts
\`needs.perf-check.result == 'success'\`, so a *skipped* perf-check FAILS Build. Never read a skip
as a pass.

## Return
StructuredOutput with \`state\`, \`failedChecks\`, \`waitedSeconds\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

function ciRepairPrompt(prNumber, failedChecks) {
  return `CI is RED on PR #${prNumber} (phase ${phaseName}). Failed: ${JSON.stringify(failedChecks)}.

\`\`\`bash
cd ${integrationWorktree}
gh run list --branch ${integrationBranch} --limit 5
gh run view <id> --log-failed
\`\`\`
Diagnose from the real logs and fix the CAUSE. Never delete or skip a failing test to go green.
Commit, then \`git push --force-with-lease\`.

The "Verification commands" and "Test traps" sections below cover the usual causes — a DB-gated
test CI runs and a local run skips, a mock factory missing a new export, a \`node:*\` import in a
client bundle, a lint guard hidden behind a tail, a stale turbo typecheck cache.

${corpus}

## Return
StructuredOutput in the slice-result shape: \`ok\`, \`sliceId: "ci-repair"\`, \`commitSha\`,
\`filesChanged\`, \`commandsRun\`, \`notes\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

function mergePrompt(prNumber) {
  return `Merge PR #${prNumber} (phase ${phaseName}).

\`\`\`bash
cd ${integrationWorktree}
git fetch origin --quiet
git rebase origin/main
\`\`\`
- Conflict → \`git rebase --abort\`, return \`state: "REBASE_FAILED"\` with the conflicting paths.
- Clean → \`git push --force-with-lease\`, re-wait for CI on the rebased branch
  (\`gh pr checks ${prNumber}\` every 90s, max 10 min). Not green → \`"CI_FAILED_AFTER_REBASE"\`.
- Green → \`gh pr merge ${prNumber} --squash\`, then \`gh pr view ${prNumber} --json mergeCommit\`
  and return \`state: "MERGED"\` with \`mergeCommit\`.

This repo has auto-merge DISABLED and \`delete_branch_on_merge\` DISABLED — merge synchronously,
do not rely on \`--auto\`.

## Return
StructuredOutput with \`state\`, \`mergeCommit\`, \`reason\`. ${STRUCTURED_OUTPUT_MANDATE}`
}

// ================================================================== execution

// A destructive migration is a hard stop. No harness can undo a DROP COLUMN or a
// non-idempotent DML; PITR is a whole-project rollback, not an undo. Refuse
// before doing any work rather than halfway through.
if (migration && migration.class === 'DESTRUCTIVE') {
  log('DESTRUCTIVE migration declared — refusing to run autonomously.')
  return {
    stopped: 'DESTRUCTIVE_MIGRATION',
    reason: `Phase ${phaseName} declares migration ${migration.number} as DESTRUCTIVE. ` +
      'DROP COLUMN/TABLE and non-idempotent DML are not reversible by this harness and must be ' +
      'applied by a human. Re-run with the destructive statements split into their own migration.',
    migration,
  }
}

let tip = baseSha
const waveResults = []
const integrations = []

for (let w = 0; w < waves.length; w++) {
  phase('Implement')
  const groups = waves[w]
  log(`Wave ${w + 1}/${waves.length}: ${groups.length} agent(s)`)

  const results = (await parallel(groups.map(group => () => {
    const ids = group.map(s => s.id)
    const slug = group.map(s => s.slug ?? s.id).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const worktreePath = `${repoRoot}/.claude/worktrees/${phaseName.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${slug}`
    const branch = `phase-run/${phaseName}/${slug}`
    return agent(implementPrompt(group, worktreePath, branch, tip), {
      schema: SLICE_RESULT_SCHEMA,
      label: `impl:${ids.join('+')}`,
      phase: 'Implement',
    })
  }))).filter(Boolean)

  waveResults.push(results)
  const ok = results.filter(r => r.ok)
  log(`Wave ${w + 1}: ${ok.length}/${groups.length} ok`)
  for (const r of results) {
    if ((r.undeclaredFiles ?? []).length > 0) {
      log(`⚠ ${r.sliceId} edited undeclared files: ${r.undeclaredFiles.join(', ')}`)
    }
  }

  if (ok.length === 0) {
    return { stopped: 'WAVE_TOTAL_FAILURE', wave: w + 1, waveResults }
  }

  phase('Integrate')
  const integ = await safeAgent(integratePrompt(w + 1, ok), {
    schema: INTEGRATE_RESULT_SCHEMA, label: `integrate:W${w + 1}`, phase: 'Integrate',
  })
  integrations.push(integ)
  if (!integ?.ok || !integ.tipSha) {
    return { stopped: 'INTEGRATE_FAILED', wave: w + 1, waveResults, integrations }
  }
  tip = integ.tipSha
  log(`Wave ${w + 1} integrated → ${tip.slice(0, 8)} (merged ${integ.merged.length}, failed ${integ.failed.length})`)
}

// ---- Verify: an independent agent re-runs every done-criterion --------------
phase('Verify')

const blockingOf = v => (v?.results ?? []).filter(r => !r.passed && !(r.failureDetail ?? '').startsWith('ENV:'))

let verify = await safeAgent(verifyPrompt(tip, 'verify'), {
  schema: VERIFY_RESULT_SCHEMA, label: 'verify', phase: 'Verify',
})
const repairs = []
for (let round = 0; round < 2; round++) {
  if (!verify || blockingOf(verify).length === 0) break
  log(`Verify round ${round + 1} failed — repairing`)
  const repair = await safeAgent(repairPrompt(verify, tip), {
    schema: SLICE_RESULT_SCHEMA, label: `repair:${round + 1}`, phase: 'Verify',
  })
  repairs.push(repair)
  if (!repair?.ok) break
  tip = repair.commitSha ?? tip
  verify = await safeAgent(verifyPrompt(tip, `verify:${round + 2}`), {
    schema: VERIFY_RESULT_SCHEMA, label: `verify:${round + 2}`, phase: 'Verify',
  })
}

if (!verify || blockingOf(verify).length > 0) {
  return {
    stopped: 'VERIFY_FAILED',
    reason: 'Local gate did not go green after two repair rounds — escalating rather than opening a PR.',
    waveResults, integrations, verify, repairs,
  }
}
log('Verify green (ENV-only failures tolerated).')

// ---- PR ---------------------------------------------------------------------
phase('Review')
const pr = await safeAgent(openPrPrompt(), { schema: PR_RESULT_SCHEMA, label: 'open-pr', phase: 'Review' })
if (!pr?.ok || !pr.prNumber) {
  return { stopped: 'PR_FAILED', waveResults, integrations, verify, pr }
}
log(`PR #${pr.prNumber}: ${pr.prUrl}`)
const prCtx = { prNumber: pr.prNumber, prUrl: pr.prUrl, branch: integrationBranch }

// ---- Dual review ------------------------------------------------------------
const [general, corpusRev] = await parallel([
  () => agent(codeReviewPrompt(prCtx), { schema: REVIEW_FINDINGS_SCHEMA, label: 'review:general', phase: 'Review' }),
  () => agent(corpusReviewPrompt(prCtx), {
    agentType: 'feature-dev:code-reviewer',
    schema: REVIEW_FINDINGS_SCHEMA, label: 'review:corpus', phase: 'Review',
  }),
])
const findings = dedupeFindings(general?.findings ?? [], corpusRev?.findings ?? [])
const high = findings.filter(f => f.severity === 'HIGH')
log(`Review: ${findings.length} deduped findings (${high.length} HIGH)`)

// ---- Adopt, then re-verify --------------------------------------------------
phase('Adopt')
let adoption = { adopted: [], dismissed: [], failed: [] }
if (findings.some(isActionable)) {
  adoption = (await safeAgent(adoptPrompt(prCtx, findings), {
    schema: ADOPT_RESULT_SCHEMA, label: 'adopt', phase: 'Adopt',
  })) ?? adoption
  log(`Adopt: ${adoption.adopted.length} adopted, ${adoption.dismissed.length} dismissed, ${adoption.failed.length} failed`)

  // A fix is not a fix until the gate agrees.
  const reVerify = await safeAgent(verifyPrompt(adoption.headSha ?? tip, 'post-adopt'), {
    schema: VERIFY_RESULT_SCHEMA, label: 'verify:post-adopt', phase: 'Adopt',
  })
  if (!reVerify || blockingOf(reVerify).length > 0) {
    return {
      stopped: 'POST_ADOPT_VERIFY_FAILED',
      reason: 'Adopting review findings broke the local gate — escalating rather than merging.',
      prUrl: pr.prUrl, findings, adoption, reVerify,
    }
  }
} else {
  log('No actionable findings.')
}

// ---- CI + merge --------------------------------------------------------------
phase('Ship')
let ci = await safeAgent(ciWaitPrompt(pr.prNumber), { schema: CI_WAIT_RESULT_SCHEMA, label: 'ci-wait', phase: 'Ship' })
const ciRepairs = []
for (let round = 0; round < 2; round++) {
  if (ci?.state !== 'RED') break
  log(`CI RED (${(ci.failedChecks ?? []).join(', ')}) — repair ${round + 1}`)
  const r = await safeAgent(ciRepairPrompt(pr.prNumber, ci.failedChecks ?? []), {
    schema: SLICE_RESULT_SCHEMA, label: `ci-repair:${round + 1}`, phase: 'Ship',
  })
  ciRepairs.push(r)
  if (!r?.ok) break
  ci = await safeAgent(ciWaitPrompt(pr.prNumber), {
    schema: CI_WAIT_RESULT_SCHEMA, label: `ci-wait:${round + 2}`, phase: 'Ship',
  })
}
if (ci?.state !== 'GREEN') {
  return {
    stopped: 'CI_NOT_GREEN', state: ci?.state ?? 'UNKNOWN', failedChecks: ci?.failedChecks ?? [],
    prUrl: pr.prUrl, findings, adoption, ciRepairs,
  }
}

const merge = await safeAgent(mergePrompt(pr.prNumber), { schema: MERGE_RESULT_SCHEMA, label: 'merge', phase: 'Ship' })

return {
  phase: phaseName,
  prNumber: pr.prNumber,
  prUrl: pr.prUrl,
  merged: merge?.state === 'MERGED',
  mergeState: merge?.state ?? 'UNKNOWN',
  mergeCommit: merge?.mergeCommit,
  waves: waves.map(w => w.map(g => g.map(s => s.id).join('+'))),
  slices: waveResults.flat().map(r => ({ sliceId: r.sliceId, ok: r.ok, undeclaredFiles: r.undeclaredFiles ?? [], notes: r.notes })),
  integrateFailures: integrations.flatMap(i => i?.failed ?? []),
  verify,
  repairs: repairs.filter(Boolean).length,
  findings: {
    total: findings.length,
    high: high.length,
    adopted: adoption.adopted.length,
    dismissed: adoption.dismissed.length,
    failed: adoption.failed.length,
  },
  ciRepairs: ciRepairs.filter(Boolean).length,
  tsIso,
}

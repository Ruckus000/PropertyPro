// Ship an approved plan — one or many phases — end to end, unattended.
//
// Per phase: capture a restore point → derive waves from declared file
// ownership → implement in parallel → integrate → verify independently →
// adversarially diagnose anything red → apply a migration through the ladder →
// PR → dual review + security + two-perspective lenses → adjudicate findings →
// adopt only what survives → CI → merge → confirm production is healthy.
//
// Design commitments, each of which came from something going wrong:
//
//   1. Waves are DERIVED from `ownedFiles`, never grouped by hand. An
//      integration conflict then means one thing: a slice touched a file it did
//      not declare.
//   2. Verification is done by an agent that did NOT write the code. Every
//      defect in Phase 11b-1 was found by a reader, none by a test; a builder
//      grading its own homework is worthless.
//   3. Anything red gets ADVERSARIALLY DIAGNOSED before it gets fixed. A retry
//      loop thrashes on a misdiagnosed symptom, and can go green by hiding the
//      fault. See .claude/phase-run/bug-protocol.md.
//   4. Nothing is deleted until production is confirmed healthy, and every
//      phase captures a verified restore point first. See recovery.md.
//   5. Irreversible operations are REFUSED, not carefully handled.
//
// Sandbox: no filesystem, no clock, no RNG, no imports, meta is a pure literal.

export const meta = {
  name: 'phase-run',
  description: 'Ship an approved multi-phase plan unattended: restore point → waves → verify → adversarial diagnosis → review → merge → production health check',
  whenToUse: 'Invoked by the /phase-run skill after a human has approved the intake report.',
  phases: [
    { title: 'Safety' },
    { title: 'Implement' },
    { title: 'Integrate' },
    { title: 'Verify' },
    { title: 'Migrate' },
    { title: 'Review' },
    { title: 'Adopt' },
    { title: 'Ship' },
    { title: 'Health' },
  ],
}

const A = typeof args === 'string' ? JSON.parse(args) : args
const {
  repoRoot,
  integrationWorktreeRoot,
  baseSha,
  tsIso,
  planPath,
  corpus,
  bugProtocol,
  recovery,
  phases,
  stateDir,
} = A

log(`phase-run: ${phases.length} phase(s) — ${phases.map(p => p.phaseName).join(' → ')}`)

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
    checklistNotes: { type: 'string' },
    commandsRun: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'passed'],
        properties: { command: { type: 'string' }, passed: { type: 'boolean' }, summary: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
    reason: { type: 'string' },
  },
}

const RESTORE_POINT_SCHEMA = {
  type: 'object',
  required: ['ok', 'git'],
  properties: {
    ok: { type: 'boolean' },
    git: {
      type: 'object',
      properties: { mainSha: { type: 'string' }, mainSubject: { type: 'string' } },
    },
    deploy: {
      type: 'object',
      properties: { liveDeploymentId: { type: 'string' }, liveDeploymentSha: { type: 'string' }, note: { type: 'string' } },
    },
    db: {
      type: 'object',
      properties: {
        ledgerTipId: { type: 'string' },
        ledgerTipCreatedAt: { type: 'string' },
        migrationFileCount: { type: 'integer' },
        publicTableCount: { type: 'integer' },
        advisorErrors: { type: 'integer' },
        note: { type: 'string' },
      },
    },
    runbookVerified: { type: 'boolean' },
    runbook: { type: 'string' },
    statePath: { type: 'string' },
    reason: { type: 'string' },
  },
}

// The slice spec has to exist ON DISK, not only as workflow arguments. See
// specPersistPrompt for why.
const SPEC_WRITE_SCHEMA = {
  type: 'object',
  required: ['ok', 'specPath', 'criteriaTotal', 'untraceable'],
  properties: {
    ok: { type: 'boolean' },
    specPath: { type: 'string' },
    criteriaTotal: { type: 'integer' },
    // Criteria whose text does not appear in the plan. Each must be marked
    // `derived: true` with a reason, or the run stops before writing any code.
    untraceable: {
      type: 'array',
      items: {
        type: 'object',
        required: ['owner', 'command'],
        properties: {
          owner: { type: 'string' },
          command: { type: 'string' },
          resolution: { enum: ['MARKED_DERIVED', 'UNRESOLVED'] },
          note: { type: 'string' },
        },
      },
    },
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
    undeclaredEdits: { type: 'array', items: { type: 'string' } },
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

// The adversarial loop's output: findings already sorted into confirmed and
// refuted, with the reasoning attached. That sorting is the entire value.
const DIAGNOSIS_SCHEMA = {
  type: 'object',
  required: ['rootCause', 'confirmed', 'refuted'],
  properties: {
    rootCause: { type: 'string' },
    rounds: { type: 'integer' },
    confirmed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'evidence', 'fix'],
        properties: {
          finding: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          severity: { enum: ['HIGH', 'MEDIUM', 'LOW'] },
        },
      },
    },
    refuted: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'defence'],
        properties: { finding: { type: 'string' }, defence: { type: 'string' } },
      },
    },
    needsHuman: { type: 'boolean' },
    needsHumanReason: { type: 'string' },
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
          lens: { type: 'string' },
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
    checklistNotes: { type: 'string' },
    headSha: { type: 'string' },
  },
}

const MIGRATION_RESULT_SCHEMA = {
  type: 'object',
  required: ['ok', 'stage'],
  properties: {
    ok: { type: 'boolean' },
    stage: { enum: ['LOCAL', 'REHEARSED', 'APPLIED', 'VERIFIED', 'ROLLED_BACK', 'REFUSED'] },
    ledgerId: { type: 'string' },
    expectMismatches: { type: 'array', items: { type: 'string' } },
    advisorErrorsAfter: { type: 'integer' },
    reason: { type: 'string' },
    notes: { type: 'string' },
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
    failureLog: { type: 'string' },
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

const HEALTH_SCHEMA = {
  type: 'object',
  required: ['healthy', 'checks'],
  properties: {
    healthy: { type: 'boolean' },
    deployReachedProd: { type: 'boolean' },
    liveDeploymentSha: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'passed', 'evidence'],
        properties: { name: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } },
      },
    },
    advisorErrors: { type: 'integer' },
    newErrorClasses: { type: 'array', items: { type: 'string' } },
    recommendation: { enum: ['CONTINUE', 'ROLLBACK', 'ESCALATE'] },
    reason: { type: 'string' },
  },
}

const ROLLBACK_SCHEMA = {
  type: 'object',
  required: ['ok', 'method'],
  properties: {
    ok: { type: 'boolean' },
    method: { enum: ['VERCEL_INSTANT_ROLLBACK', 'GIT_REVERT_PR', 'NONE_NEEDED', 'FAILED'] },
    evidence: { type: 'string' },
    reason: { type: 'string' },
  },
}

async function safeAgent(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log(`agent ${opts?.label ?? '(unlabeled)'} dropped/failed: ${e?.message ?? e}`)
    return null
  }
}

// ============================================================ wave derivation

// Topological levels by `dependsOn`, then union-find on shared `ownedFiles`.
// Slices at the same level that share ANY file become one agent — that is what
// makes the integration merges conflict-free by construction rather than by luck.
function deriveWaves(slices) {
  const byId = new Map(slices.map(s => [s.id, s]))
  const level = new Map(slices.map(s => [s.id, 0]))
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
    if (!here.length) continue
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

// ==================================================================== prompts

const SO = `**You MUST end your turn by calling the StructuredOutput tool**, even on failure and even
with nothing to report. A turn that ends without it is dropped as null and wastes the work.`

const NO_LOCAL_DISK = branch => `## CRITICAL: do NOT read files from local disk
The working tree has moved on and is not what you are reviewing. Read the code under review ONLY
through \`gh pr diff <n>\`, \`gh pr diff <n> --name-only\`, and \`git show "origin/${branch}:<path>"\`.
A finding based on a stale local file is a false positive that wastes an adjudication cycle.`

const fmt = cmds => (cmds ?? []).map(c => {
  const cmd = typeof c === 'string' ? c : c.command
  const exp = typeof c === 'object' && c.expect ? ` — expect: ${c.expect}` : ''
  return `- \`${cmd}\`${exp}`
}).join('\n')

function restorePointPrompt(ph) {
  return `Capture and VERIFY a restore point before phase ${ph.phaseName} changes anything.

${recovery}

## Capture, by reading the real thing — never assume a value
\`\`\`bash
cd ${repoRoot} && git fetch origin --quiet
git rev-parse origin/main && git log -1 --format=%s origin/main
\`\`\`
- **Deploy**: the CURRENT production deployment id and the commit it was built from. Use whatever
  Vercel access is available (\`vercel\` CLI or the Vercel MCP tools). If you genuinely cannot read
  it, set \`deploy.note\` saying so — do NOT invent an id, because a fabricated rollback target is
  worse than an absent one.
- **DB**: ledger tip id + created_at, migration file count on disk, public table count, and the
  CURRENT count of ERROR-level advisor lints as a BASELINE. Read-only queries only. If the phase
  declares no migration, a note saying "not captured — no migration this phase" is acceptable for
  the table/advisor fields, but capture the ledger tip regardless.
${ph.migration ? `\n  This phase DOES declare migration ${ph.migration.number} (${ph.migration.class}) — capture the full DB block.\n` : ''}

## Write it
\`${stateDir}/${ph.phaseName}-restore.json\`, outside the repo on purpose. Also echo the JSON so it
survives a lost file.

## Write the runbook, then VERIFY it
Fill the recovery table above with the real captured values — an actual deployment id, an actual
SHA. Then prove the git path works:
\`\`\`bash
cd ${repoRoot} && git revert --no-commit HEAD && git revert --abort
\`\`\`
(a clean apply/abort against the current tip). Set \`runbookVerified\` honestly. **An unverified
rollback plan is a guess you will be relying on under time pressure.**

${SO}`
}

function specPath(ph) {
  return `${stateDir}/${ph.phaseName}-spec.json`
}

function specPersistPrompt(ph) {
  return `Persist the slice spec for phase ${ph.phaseName} to disk, and check every criterion is
traceable to the plan. Do this BEFORE any code is written.

## Why this exists — it cost phase 11b-3 two repair rounds
The verify gate executes the criteria in this spec. Until now the spec lived ONLY as workflow
arguments, nowhere on disk, and the plan was passed to agents merely as a path to read. So when a
repair round decided a criterion was unsatisfiable and amended the plan, **the gate kept executing
the frozen argument string.** On 11b-3 the executed criterion was a paraphrase matching neither the
plan's original wording nor either replacement; it re-fired identically every round, and its only
available "fix" was deleting a load-bearing line in the phase's one write-path file.

Two properties follow, and both matter more than the file itself:
- A repair round now has **a real file to correct**. Amending the plan alone is not enough and never was.
- A criterion must be **traceable to the plan**, so a gate cannot be quietly weakened in an
  in-memory spec — any weakening has to appear in the plan, which is committed and reviewable.

## Write it
\`${specPath(ph)}\` (beside the restore point, outside the repo on purpose):
\`\`\`json
${JSON.stringify({
  phaseName: ph.phaseName,
  planPath,
  verifyCommands: ph.verifyCommands ?? [],
  spotChecks: ph.spotChecks ?? [],
  slices: (ph.slices ?? []).map(s => ({ id: s.id, doneCriteria: s.doneCriteria ?? [] })),
}, null, 2)}
\`\`\`

## Then check traceability, before returning
Read the plan at \`${planPath}\`. For EVERY criterion above — each slice's \`doneCriteria\`, every
\`verifyCommands\` entry, every \`spotChecks\` entry — decide whether its command text appears in the
plan. Compare on **normalised** text: collapse runs of whitespace, ignore surrounding markdown
backticks and list markers. A criterion that is a paraphrase of something in the plan **does not
count as traceable** — that paraphrase is precisely the 11b-3 defect.

For each untraceable criterion, choose ONE:
- It is a genuine convenience the plan does not state (a shell wrapper, a path expansion). Add
  \`"derived": true\` and a one-line \`"derivedReason"\` to that criterion object in the spec file,
  and report it with \`resolution: "MARKED_DERIVED"\`.
- It is a real drift between plan and spec. Report it with \`resolution: "UNRESOLVED"\` and DO NOT
  invent a fix — the run will stop and a human will reconcile them. **Do not edit the plan to match
  the spec.** The plan is the source of truth; making the plan agree with a paraphrase is how the
  paraphrase becomes permanent.

Be strict. A criterion you wave through here is one the gate will execute unexamined for the whole run.

## Return
\`ok\` (false only if you could not write the file), \`specPath\`, \`criteriaTotal\` (every criterion
across slices + verifyCommands + spotChecks), and \`untraceable\` (one entry per criterion, with its
resolution). Report an empty \`untraceable\` only if every single criterion really did appear in the
plan.
${SO}`
}

function implementPrompt(ph, group, worktreePath, branch, fromSha) {
  const ids = group.map(s => s.id)
  const owned = [...new Set(group.flatMap(s => s.ownedFiles ?? []))]
  return `Implement slice(s) **${ids.join(', ')}** of phase ${ph.phaseName}.

The plan is normative and its **Decision Ledger answers every product question**:
\`\`\`
${planPath}
\`\`\`
If you want to ask the user something, the answer is in the ledger. If you disagree with a ledger
entry, **implement it as written and record the objection in \`notes\`** — do not deviate, do not stop.

## Workspace
\`\`\`bash
cd ${repoRoot}
git worktree add ${worktreePath} ${fromSha} -b ${branch}
cd ${worktreePath}
pnpm install --silent
pnpm --filter "@propertypro/*" --filter "!@propertypro/web" --filter "!@propertypro/admin" build
\`\`\`
That last build is not optional — a fresh worktree has unbuilt workspace packages and \`pnpm test\`
reports ~269 bogus resolution failures without it.

Work ONLY inside \`${worktreePath}\`. Sibling worktrees are other agents working concurrently.

## File ownership — this is what keeps the parallel waves safe
You own exactly:
${owned.map(f => `- \`${f}\``).join('\n')}

Do not edit anything else. If you truly must, edit it AND list it in \`undeclaredFiles\` — a
declared exception is recoverable, a silent one corrupts the run.

${group.map(s => `## ${s.id} — ${s.title}  [blast: ${s.blast}]\n${s.scope}\n\n**Done-criteria — run each, report real output:**\n${fmt(s.doneCriteria)}`).join('\n\n---\n\n')}

---

${bugProtocol}

**Walk the verification checklist above before you finish and report the result per item in
\`checklistNotes\`.** Consider every non-trivial decision from BOTH the DevOps and the chaos
engineer's perspective and say which lens drove it.

---

${corpus}

## Commit and push
Conventional commits scoped to the phase. Then **push the branch**:
\`git push -u origin ${branch}\` — so the work survives even if the worktree is lost. Do NOT open a
PR and do NOT merge; the runner does that.

## Return
\`ok\`, \`sliceId: "${ids.join('+')}"\`, \`branch\`, \`worktreePath\`, \`commitSha\`, \`filesChanged\`,
\`undeclaredFiles\`, \`commandsRun\` (never report a command you did not run), \`checklistNotes\`,
\`notes\`. On failure \`ok:false\` + \`reason\`.
${SO}`
}

function integratePrompt(ph, waveIndex, results) {
  return `Integrate wave ${waveIndex} of phase ${ph.phaseName}.

Integration worktree: \`${ph.integrationWorktree}\`   Branch: \`${ph.integrationBranch}\`
\`\`\`json
${JSON.stringify(results.map(r => ({ sliceId: r.sliceId, branch: r.branch, worktreePath: r.worktreePath, filesChanged: r.filesChanged, undeclaredFiles: r.undeclaredFiles, notes: r.notes })), null, 2)}
\`\`\`

\`\`\`bash
cd ${ph.integrationWorktree}
git status --porcelain     # must be empty; if not, STOP, ok:false
\`\`\`
Then per branch, in order: \`git merge --no-ff <branch> -m "merge(${ph.phaseName}): <sliceId>"\`.

Waves are DERIVED so everything here owns a disjoint file set. **A conflict means a slice edited a
file it did not declare.** On conflict: \`git merge --abort\`, record it in \`failed\` with the
conflicting paths, continue with the rest. Do NOT hand-resolve — that hides a broken ownership map.

Collect every slice's \`undeclaredFiles\` into \`undeclaredEdits\`.

Sanity-check it compiles: \`pnpm --filter @propertypro/web exec tsc --noEmit\`. Do not fix failures —
Verify owns that. Report the summary.

**Do NOT remove any worktree and do NOT delete any branch.** Nothing is cleaned up until production
is confirmed healthy. A merged slice's worktree is the only copy of its reasoning.

Return \`ok\`, \`tipSha\`, \`merged\`, \`failed\`, \`undeclaredEdits\`.
${SO}`
}

function verifyPrompt(ph, tipSha) {
  const mig = ph.migration
    ? `## Migration \`expect\` block — ${ph.migration.number} (${ph.migration.class})
Assert against the LOCAL disposable DB only. **Never production.** Any mismatch is a failed command.
\`\`\`json
${JSON.stringify(ph.migration.expect ?? {}, null, 2)}
\`\`\``
    : `## Migration
This phase ships NONE. Assert it mechanically:
\`git diff --name-only origin/main...HEAD -- packages/db/migrations packages/db/src/schema | wc -l\` = **0**.`

  return `You are the VERIFY gate for phase ${ph.phaseName}. You did not write this code. Re-run the
sweep independently and report **what actually happened**, not what should have.

\`\`\`bash
cd ${ph.integrationWorktree}
pnpm install --silent
pnpm --filter "@propertypro/*" --filter "!@propertypro/web" --filter "!@propertypro/admin" build
git log --oneline -1        # expect ${tipSha.slice(0, 8)}
git status --porcelain      # expect empty, before AND after install
\`\`\`
Read-only apart from running commands. Fix nothing. Commit nothing.

${mig}

## FIRST — read the criteria from disk, not from this prompt

\`\`\`bash
cat ${specPath(ph)}
\`\`\`

**That file is authoritative. This prompt is not.** Execute the \`verifyCommands\` and \`spotChecks\`
it contains, as they read RIGHT NOW. The listing further down is only what they were at run start,
kept so you can see whether anything changed.

This indirection is the fix for a real defect: on phase 11b-3 the criteria existed only as workflow
arguments, so a repair round that retired an unsatisfiable criterion in the plan could not reach the
gate, and the gate re-fired the retired command verbatim on the next round — a command no correct
implementation could satisfy, whose only available "fix" was a regression in production code.

If the spec file is **missing or unparseable**, report a single failing command named
\`spec-file-missing\` and stop. Do NOT fall back to the listing below: falling back is exactly the
frozen-argument behaviour this exists to prevent.

## SECOND — reject any criterion that is not traceable to the plan

For each criterion in the spec file, before running it: unless it carries \`"derived": true\`, its
command text must appear in the plan at \`${planPath}\` (normalised — collapse whitespace, ignore
markdown backticks and list markers). A criterion that is a *paraphrase* of the plan is NOT
traceable.

Report every untraceable criterion as a **failing** command named \`stale-criterion:<owner>\`, with
\`failureDetail\` giving the exact criterion text and the plan path, and **do not execute it**. A
retired criterion that keeps running cannot go green by any correct implementation; it thrashes for
every remaining round and pressures the next repair agent into a regression to satisfy it.

## THIRD — run every criterion from the spec file, in order, and READ the output

As of run start these were:
${fmt(ph.verifyCommands)}

${(ph.spotChecks ?? []).length ? `Spot-checks — criteria a green suite cannot prove:\n${fmt(ph.spotChecks)}` : ''}

## Then ask, as a chaos engineer would
Pick the two most load-bearing new tests and ask: **would this still pass if the code did nothing?**
If yes, that is a failed verification, not a passed one — report it as a failing command named
\`tautological-test:<file>\`.

${corpus}

## Return
\`allPassed\` (true only if EVERY command passed), \`results\` (per command, with \`evidence\` = the
actual key line of output), \`slicesFailing\`.

**Report faithfully — a false green here defeats the entire gate.** A command you could not RUN is
\`passed: false\` with \`failureDetail\` starting \`ENV:\`; those are tolerated and distinguished from
real failures. Never mark an unrun command passed.
${SO}`
}

function diagnosePrompt(ph, failure, context) {
  return `Phase ${ph.phaseName} has a failure. **Diagnose it adversarially. Do NOT fix anything.**

## The failure
\`\`\`json
${JSON.stringify(failure, null, 2)}
\`\`\`
Context: ${context}
Workspace: \`${ph.integrationWorktree}\` (read it; you may run commands, but change no file)

${bugProtocol}

## How to run this alone
You are playing BOTH roles. Do it honestly — the value comes entirely from the defender being
genuinely hard to satisfy, and a debate you throw is worse than no debate because it launders a
guess into a "confirmed" finding.

1. As the **critic**, state the findings with file:line evidence. Root causes, not symptoms.
2. As the **defender**, answer each one. Cite the plan's Decision Ledger (\`${planPath}\`) where a
   "finding" objects to a decision made deliberately — that is a REFUTED finding, not work.
3. Go another round only where there is a genuinely new point. Cap 5.
4. Sort: **CONCEDED → \`confirmed\`. REFUTED → \`refuted\`, with the defence recorded** — a refuted
   finding is a fact about this code the next agent needs.

## Consider that the CRITERION may be the defect, not the code
Before concluding the code is wrong, ask whether the failing check could pass at all. A criterion is
the defect when it cannot be satisfied by any correct implementation — a negative grep for a token
that also occurs in load-bearing code, an absence check on a file that does not exist yet, a
quoting bug that errors regardless of input, or a criterion asserting something a *later* slice owns.

The tell: **"what is the smallest change that turns this green, and is that change a regression?"**
If the only way through is deleting or weakening real code, the criterion is wrong. Say so in
\`rootCause\` and put the corrected criterion in the finding's \`fix\` — a criterion the repair agent
must retire in BOTH the plan and the spec file (\`${specPath(ph)}\`). This is not a licence to soften
a check that is doing its job; a criterion that is merely *hard* to satisfy is work, not a defect.

Set \`needsHuman: true\` only if the fix would require an irreversible operation, a credential, or a
decision that changes WHAT gets built rather than how. "This is hard" is not one of those.

## Return
\`rootCause\` (one paragraph, the actual cause), \`rounds\`, \`confirmed\` (each with \`fix\`),
\`refuted\`, \`needsHuman\`.
${SO}`
}

function repairPrompt(ph, diagnosis, tipSha) {
  return `Implement the confirmed fixes for phase ${ph.phaseName}. The diagnosis is done — do not
re-litigate it.

\`\`\`bash
cd ${ph.integrationWorktree}
git log --oneline -3        # tip ${tipSha.slice(0, 8)}
\`\`\`
Work on \`${ph.integrationBranch}\` here and commit.

## Root cause
${diagnosis.rootCause}

## Confirmed — fix these
\`\`\`json
${JSON.stringify(diagnosis.confirmed, null, 2)}
\`\`\`

## Refuted — do NOT "fix" these
\`\`\`json
${JSON.stringify(diagnosis.refuted, null, 2)}
\`\`\`
These survived a defence. Acting on one undoes a deliberate decision.

## Rules
- Fix the cause. **Never delete or skip a failing test, and never loosen an assertion that is
  catching a real fault** — going green by hiding the fault is the failure mode this whole protocol
  exists to prevent.
- \`ENV:\`-prefixed failures are environmental and not yours.
- Every new test must **fail when your fix is reverted**. Check that; a test that passes either way
  is not a test.

## Retiring or amending a criterion — BOTH files, or it does not take effect
If the diagnosis found the CRITERION to be the defect, correcting the plan is **necessary and not
sufficient**. The gate reads \`${specPath(ph)}\`, not the plan. Edit **both**:

1. \`${planPath}\` — the source of truth, and what the traceability check validates against.
2. \`${specPath(ph)}\` — what the next verify round actually executes.

The replacement must appear in the plan **verbatim as you write it into the spec**, not paraphrased.
A paraphrase fails the traceability check and is rejected as \`stale-criterion\` — which is the same
class of defect as the one you are fixing.

Then state, in \`notes\`: the retired criterion, the replacement, and **why the replacement is
strictly stronger rather than merely satisfiable.** A replacement that is easier to pass is a
weakened gate wearing a fix's clothing. Verify the replacement is RED before your fix and GREEN
after — a criterion validated only as "red today" can still be one that rewards the wrong change,
which is exactly how 11b-3's criterion came to demand a regression.

**Walk the verification checklist and report it per item in \`checklistNotes\`.**

${bugProtocol}

${corpus}

Return the slice-result shape with \`sliceId: "repair"\`.
${SO}`
}

function migrationPrompt(ph) {
  const m = ph.migration
  return `Apply migration ${m.number} (${m.class}) for phase ${ph.phaseName} through the ladder.
**Every rung fully before the next. Any mismatch → roll back and stop. Never improvise against
production.**

${recovery}

## Class
${m.class} — ${m.classRationale ?? ''}
${m.class === 'REVERSIBLE_CONTRACT' ? 'Reversible: no data is lost and every statement is recreatable from the repo schema. State the exact inverse statement BEFORE applying, and put it in `notes`.' : 'Expand-only: additive, and safe to apply before the code that needs it ships.'}

## Statements
\`\`\`sql
${(m.statements ?? []).join('\n')}
\`\`\`

## expect block
\`\`\`json
${JSON.stringify(m.expect ?? {}, null, 2)}
\`\`\`

## The ladder
1. **Local disposable DB** — \`pnpm db:test-local:reset\` then \`pnpm test:integration:local\`.
   Assert the expect block here first. Stop on any failure.
2. **Prod rehearsal, committing nothing** — run the statements plus the expect probes inside a
   self-aborting \`DO\` block (\`RAISE EXCEPTION\` at the end, carrying the results out in the
   message). This is the cheapest real proof against production and it leaves zero residue.
3. **Apply** via the Supabase MCP \`apply_migration\`, in statement order.
4. **Verify against the expect block** using \`information_schema\` / \`pg_catalog\`.
   **Any mismatch → immediately reverse the statements** (you stated the inverse in step 1),
   return \`stage: "ROLLED_BACK"\`, and stop. Do not attempt a second apply.
5. **Reconcile the ledger** — \`hash\` = \`shasum -a 256 <migration file>\`,
   \`created_at\` = the journal \`when\` (NOT wall-clock). Check
   \`supabase_migrations.schema_migrations\` first for applies you did not make; two sessions
   against one prod is a live hazard here.
6. **\`get_advisors\`** must show **no NEW ERROR-level lint** versus the captured baseline.

## Refusals
If any statement is a \`DROP COLUMN\`, \`DROP TABLE\`, or non-idempotent DML, **stop immediately**
with \`stage: "REFUSED"\`. Nothing can undo those; PITR is a whole-project rollback, not an undo.
Do not apply the safe statements and leave the rest — return REFUSED for the whole migration.

## Return
\`ok\`, \`stage\`, \`ledgerId\`, \`expectMismatches\`, \`advisorErrorsAfter\`, \`notes\` (including the
inverse statements).
${SO}`
}

function openPrPrompt(ph) {
  return `Open the pull request for phase ${ph.phaseName}.

\`\`\`bash
cd ${ph.integrationWorktree}
git status --porcelain            # must be empty
git log --oneline origin/main..HEAD
git push -u origin ${ph.integrationBranch}
\`\`\`

Read \`${planPath}\` and write the body from it — do not invent scope. Draft below; correct anything
it gets wrong against the real diff, and keep the test-plan checklist **honest** — tick only what
the Verify gate actually ran.

\`\`\`markdown
${ph.prBody}
\`\`\`

\`gh pr create --base main --head ${ph.integrationBranch} --title "${ph.prTitle}" --body "$(cat <<'PRBODY'
<corrected body>
PRBODY
)"\`

Return \`ok\`, \`prNumber\`, \`prUrl\`.
${SO}`
}

function generalReviewPrompt(ph, pr) {
  return `Review PR #${pr.prNumber} (${pr.prUrl}) — phase ${ph.phaseName}. You are the GENERAL
CORRECTNESS reviewer. Separate agents cover this repo's conventions and security; do not duplicate.

Use \`/code-review --effort high\` if available.

${NO_LOCAL_DISK(ph.integrationBranch)}

## The plan is the spec
\`${planPath}\`. A **deviation** from its Decision Ledger is a finding; **disagreeing** with a ledger
entry is not.

## Look for
- Logic errors, inverted conditions, off-by-one, wrong branch order.
- Anything changing which requests reach which handler — in this codebase a request that previously
  reached the authenticated app and now does not is a user-facing outage, the highest severity class.
- Authorization and visibility: can an unauthenticated caller reach something new? Is a privilege
  flag derived from anything the caller controls?
- Tenancy: is every new query community-scoped?
- Behaviour the plan says must be UNCHANGED that the diff changes anyway.
- Tests that would pass whether or not the code works.

## Severity
HIGH: a user sees the wrong thing, a boundary is crossed, a live URL breaks, working functionality
stops. MEDIUM: real defect with a narrow trigger, missing test for a stated criterion. LOW: style.

Set \`lens: "correctness"\`, \`isCoverageExpansion\` for pure "add a test" findings, and \`sliceId\`
where attributable.
${SO}`
}

function corpusReviewPrompt(ph, pr) {
  return `Review PR #${pr.prNumber} (${pr.prUrl}) against THIS CODEBASE's conventions and history.

${NO_LOCAL_DISK(ph.integrationBranch)}

Plan: \`${planPath}\` — its Decision Ledger is normative.

${corpus}

Every numbered item above is a lens; walk the diff against each. The "Review lenses" section is
ranked by how often each has caught something real here — start there. Weight **tests that pass for
the wrong reason** highest: it is the most common real finding on this programme, and a green suite
is not evidence against it.

Severity as usual. Set \`lens: "corpus"\`.
${SO}`
}

function opsReviewPrompt(ph, pr) {
  return `Review PR #${pr.prNumber} (${pr.prUrl}) — phase ${ph.phaseName} — from **two operational
perspectives**. This PR merges to main and deploys to production automatically, with no human
reading it first. That is the standard you are reviewing against.

${NO_LOCAL_DISK(ph.integrationBranch)}

${bugProtocol}

## Your two lenses
Use the DevOps and chaos-engineer question lists in the protocol above. Concretely, for this diff:

**DevOps** — How is this undone? What is the blast radius if it is wrong: one page, one tenant, or
everyone? Is anything here a manual step rather than something reproducible from version control?
Would a failure be *visible*? Does the ordering survive a deploy (expand before contract)? What does
it cost — bundle size, query count, build time?

**Chaos** — What is the steady state and how would we know it broke? What if this half-succeeds —
migration applied but code not deployed, one of two writes landing? What if nobody notices for a
week: what does the data look like by then? Is it idempotent — what breaks if it runs twice, or
concurrently? What is the SILENT failure mode? A 500 gets noticed; a wrong-but-200 does not, and
this codebase has shipped exactly that before (a colour token that emitted zero CSS, a publish
button permanently disabled, a search-indexing opt-out that was dead code).

Report a finding for each real answer. Set \`lens: "devops"\` or \`lens: "chaos"\`.
HIGH is reserved for: no way to undo it, a silent failure mode in a user-visible path, or a
half-succeed state that corrupts data.
${SO}`
}

function securityReviewPrompt(ph, pr) {
  return `Security review of PR #${pr.prNumber} (${pr.prUrl}) — phase ${ph.phaseName}.
**This is a mandatory gate, not an advisory pass.** The PR merges and deploys with no human review.

Use \`/security-review\` if available.

${NO_LOCAL_DISK(ph.integrationBranch)}

## Priorities for this codebase, in order
1. **Tenant isolation.** Every tenant query through \`createScopedClient\`; operators from
   \`@propertypro/db/filters\`; any \`@propertypro/db/unsafe\` use carrying a documented
   authorization contract. A client-supplied foreign key that is not validated against the caller's
   community is a cross-tenant path — and with \`ON DELETE CASCADE\` it can be a DESTRUCTIVE one,
   not merely a read.
2. **Broken access control.** Is every route's \`requirePermission\` intact and unweakened? Can an
   anonymous caller reach anything new? **Is any privilege or preview flag derived from something
   the caller controls** — a query param, a header, a cookie value? This exact bug shipped in
   11b-2: \`x-preview\` was stamped from \`?preview=true\` with no auth check, exposing unpublished
   content to anyone.
3. **Data exposure.** Secrets, tokens, keys or PII in a log, an error message, a test fixture, a
   commit message, a PR body, or a client bundle. Any new \`NEXT_PUBLIC_\` variable is public
   forever — is it meant to be?
4. **Injection and validation.** Zod at the boundary; no string-built SQL; no unsanitised HTML.
5. **RLS.** A new tenant table needs policies, FORCE RLS, a write-scope trigger, and the registry
   count bumped. A policy predicate that reads the wrong GUC silently allows everything.
6. **OWASP Top 10** generally: SSRF on any new outbound fetch, misconfiguration, insecure
   deserialization, vulnerable dependency added.

Also confirm the negative: **did this PR touch any security-relevant file it had no business
touching** — middleware, an RLS policy, an auth guard, the scoped-client allowlist, or the runner's
own safety machinery (\`.claude/phase-run/*\`, \`.claude/workflows/phase-run*\`)? Report any such
edit as HIGH regardless of whether it looks correct.

Set \`lens: "security"\`. Any confirmed finding here is HIGH by default; justify anything lower.
${SO}`
}

function adjudicatePrompt(ph, pr, findings) {
  return `Adjudicate the review findings on PR #${pr.prNumber} (phase ${ph.phaseName})
**adversarially, before anything is changed.**

Four reviewers ran independently (correctness, corpus, devops/chaos, security). Reviewers
over-report — that is correct behaviour for a reviewer and wrong behaviour for an implementer. Your
job is to sort real from noise **by defending the code**, not by taste.

## Findings
\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`

${bugProtocol}

## Method
Play both roles honestly. For each finding:
1. **Verify it against the actual diff** — \`gh pr diff ${pr.prNumber}\`. A reviewer working from a
   stale local file produces plausible findings about code that is not there. Those are REFUTED
   with \`"false-positive-on-diff-inspection"\`.
2. **Defend the code.** Cite the plan's Decision Ledger (\`${planPath}\`) where a finding objects to
   a decision taken deliberately — REFUTED as \`"contradicts ledger D<n>"\`. Cite the corpus where a
   pattern is a known-good convention.
3. A finding you cannot answer is **CONFIRMED**. Give the concrete fix.

**A security-lens finding needs a much stronger defence than any other lens.** "Unlikely to be
exploited" is not a defence; "the caller cannot reach this path because <file:line>" is.

Coverage-only findings (\`isCoverageExpansion\`) are confirmed only when the missing test covers
something a stated done-criterion claimed.

## Return
\`rootCause\` = a one-paragraph summary of what the review round actually found,
\`confirmed\` (each with \`fix\`), \`refuted\` (each with its \`defence\`), \`needsHuman\`.
${SO}`
}

function adoptPrompt(ph, pr, diagnosis) {
  return `Implement the CONFIRMED review findings on PR #${pr.prNumber} (phase ${ph.phaseName}).

\`\`\`bash
cd ${ph.integrationWorktree}
git status --porcelain     # must be empty
\`\`\`

## Confirmed — implement these
\`\`\`json
${JSON.stringify(diagnosis.confirmed, null, 2)}
\`\`\`

## Refuted — do NOT act on these
\`\`\`json
${JSON.stringify(diagnosis.refuted, null, 2)}
\`\`\`
Each survived a defence. Acting on one undoes a deliberate decision or chases a phantom.

## Rules
- Never weaken or delete a test to make a finding go away.
- Every new test must fail when its fix is reverted.
- Re-run the full local gate afterwards, then \`git push --force-with-lease\`
  (on this phase's own branch only — **never to main**).

**Walk the verification checklist; report per item in \`checklistNotes\`.**

${bugProtocol}

${corpus}

Return \`adopted\`, \`dismissed\`, \`failed\`, \`checklistNotes\`, \`headSha\`.
${SO}`
}

function ciWaitPrompt(pr) {
  return `Wait for CI on PR #${pr.prNumber}.

Poll \`gh pr checks ${pr.prNumber}\` every 90s. Any REQUIRED check failing → \`state: "RED"\` with
\`failedChecks\` **and \`failureLog\`** (pull the actual failing output via
\`gh run view <id> --log-failed\` — the next agent diagnoses from it, and a bare check name is not
enough to diagnose from). All required passing → GREEN. 30-minute cap → TIMEOUT.

Required contexts: Lint, Typecheck, Unit Tests, no-mock-guard, migration-ordering, Build,
integration-tests, perf-check. Vercel checks are auto-skipped via \`ignoreCommand\` — ignore them.

**\`Build\` does not build.** \`perf-check\` owns the only production build and \`Build\` asserts
\`needs.perf-check.result == 'success'\`, so a *skipped* perf-check FAILS Build. Never read a skip
as a pass. Note also that check names contain spaces — match on the full name, not the first token.

Return \`state\`, \`failedChecks\`, \`failureLog\`, \`waitedSeconds\`.
${SO}`
}

function mergePrompt(ph, pr) {
  return `Merge PR #${pr.prNumber} (phase ${ph.phaseName}).

\`\`\`bash
cd ${ph.integrationWorktree}
git fetch origin --quiet
git rebase origin/main
\`\`\`
- Conflict → \`git rebase --abort\`, return \`REBASE_FAILED\` with the paths.
- Clean → \`git push --force-with-lease\` (this branch only, **never main**), then re-wait CI
  (every 90s, max 10 min). Not green → \`CI_FAILED_AFTER_REBASE\`.
- Green → \`gh pr merge ${pr.prNumber} --squash\`, then read back
  \`gh pr view ${pr.prNumber} --json mergeCommit\` → \`MERGED\`.

Auto-merge and \`delete_branch_on_merge\` are both DISABLED here — merge synchronously, and **do not
delete the branch**; retention is deliberate.

Return \`state\`, \`mergeCommit\`, \`reason\`.
${SO}`
}

function healthPrompt(ph, mergeCommit, restore) {
  return `Confirm production is healthy after phase ${ph.phaseName} merged as \`${mergeCommit}\`.

**This step exists because green CI is not evidence that production works, and the failure mode we
are guarding against is not noticing for a week.**

## Restore point captured before this phase
\`\`\`json
${JSON.stringify(restore, null, 2)}
\`\`\`

## Checks
1. **Did the deploy reach production?** \`deploy.yml\` ships \`main\` on CI success. Wait for it
   (poll up to 15 min), then read the LIVE production deployment and compare its commit to
   \`${mergeCommit}\`. A merge is not a deploy. Set \`deployReachedProd\` and \`liveDeploymentSha\`.
2. **Steady state.** Fetch the real production surfaces this phase could affect and confirm they
   respond correctly — the marketing root, a community public site, and an authenticated route
   returning a redirect-to-login rather than a 500. Use the plan's own steady-state claims where it
   states them. Check status codes AND that the body is not an error page behind a 200.
3. **Advisors.** Re-run \`get_advisors\` and compare with the baseline
   (${restore?.db?.advisorErrors ?? 'not captured'}). New ERROR lints are a failure.
4. **Error tracker.** Check Sentry for a NEW issue class since the deploy. Pre-existing noise is not
   this phase's problem; a new class is.

## Verdict
- **CONTINUE** — deploy landed and every check passed.
- **ROLLBACK** — production is broken or degraded. Recommend this decisively; do not diagnose first.
  A healthy production is the right place to debug from.
- **ESCALATE** — you cannot tell (no access, ambiguous signal). Say exactly what you could not read.
  **Ambiguity is ESCALATE, never CONTINUE.**

Return \`healthy\`, \`deployReachedProd\`, \`liveDeploymentSha\`, \`checks\`, \`advisorErrors\`,
\`newErrorClasses\`, \`recommendation\`, \`reason\`.
${SO}`
}

function rollbackPrompt(ph, mergeCommit, restore, health) {
  return `Roll back phase ${ph.phaseName}. Production is unhealthy after \`${mergeCommit}\`.

## Why
\`\`\`json
${JSON.stringify(health, null, 2)}
\`\`\`

## Restore point (captured before the phase)
\`\`\`json
${JSON.stringify(restore, null, 2)}
\`\`\`

${recovery}

## Order — cheapest and safest first
1. **Vercel instant rollback** to \`${restore?.deploy?.liveDeploymentId ?? '<not captured>'}\`. This
   is the documented incident response for this repo and it restores service in seconds without git
   archaeology. Do this FIRST. If the id was not captured, roll back to the deployment immediately
   preceding this one and say so.
2. **Then** take the code off main properly: \`git revert -m 1 ${mergeCommit}\` on a new branch → PR
   → normal CI. **Never force-push main.**
3. If a migration was applied this phase and the code is now reverted, check the expand/contract
   direction. An EXPAND migration can and should stay — that is the entire point of expanding first.
   Do not reverse it reflexively.

**If the rollback itself fails, stop and escalate immediately.** Do not improvise a second recovery
path against production; a failed rollback plus an improvised fix is how a bad deploy becomes an
outage.

Return \`ok\`, \`method\`, \`evidence\`, \`reason\`.
${SO}`
}

function gatePrompt(ph, prev) {
  return `Phase ${ph.phaseName} cannot start until phase ${prev} is LIVE in production.

Reason: ${ph.gate?.rationale ?? 'declared deploy-live gate'}

Confirm it, do not assume it. \`deploy.yml\` ships \`main\` on CI success, so a merge is not a
deploy. Read the live production deployment and confirm it was built from a commit at or after
${prev}'s merge, and that the site actually serves.
${ph.gate?.verifyCommand ? `\nAlso run and require success:\n\`\`\`bash\n${ph.gate.verifyCommand}\n\`\`\`` : ''}

Poll up to 20 minutes. Return the health shape: \`healthy\`, \`deployReachedProd\`,
\`liveDeploymentSha\`, \`checks\`, \`recommendation\` (CONTINUE once live, ESCALATE if it never
lands or you cannot read it).
${SO}`
}

// ================================================================== execution

const report = { phases: [], tsIso }
let previousPhase = null

for (let pi = 0; pi < phases.length; pi++) {
  const ph = { ...phases[pi] }
  ph.integrationWorktree = `${integrationWorktreeRoot}/${ph.phaseName.toLowerCase().replace(/[^a-z0-9-]/g, '')}-integration`
  const ent = { phaseName: ph.phaseName }
  report.phases.push(ent)

  // ---- Refuse the irreversible before doing any work ----------------------
  if (ph.migration?.class === 'DESTRUCTIVE') {
    ent.stopped = 'DESTRUCTIVE_MIGRATION'
    ent.reason = `Migration ${ph.migration.number} is DESTRUCTIVE. DROP COLUMN/TABLE and non-idempotent DML cannot be undone by any harness — PITR is a whole-project rollback, not an undo. Split the destructive statements out for a human.`
    log(`REFUSED: ${ent.reason}`)
    return { ...report, stopped: 'DESTRUCTIVE_MIGRATION', atPhase: ph.phaseName }
  }

  // ---- Gate: previous phase must be live ----------------------------------
  if (ph.gate?.kind === 'deploy-live' && previousPhase) {
    phase('Safety')
    const g = await safeAgent(gatePrompt(ph, previousPhase), {
      schema: HEALTH_SCHEMA, label: `gate:${ph.phaseName}`, phase: 'Safety',
    })
    ent.gate = g
    if (g?.recommendation !== 'CONTINUE') {
      ent.stopped = 'GATE_NOT_MET'
      ent.reason = g?.reason ?? 'Could not confirm the previous phase is live in production.'
      log(`GATE not met for ${ph.phaseName}: ${ent.reason}`)
      return { ...report, stopped: 'GATE_NOT_MET', atPhase: ph.phaseName }
    }
    log(`gate met: ${previousPhase} is live`)
  }

  // ---- Capture the restore point BEFORE anything changes ------------------
  phase('Safety')
  const restore = await safeAgent(restorePointPrompt(ph), {
    schema: RESTORE_POINT_SCHEMA, label: `restore-point:${ph.phaseName}`, phase: 'Safety',
  })
  ent.restore = restore
  if (!restore?.ok || !restore.git?.mainSha) {
    ent.stopped = 'NO_RESTORE_POINT'
    ent.reason = 'Could not capture a verified restore point. Refusing to make an unattended production change without one.'
    log(`STOP: ${ent.reason}`)
    return { ...report, stopped: 'NO_RESTORE_POINT', atPhase: ph.phaseName }
  }
  if (!restore.runbookVerified) log(`⚠ ${ph.phaseName}: rollback runbook could NOT be verified — proceeding, but flag it`)

  // ---- Persist the spec, and refuse untraceable criteria ------------------
  // The gate must execute criteria from a FILE a repair round can correct, not
  // from frozen arguments. And every criterion must trace back to the plan, so
  // a gate cannot be weakened anywhere but in a committed, reviewable document.
  const spec = await safeAgent(specPersistPrompt(ph), {
    schema: SPEC_WRITE_SCHEMA, label: `spec:${ph.phaseName}`, phase: 'Safety',
  })
  ent.spec = spec
  if (!spec?.ok || !spec.specPath) {
    ent.stopped = 'NO_SPEC_FILE'
    ent.reason = `Could not persist the slice spec to ${specPath(ph)}. Without it the verify gate would execute frozen argument strings that no repair round can correct — the phase-11b-3 defect.`
    log(`STOP: ${ent.reason}`)
    return { ...report, stopped: 'NO_SPEC_FILE', atPhase: ph.phaseName }
  }
  const unresolved = (spec.untraceable ?? []).filter(u => u.resolution !== 'MARKED_DERIVED')
  if (unresolved.length > 0) {
    ent.stopped = 'UNTRACEABLE_CRITERIA'
    ent.reason = `${unresolved.length} criterion/criteria in the spec do not appear in the plan and were not marked derived: ${unresolved.map(u => `${u.owner}: ${u.command}`).join(' | ')}. Reconcile ${planPath} and the spec before running — a paraphrased criterion is what made 11b-3's gate demand a regression.`
    log(`STOP: ${ent.reason}`)
    return { ...report, stopped: 'UNTRACEABLE_CRITERIA', atPhase: ph.phaseName }
  }
  log(`spec persisted → ${spec.specPath} (${spec.criteriaTotal} criteria, ${(spec.untraceable ?? []).length} marked derived)`)

  // ---- Waves --------------------------------------------------------------
  let waves
  try {
    waves = deriveWaves(ph.slices)
  } catch (e) {
    ent.stopped = 'BAD_SLICE_SPEC'
    ent.reason = e.message
    return { ...report, stopped: 'BAD_SLICE_SPEC', atPhase: ph.phaseName }
  }
  ent.waves = waves.map(w => w.map(g => g.map(s => s.id).join('+')))
  log(`${ph.phaseName}: ${waves.length} wave(s) — ${ent.waves.map((w, i) => `W${i + 1}[${w.join(', ')}]`).join(' ')}`)

  let tip = pi === 0 ? baseSha : restore.git.mainSha
  ent.slices = []
  ent.undeclaredEdits = []

  for (let w = 0; w < waves.length; w++) {
    phase('Implement')
    const groups = waves[w]
    const results = (await parallel(groups.map(group => () => {
      const slug = group.map(s => s.slug ?? s.id).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
      const worktreePath = `${repoRoot}/.claude/worktrees/${ph.phaseName.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${slug}`
      const branch = `phase-run/${ph.phaseName}/${slug}`
      return agent(implementPrompt(ph, group, worktreePath, branch, tip), {
        schema: SLICE_RESULT_SCHEMA, label: `impl:${group.map(s => s.id).join('+')}`, phase: 'Implement',
      })
    }))).filter(Boolean)

    ent.slices.push(...results.map(r => ({ sliceId: r.sliceId, ok: r.ok, undeclaredFiles: r.undeclaredFiles ?? [], notes: r.notes })))
    for (const r of results) {
      if ((r.undeclaredFiles ?? []).length) log(`⚠ ${r.sliceId} edited undeclared: ${r.undeclaredFiles.join(', ')}`)
    }

    const ok = results.filter(r => r.ok)
    if (!ok.length) {
      ent.stopped = 'WAVE_TOTAL_FAILURE'
      ent.reason = `Every agent in wave ${w + 1} failed.`
      return { ...report, stopped: 'WAVE_TOTAL_FAILURE', atPhase: ph.phaseName }
    }

    phase('Integrate')
    const integ = await safeAgent(integratePrompt(ph, w + 1, ok), {
      schema: INTEGRATE_RESULT_SCHEMA, label: `integrate:${ph.phaseName}W${w + 1}`, phase: 'Integrate',
    })
    if (!integ?.ok || !integ.tipSha) {
      ent.stopped = 'INTEGRATE_FAILED'
      ent.reason = integ?.failed?.map(f => `${f.sliceId}: ${f.reason}`).join('; ') ?? 'integrator failed'
      return { ...report, stopped: 'INTEGRATE_FAILED', atPhase: ph.phaseName }
    }
    tip = integ.tipSha
    ent.undeclaredEdits.push(...(integ.undeclaredEdits ?? []))
    log(`${ph.phaseName} W${w + 1} integrated → ${tip.slice(0, 8)}`)
  }

  // ---- Verify, with adversarial diagnosis on red --------------------------
  phase('Verify')
  const blocking = v => (v?.results ?? []).filter(r => !r.passed && !(r.failureDetail ?? '').startsWith('ENV:'))

  let verify = await safeAgent(verifyPrompt(ph, tip), {
    schema: VERIFY_RESULT_SCHEMA, label: `verify:${ph.phaseName}`, phase: 'Verify',
  })
  ent.diagnoses = []
  for (let round = 0; round < 3; round++) {
    if (verify && blocking(verify).length === 0) break
    log(`${ph.phaseName} verify red (round ${round + 1}) — diagnosing adversarially`)

    const diag = await safeAgent(
      diagnosePrompt(ph, blocking(verify), `verify gate, repair round ${round + 1}`),
      { schema: DIAGNOSIS_SCHEMA, label: `diagnose:${ph.phaseName}:${round + 1}`, phase: 'Verify' },
    )
    ent.diagnoses.push(diag)
    if (diag?.needsHuman) {
      ent.stopped = 'DIAGNOSIS_NEEDS_HUMAN'
      ent.reason = diag.needsHumanReason
      return { ...report, stopped: 'DIAGNOSIS_NEEDS_HUMAN', atPhase: ph.phaseName }
    }
    if (!diag || diag.confirmed.length === 0) {
      ent.stopped = 'VERIFY_FAILED_NO_DIAGNOSIS'
      ent.reason = 'The gate is red but the adversarial loop confirmed no findings — the failure is not understood, and guessing at a fix against production is worse than stopping.'
      return { ...report, stopped: 'VERIFY_FAILED_NO_DIAGNOSIS', atPhase: ph.phaseName }
    }

    const fix = await safeAgent(repairPrompt(ph, diag, tip), {
      schema: SLICE_RESULT_SCHEMA, label: `repair:${ph.phaseName}:${round + 1}`, phase: 'Verify',
    })
    if (!fix?.ok) break
    tip = fix.commitSha ?? tip
    verify = await safeAgent(verifyPrompt(ph, tip), {
      schema: VERIFY_RESULT_SCHEMA, label: `verify:${ph.phaseName}:${round + 2}`, phase: 'Verify',
    })
  }
  ent.verify = verify
  if (!verify || blocking(verify).length > 0) {
    ent.stopped = 'VERIFY_FAILED'
    ent.reason = `Local gate still red after 3 diagnose-and-fix rounds: ${blocking(verify).map(r => r.command).join(', ')}`
    return { ...report, stopped: 'VERIFY_FAILED', atPhase: ph.phaseName }
  }
  log(`${ph.phaseName} verify green`)

  // ---- Migration ladder ---------------------------------------------------
  if (ph.migration) {
    phase('Migrate')
    const mig = await safeAgent(migrationPrompt(ph), {
      schema: MIGRATION_RESULT_SCHEMA, label: `migrate:${ph.migration.number}`, phase: 'Migrate',
    })
    ent.migration = mig
    if (!mig?.ok || (mig.stage !== 'VERIFIED' && mig.stage !== 'APPLIED')) {
      ent.stopped = 'MIGRATION_NOT_APPLIED'
      ent.reason = `Migration ${ph.migration.number} ended at stage ${mig?.stage ?? 'UNKNOWN'}: ${mig?.reason ?? 'no reason given'}`
      return { ...report, stopped: 'MIGRATION_NOT_APPLIED', atPhase: ph.phaseName }
    }
    log(`migration ${ph.migration.number} ${mig.stage} (ledger ${mig.ledgerId})`)
  }

  // ---- PR + four-lens review ---------------------------------------------
  phase('Review')
  const pr = await safeAgent(openPrPrompt(ph), { schema: PR_RESULT_SCHEMA, label: `pr:${ph.phaseName}`, phase: 'Review' })
  if (!pr?.ok || !pr.prNumber) {
    ent.stopped = 'PR_FAILED'
    ent.reason = pr?.reason ?? 'could not open the PR'
    return { ...report, stopped: 'PR_FAILED', atPhase: ph.phaseName }
  }
  ent.prNumber = pr.prNumber
  ent.prUrl = pr.prUrl
  log(`${ph.phaseName} → PR #${pr.prNumber}`)

  const reviews = await parallel([
    () => agent(generalReviewPrompt(ph, pr), { schema: REVIEW_FINDINGS_SCHEMA, label: `review:correctness`, phase: 'Review' }),
    () => agent(corpusReviewPrompt(ph, pr), { agentType: 'feature-dev:code-reviewer', schema: REVIEW_FINDINGS_SCHEMA, label: `review:corpus`, phase: 'Review' }),
    () => agent(opsReviewPrompt(ph, pr), { schema: REVIEW_FINDINGS_SCHEMA, label: `review:devops-chaos`, phase: 'Review' }),
    () => agent(securityReviewPrompt(ph, pr), { schema: REVIEW_FINDINGS_SCHEMA, label: `review:security`, phase: 'Review' }),
  ])
  const findings = reviews.filter(Boolean).flatMap(r => r.findings ?? [])
  ent.findingsRaw = findings.length
  log(`${ph.phaseName} review: ${findings.length} raw findings across 4 lenses`)

  // ---- Adjudicate adversarially, then adopt only what survives ------------
  phase('Adopt')
  let adoption = { adopted: [], dismissed: [], failed: [] }
  if (findings.length) {
    const adj = await safeAgent(adjudicatePrompt(ph, pr, findings), {
      schema: DIAGNOSIS_SCHEMA, label: `adjudicate:${ph.phaseName}`, phase: 'Adopt',
    })
    ent.adjudication = adj ? { confirmed: adj.confirmed.length, refuted: adj.refuted.length, rounds: adj.rounds } : null

    if (adj?.needsHuman) {
      ent.stopped = 'REVIEW_NEEDS_HUMAN'
      ent.reason = adj.needsHumanReason
      return { ...report, stopped: 'REVIEW_NEEDS_HUMAN', atPhase: ph.phaseName }
    }
    if (adj && adj.confirmed.length) {
      log(`${ph.phaseName}: ${adj.confirmed.length} confirmed, ${adj.refuted.length} refuted`)
      adoption = (await safeAgent(adoptPrompt(ph, pr, adj), {
        schema: ADOPT_RESULT_SCHEMA, label: `adopt:${ph.phaseName}`, phase: 'Adopt',
      })) ?? adoption

      const re = await safeAgent(verifyPrompt(ph, adoption.headSha ?? tip), {
        schema: VERIFY_RESULT_SCHEMA, label: `verify:post-adopt:${ph.phaseName}`, phase: 'Adopt',
      })
      if (!re || blocking(re).length > 0) {
        ent.stopped = 'POST_ADOPT_VERIFY_FAILED'
        ent.reason = 'Adopting review findings broke the local gate.'
        return { ...report, stopped: 'POST_ADOPT_VERIFY_FAILED', atPhase: ph.phaseName }
      }
      tip = adoption.headSha ?? tip
    } else {
      log(`${ph.phaseName}: no findings survived adjudication`)
    }
  }
  ent.findings = { raw: findings.length, adopted: adoption.adopted.length, dismissed: adoption.dismissed.length, failed: adoption.failed.length }

  // ---- CI, with adversarial diagnosis on red ------------------------------
  phase('Ship')
  let ci = await safeAgent(ciWaitPrompt(pr), { schema: CI_WAIT_RESULT_SCHEMA, label: `ci:${ph.phaseName}`, phase: 'Ship' })
  for (let round = 0; round < 2; round++) {
    if (ci?.state !== 'RED') break
    log(`${ph.phaseName} CI red — diagnosing`)
    const diag = await safeAgent(
      diagnosePrompt(ph, { failedChecks: ci.failedChecks, failureLog: ci.failureLog }, `CI red, round ${round + 1}`),
      { schema: DIAGNOSIS_SCHEMA, label: `diagnose:ci:${round + 1}`, phase: 'Ship' },
    )
    if (diag?.needsHuman || !diag?.confirmed?.length) break
    const fix = await safeAgent(repairPrompt(ph, diag, tip), {
      schema: SLICE_RESULT_SCHEMA, label: `ci-repair:${round + 1}`, phase: 'Ship',
    })
    if (!fix?.ok) break
    ci = await safeAgent(ciWaitPrompt(pr), { schema: CI_WAIT_RESULT_SCHEMA, label: `ci:${ph.phaseName}:${round + 2}`, phase: 'Ship' })
  }
  ent.ci = ci?.state
  if (ci?.state !== 'GREEN') {
    ent.stopped = 'CI_NOT_GREEN'
    ent.reason = `${ci?.state ?? 'UNKNOWN'}: ${(ci?.failedChecks ?? []).join(', ')}`
    return { ...report, stopped: 'CI_NOT_GREEN', atPhase: ph.phaseName }
  }

  const merge = await safeAgent(mergePrompt(ph, pr), { schema: MERGE_RESULT_SCHEMA, label: `merge:${ph.phaseName}`, phase: 'Ship' })
  ent.merge = merge?.state
  ent.mergeCommit = merge?.mergeCommit
  if (merge?.state !== 'MERGED') {
    ent.stopped = 'MERGE_FAILED'
    ent.reason = merge?.reason ?? merge?.state ?? 'unknown'
    return { ...report, stopped: 'MERGE_FAILED', atPhase: ph.phaseName }
  }
  log(`${ph.phaseName} MERGED ${merge.mergeCommit?.slice(0, 10)}`)

  // ---- Production health — the "didn't realize until later" gate ----------
  phase('Health')
  const health = await safeAgent(healthPrompt(ph, merge.mergeCommit, restore), {
    schema: HEALTH_SCHEMA, label: `health:${ph.phaseName}`, phase: 'Health',
  })
  ent.health = health

  if (health?.recommendation === 'ROLLBACK') {
    log(`${ph.phaseName}: production UNHEALTHY — rolling back`)
    const rb = await safeAgent(rollbackPrompt(ph, merge.mergeCommit, restore, health), {
      schema: ROLLBACK_SCHEMA, label: `rollback:${ph.phaseName}`, phase: 'Health',
    })
    ent.rollback = rb
    ent.stopped = rb?.ok ? 'ROLLED_BACK' : 'ROLLBACK_FAILED'
    ent.reason = health.reason
    return { ...report, stopped: ent.stopped, atPhase: ph.phaseName, urgent: !rb?.ok }
  }
  if (health?.recommendation !== 'CONTINUE') {
    ent.stopped = 'HEALTH_UNVERIFIED'
    ent.reason = health?.reason ?? 'Could not confirm production health. Ambiguity is escalation, not a pass — the next phase would build on an unverified base.'
    return { ...report, stopped: 'HEALTH_UNVERIFIED', atPhase: ph.phaseName }
  }

  log(`${ph.phaseName} healthy in production`)
  ent.ok = true
  previousPhase = ph.phaseName
}

// Cleanup is deliberately NOT automated: every phase is healthy by the time we
// reach here, but the worktrees and branches are the only record of how each
// slice reasoned, and they cost nothing to keep. The skill sweeps them once the
// human has read the report.
return {
  ...report,
  ok: report.phases.every(p => p.ok),
  cleanupPending: `${repoRoot}/.claude/worktrees (phase-run/* branches and *-integration worktrees retained deliberately)`,
}

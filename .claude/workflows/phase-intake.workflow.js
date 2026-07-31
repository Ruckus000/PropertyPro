// Phase intake: read a prose plan, stress-test it against the real codebase,
// and derive everything `phase-run` needs to ship it unattended.
//
// This is the ONE human gate in the whole pipeline. Everything it produces —
// the decision ledger, the slice list, the weakness report — exists so that the
// implementation afterwards never has to stop and ask.
//
// The load-bearing part is NOT the derivation, it is the FALSE-PREMISE check.
// A plan is a set of claims about a codebase, written by someone who was not
// reading every file at the time. When one of those claims is wrong, following
// the plan faithfully produces a broken product — and no amount of downstream
// review catches it, because the code correctly implements the plan. The
// 11b-0 plan asserted that community subdomains do not serve the authenticated
// app. False. Implemented as written it would have routed every resident's
// dashboard to the public site renderer. That class of defect is why this
// workflow reads code instead of just parsing prose.
//
// Sandbox: no filesystem, no clock, no RNG, no imports, meta is a pure literal.

export const meta = {
  name: 'phase-intake',
  description: 'Stress-test a plan against the codebase, then derive the decision ledger, slice list and weakness report that let phase-run ship it without stopping',
  whenToUse: 'Invoked by the /phase-run skill before any implementation. Its output is what the human approves.',
  phases: [
    { title: 'Read' },
    { title: 'Stress-test' },
    { title: 'Derive' },
    { title: 'Adversarial check' },
  ],
}

const A = typeof args === 'string' ? JSON.parse(args) : args
const { repoRoot, planPath, corpus, phaseHint } = A

log(`intake: ${planPath}`)

// ==================================================================== schemas

const PLAN_READ_SCHEMA = {
  type: 'object',
  required: ['phases', 'claims', 'openQuestions'],
  properties: {
    summary: { type: 'string' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['phaseName', 'goal', 'workItems'],
        properties: {
          phaseName: { type: 'string' },
          goal: { type: 'string' },
          workItems: { type: 'array', items: { type: 'string' } },
          declaredMigration: { type: 'string' },
          declaredGate: { type: 'string' },
        },
      },
    },
    // Every factual assertion the plan makes ABOUT THE CODEBASE. These are what
    // get verified. A plan's prose is full of them and they are usually implicit.
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'whereInPlan', 'whyItMatters'],
        properties: {
          claim: { type: 'string' },
          whereInPlan: { type: 'string' },
          whyItMatters: { type: 'string' },
          filesToCheck: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question', 'whyItBlocks'],
        properties: { question: { type: 'string' }, whyItBlocks: { type: 'string' } },
      },
    },
  },
}

const CLAIM_VERDICT_SCHEMA = {
  type: 'object',
  required: ['claim', 'verdict', 'evidence'],
  properties: {
    claim: { type: 'string' },
    verdict: { enum: ['TRUE', 'FALSE', 'PARTLY_TRUE', 'UNVERIFIABLE'] },
    evidence: { type: 'string' },
    consequenceIfActedOn: { type: 'string' },
    recommendation: { type: 'string' },
  },
}

const SLICE_SPEC_SCHEMA = {
  type: 'object',
  required: ['phases'],
  properties: {
    phases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['phaseName', 'integrationBranch', 'slices', 'verifyCommands', 'prTitle', 'prBody'],
        properties: {
          phaseName: { type: 'string' },
          integrationBranch: { type: 'string' },
          prTitle: { type: 'string' },
          prBody: { type: 'string' },
          slices: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'slug', 'title', 'blast', 'ownedFiles', 'scope', 'doneCriteria'],
              properties: {
                id: { type: 'string' },
                slug: { type: 'string' },
                title: { type: 'string' },
                blast: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'string' } },
                ownedFiles: { type: 'array', items: { type: 'string' } },
                scope: { type: 'string' },
                doneCriteria: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          verifyCommands: {
            type: 'array',
            items: {
              type: 'object',
              required: ['command'],
              properties: { command: { type: 'string' }, expect: { type: 'string' } },
            },
          },
          spotChecks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['command'],
              properties: { command: { type: 'string' }, expect: { type: 'string' } },
            },
          },
          migration: {
            type: 'object',
            properties: {
              number: { type: 'string' },
              class: { enum: ['EXPAND', 'REVERSIBLE_CONTRACT', 'DESTRUCTIVE'] },
              classRationale: { type: 'string' },
              statements: { type: 'array', items: { type: 'string' } },
              expect: { type: 'object', additionalProperties: true },
            },
          },
          gate: {
            type: 'object',
            properties: {
              kind: { enum: ['deploy-live', 'none'] },
              verifyCommand: { type: 'string' },
              rationale: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

const LEDGER_SCHEMA = {
  type: 'object',
  required: ['ledger'],
  properties: {
    ledger: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'question', 'decision', 'rationale', 'confidence'],
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          decision: { type: 'string' },
          rationale: { type: 'string' },
          // LOW means "I am guessing and you should look at this one".
          confidence: { enum: ['HIGH', 'MEDIUM', 'LOW'] },
          reversible: { type: 'boolean' },
          affectsSlices: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const WEAKNESS_SCHEMA = {
  type: 'object',
  required: ['weaknesses', 'readiness'],
  properties: {
    readiness: { enum: ['READY', 'NEEDS_DECISIONS', 'BLOCKED'] },
    readinessRationale: { type: 'string' },
    weaknesses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'kind', 'where', 'finding', 'recommendation'],
        properties: {
          severity: { enum: ['BLOCKER', 'MAJOR', 'MINOR'] },
          kind: {
            enum: [
              'FALSE_PREMISE',
              'MISSING_DECISION',
              'UNVERIFIABLE_DONE',
              'UNKNOWN_BLAST_RADIUS',
              'ORDERING_HAZARD',
              'SCOPE_SPLIT',
              'EXTERNAL_BLOCKER',
              'IRREVERSIBLE',
            ],
          },
          where: { type: 'string' },
          finding: { type: 'string' },
          evidence: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
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

// ==================================================================== prompts

const REPO = `Repo root: \`${repoRoot}\`. Work read-only — do not edit, commit, or create anything.`

function readPrompt() {
  return `Read the plan at \`${planPath}\` in full.${phaseHint ? ` The human is asking specifically about: ${phaseHint}.` : ''}

${REPO}

Your job is to turn prose into a structured account of what the plan ASSERTS and what it LEAVES OPEN.
Do not evaluate yet and do not fix anything — another agent verifies your output.

## 1. Phases and work items
Break the plan into phases in the order it intends. For each, the goal in one line and the concrete
work items. If the plan names a migration or a gate (a deploy wait, an "after X is live"), record it.
If the plan is one phase, say so — do not invent a split.

## 2. Claims — the important part
Extract every factual assertion the plan makes **about the codebase**, including the implicit ones.
A plan is a set of claims written by someone who was not reading every file at the time, and a wrong
claim produces code that is faithful to the plan and broken in production.

Claims look like: "X only runs for Y", "nothing reads Z yet", "the app route wins here", "this is the
only caller", "that behaviour was removed", "this file is not used elsewhere", "adding this is
backwards-compatible", "no test covers this".

Also extract claims about EFFECT: "this change is invisible to users", "this cannot break the app",
"no data migration is needed".

For each: quote or paraphrase the claim, say where in the plan it appears, say **why it matters**
(what breaks if it is false), and list the files someone would read to check it. Be exhaustive —
a claim you skip is a claim nobody verifies.

## 3. Open questions
Anything the plan does not decide but an implementer would have to. Product behaviour, edge cases,
naming, ordering, error handling, what happens to existing data. For each, say why it blocks.

Return via StructuredOutput. You MUST call it.`
}

function verifyClaimPrompt(claim) {
  return `Verify ONE claim a plan makes about this codebase. ${REPO}

## The claim
> ${claim.claim}

From: ${claim.whereInPlan}
Why it matters: ${claim.whyItMatters}
${claim.filesToCheck?.length ? `Suggested files: ${claim.filesToCheck.join(', ')}` : ''}

## How to verify
**Read the actual code.** Do not reason from the plan, from naming, or from what would be sensible.
Grep for callers, read the function, read the test, check git history if the claim is about something
having been removed or added. A claim about "the only caller" needs a repo-wide grep, not a guess.

Verdicts:
- **TRUE** — you read the code and it holds. Quote the file:line that proves it.
- **FALSE** — it does not hold. Quote the file:line that disproves it, and say concretely what
  breaks if someone implements the plan believing it. This is the highest-value outcome here.
- **PARTLY_TRUE** — holds in some cases and not others. Say exactly which, since that boundary is
  usually the actual design question.
- **UNVERIFIABLE** — cannot be settled by reading this repo (depends on production data, an external
  service, or a human's intent). Say what would settle it.

Do not soften a FALSE into a PARTLY_TRUE to be agreeable. A wrong plan premise found here costs
minutes; found after implementation it costs a phase.

Return via StructuredOutput. You MUST call it, including for TRUE.`
}

function derivePrompt(planRead, verdicts) {
  return `Derive an executable slice specification from a plan. ${REPO}

The plan: \`${planPath}\`. Read it in full.

## Structured reading of it
\`\`\`json
${JSON.stringify(planRead, null, 2)}
\`\`\`

## Claim verification — CORRECTED FACTS, these override the plan
\`\`\`json
${JSON.stringify(verdicts, null, 2)}
\`\`\`
Where a verdict is FALSE or PARTLY_TRUE, **the plan is wrong and the verdict is right**. Derive
slices for what actually needs building, not for what the plan assumed. Say so in the slice's scope.

## What to produce
One entry per phase, in execution order. For each phase:

**\`slices\`** — the work chopped up so it can be built in parallel. Per slice:
- \`id\` (S1, S2…), \`slug\` (short, kebab, used for branch and worktree names), \`title\`
- \`blast\` — the blast radius tag. Use the plan's vocabulary if it has one; otherwise pick from
  how bad it is if this slice is wrong, most severe first.
- \`dependsOn\` — slice ids that must land first. Be honest: if slice B reads a function slice A
  writes, that is a dependency even if they are "obviously" separate.
- **\`ownedFiles\` — every file the slice will touch, including tests.** This is the most important
  field and it is not documentation: the runner derives parallelism from it, and an undeclared edit
  is the one thing that breaks a run. When two slices must touch the same file, declare it in both
  and let the runner merge them into one agent — that is correct and expected. Read the codebase to
  get these right; do not guess from the plan's prose.
- \`scope\` — markdown telling an implementer what to build and, where it is non-obvious, WHY.
  Carry across any correction from the verdicts above.
- \`doneCriteria\` — **runnable shell commands**, not prose. "works correctly" is not a criterion.

**When the plan already states a done-criterion, carry it VERBATIM.** Do not
re-author, reformat, or "improve" it. A criterion written into a plan has usually
been executed against the real tree by whoever wrote it, and rewriting it silently
discards that verification. Add criteria the plan is missing; never replace one it
has. (This rule exists because a derivation replaced a working, plan-verified
\`git grep -qn "…" <file>\` with a \`test "$(grep -cF \\"…\\" <file>)" = "1"\`
whose nested quoting made it error on every input — turning a red-today check into
a can-never-pass one, on a slice in the final wave.)

**Every criterion you author yourself must be EXECUTED before you return it**, in
the repo, exactly as written, and it must exit non-zero on the current tree. Report
the exit code in the criterion's \`expect\` field. Two failure modes to test for
explicitly, both of which have shipped here:
- *Vacuously green*: would this pass on an empty diff? (\`git grep\` asserting
  something stayed unchanged; \`curl\` without \`-f\`, which exits 0 on a 404.)
- *Vacuously red / can-never-pass*: does it error regardless of the code? Nested
  quoting inside \`"$( … )"\`, or \`git grep\` on a path that does not exist yet —
  which reports "no matches" and so passes an absence check most loudly when the
  file was never written. Prefer \`test -f <path> && ! grep -q <pattern> <path>\`
  over a bare negated grep.

**\`verifyCommands\`** — the whole-phase gate an independent agent re-runs. Use this repo's exact
forms (see the corpus below); the obvious form of several of these is silently wrong.

**\`spotChecks\`** — commands for done-criteria phrased as an ABSENCE ("exactly one definition
site", "no new client island", "this fix is asserted, not merely present"). A green suite does not
prove an absence.

**\`migration\`** — only if the phase genuinely needs a schema change. Classify:
- \`EXPAND\` — CREATE TABLE, ADD COLUMN nullable, CREATE INDEX, ADD POLICY
- \`REVERSIBLE_CONTRACT\` — DROP INDEX, SET NOT NULL, DROP POLICY: no data lost, recreatable from
  the repo schema
- \`DESTRUCTIVE\` — DROP COLUMN/TABLE, or any non-idempotent DML. **The runner refuses these**, so
  classify honestly; a misclassification is how irreversible damage gets automated.
Include an \`expect\` block: catalog assertions (columns, indexes, policy predicates, RLS forced,
table counts) plus behavioural probes.

**\`gate\`** — \`{kind: 'deploy-live'}\` when the phase cannot start until the previous phase is
live in production, with a \`verifyCommand\` that proves it. Otherwise \`{kind: 'none'}\`.

**\`integrationBranch\`**, **\`prTitle\`**, **\`prBody\`** — following this repo's conventions.

${corpus}

Return via StructuredOutput. You MUST call it.`
}

function ledgerPrompt(planRead, verdicts, spec) {
  return `Produce a DECISION LEDGER for a plan about to be implemented unattended. ${REPO}

Plan: \`${planPath}\`.

## Open questions the plan left
\`\`\`json
${JSON.stringify(planRead.openQuestions, null, 2)}
\`\`\`

## Corrected facts
\`\`\`json
${JSON.stringify(verdicts.filter(v => v.verdict !== 'TRUE'), null, 2)}
\`\`\`

## The derived slices
\`\`\`json
${JSON.stringify(spec.phases.map(p => ({ phaseName: p.phaseName, slices: p.slices.map(s => ({ id: s.id, title: s.title, scope: s.scope })) })), null, 2)}
\`\`\`

## What a ledger is for
The implementation will run with no human available. Every question it hits must already be
answered, or it will guess silently. Your job is to surface those questions NOW, each with the
answer that will be used.

Go looking. Do not limit yourself to the plan's own open questions — walk each slice and ask what an
implementer would have to decide: edge cases, empty and error states, what happens to existing rows,
naming that becomes a public contract, what stays byte-identical, what a caller can do in the window
before the UI exists.

Per entry: \`id\` (D1, D2…), the \`question\`, the \`decision\` that will be taken, the
\`rationale\`, whether it is \`reversible\` after shipping, which slices it \`affectsSlices\`, and
\`confidence\`:
- **HIGH** — the codebase, the plan or an obvious convention settles it.
- **MEDIUM** — a judgement call with a clear best answer.
- **LOW** — **you are guessing.** Mark it LOW. These are what the human will actually read, and an
  unmarked guess is worse than an admitted one.

Prefer the decision that is easiest to reverse when it is close. Flag any decision that is
irreversible once shipped (a public URL, a stored data shape, a deleted row) as \`reversible: false\`
regardless of confidence.

${corpus}

Return via StructuredOutput. You MUST call it.`
}

function weaknessPrompt(planRead, verdicts, spec, ledger) {
  return `You are the ADVERSARIAL reviewer of a plan that is about to be implemented **unattended,
end to end, with automatic merge to main**. Nobody will read the code before it ships.

${REPO}

Plan: \`${planPath}\`. Read it.

## Everything derived from it
Structured reading:
\`\`\`json
${JSON.stringify(planRead, null, 2)}
\`\`\`
Claim verdicts:
\`\`\`json
${JSON.stringify(verdicts, null, 2)}
\`\`\`
Derived slices:
\`\`\`json
${JSON.stringify(spec, null, 2)}
\`\`\`
Decision ledger:
\`\`\`json
${JSON.stringify(ledger, null, 2)}
\`\`\`

## Your job
Find every reason this should NOT be run unattended. You are the last check before the human is
asked to approve, and the human's whole question is "where is this plan weak?"

Look for:

- **FALSE_PREMISE** — any FALSE or PARTLY_TRUE verdict above that the derived slices did not
  actually correct. Check this first; it is the class that produces plan-faithful broken code.
- **MISSING_DECISION** — a question an implementer will hit that the ledger does not cover, or a
  LOW-confidence entry whose blast radius makes guessing unacceptable.
- **UNVERIFIABLE_DONE** — a done-criterion that is prose, or a command that would pass whether or
  not the work was done. **A criterion that cannot fail is not a criterion.** Check specifically:
  would this command still pass if the slice did nothing?
- **UNKNOWN_BLAST_RADIUS** — \`ownedFiles\` that look incomplete for the described scope, or a
  slice whose real reach is wider than declared. An undeclared file is the one thing that breaks
  a parallel run.
- **ORDERING_HAZARD** — expand-before-contract violated, a migration that must land before or after
  code and does not, a dependency the slices do not encode, a phase gate that is missing.
- **SCOPE_SPLIT** — a phase that is honestly two, or a slice big enough that one agent will not
  finish it coherently.
- **EXTERNAL_BLOCKER** — needs a credential, an account, a third-party service, a DNS change, or a
  human decision that cannot be pre-made.
- **IRREVERSIBLE** — anything that cannot be undone: a DESTRUCTIVE migration, a public URL that
  will be indexed, a deleted row, an email that gets sent, an outward-facing change.

Severity:
- **BLOCKER** — do not run unattended until a human resolves it.
- **MAJOR** — run, but the human must read this first and may want to change something.
- **MINOR** — worth saying, will not derail anything.

Then set \`readiness\`:
- **READY** — no BLOCKERs; the ledger covers the decisions; done-criteria are real.
- **NEEDS_DECISIONS** — no BLOCKERs, but LOW-confidence or irreversible ledger entries need eyes.
- **BLOCKED** — at least one BLOCKER.

Be specific and quote evidence. "The plan is a bit vague here" is useless; "slice S3's only
done-criterion is \`pnpm typecheck\`, which passes today and would pass if S3 did nothing" is the
finding. If the plan is genuinely sound, say READY and a short list of MINORs — do not manufacture
concerns to look thorough.

${corpus}

Return via StructuredOutput. You MUST call it.`
}

// ================================================================== execution

phase('Read')
const planRead = await safeAgent(readPrompt(), {
  schema: PLAN_READ_SCHEMA, label: 'read-plan', phase: 'Read',
})
if (!planRead) {
  return { stopped: 'PLAN_UNREADABLE', reason: `Could not read or structure ${planPath}.` }
}
log(`plan: ${planRead.phases.length} phase(s), ${planRead.claims.length} claim(s), ${planRead.openQuestions.length} open question(s)`)

// Verify every claim against the real code, in parallel. This is the step that
// catches a plan-faithful-but-broken outcome, so it is not sampled or capped
// below the claim count.
phase('Stress-test')
const verdicts = (await parallel(
  planRead.claims.map((c, i) => () =>
    agent(verifyClaimPrompt(c), {
      schema: CLAIM_VERDICT_SCHEMA,
      label: `claim:${i + 1}`,
      phase: 'Stress-test',
    })
  )
)).filter(Boolean)

const falseClaims = verdicts.filter(v => v.verdict === 'FALSE')
const shakyClaims = verdicts.filter(v => v.verdict === 'PARTLY_TRUE' || v.verdict === 'UNVERIFIABLE')
log(`claims: ${verdicts.filter(v => v.verdict === 'TRUE').length} true, ${falseClaims.length} FALSE, ${shakyClaims.length} partial/unverifiable`)
for (const f of falseClaims) log(`  ✗ FALSE: ${f.claim}`)

phase('Derive')
const spec = await safeAgent(derivePrompt(planRead, verdicts), {
  schema: SLICE_SPEC_SCHEMA, label: 'derive-slices', phase: 'Derive',
})
if (!spec) {
  return { stopped: 'DERIVE_FAILED', reason: 'Could not derive a slice spec.', planRead, verdicts }
}
log(`derived ${spec.phases.length} phase(s): ${spec.phases.map(p => `${p.phaseName}(${p.slices.length} slices)`).join(', ')}`)

const ledger = await safeAgent(ledgerPrompt(planRead, verdicts, spec), {
  schema: LEDGER_SCHEMA, label: 'derive-ledger', phase: 'Derive',
})

phase('Adversarial check')
const weak = await safeAgent(
  weaknessPrompt(planRead, verdicts, spec, ledger?.ledger ?? []),
  { schema: WEAKNESS_SCHEMA, label: 'weakness-audit', phase: 'Adversarial check' },
)

// A DESTRUCTIVE migration is a blocker regardless of what the auditor said —
// the runner will refuse it anyway, so surface it at the gate rather than
// halfway through.
const destructive = spec.phases.filter(p => p.migration?.class === 'DESTRUCTIVE')
const derivedBlockers = destructive.map(p => ({
  severity: 'BLOCKER',
  kind: 'IRREVERSIBLE',
  where: `${p.phaseName} / migration ${p.migration.number}`,
  finding: 'Classified DESTRUCTIVE. The runner refuses to apply these, and nothing can undo them — PITR is a whole-project rollback, not an undo.',
  evidence: p.migration.classRationale ?? '',
  recommendation: 'Split the destructive statements into their own migration for a human to apply, and let the phase ship the reversible remainder.',
}))

const weaknesses = [...derivedBlockers, ...(weak?.weaknesses ?? [])]
const blockers = weaknesses.filter(w => w.severity === 'BLOCKER')
const lowConfidence = (ledger?.ledger ?? []).filter(d => d.confidence === 'LOW')
const irreversible = (ledger?.ledger ?? []).filter(d => d.reversible === false)

const readiness = blockers.length > 0
  ? 'BLOCKED'
  : (lowConfidence.length > 0 || irreversible.length > 0 ? 'NEEDS_DECISIONS' : (weak?.readiness ?? 'NEEDS_DECISIONS'))

log(`readiness: ${readiness} — ${blockers.length} blocker(s), ${weaknesses.filter(w => w.severity === 'MAJOR').length} major, ${lowConfidence.length} low-confidence decision(s)`)

return {
  planPath,
  readiness,
  readinessRationale: weak?.readinessRationale ?? '',
  weaknesses,
  ledger: ledger?.ledger ?? [],
  lowConfidenceDecisions: lowConfidence.map(d => d.id),
  irreversibleDecisions: irreversible.map(d => d.id),
  claims: {
    total: verdicts.length,
    true: verdicts.filter(v => v.verdict === 'TRUE').length,
    false: falseClaims,
    shaky: shakyClaims,
  },
  // Feeds straight into phase-run once approved.
  spec,
}

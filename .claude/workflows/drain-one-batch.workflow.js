// Per-batch pipeline for the A1 contract-drain automation.
// Spec: docs/superpowers/specs/2026-06-02-a1-drain-automation-design.md
//
// Invoked by:
//   - drain-loop.workflow.js (the outer loop, one call per batch)
//   - Directly via Workflow({name: 'drain-one-batch', args: {state, tsIso, batchIndex}}) for testing
//
// Constraints (Workflow tool sandbox):
//   - No filesystem access (Read/Write happen via agents)
//   - No Date.now(), no new Date() without args, no Math.random()
//   - Script must be self-contained: no imports of other files
//   - meta block must be a pure literal
//   - agent() outputs are JSON-schema-validated where structured data matters

export const meta = {
  name: 'drain-one-batch',
  description: 'One A1 contract-drain batch: pre-vet → parallel implement → dual reviewer → adopt → CI wait → sequential rebase+merge → memory update',
  whenToUse: 'Inside drain-loop.workflow.js or for one-off testing of a single batch',
  phases: [
    { title: 'Pre-vet' },
    { title: 'Pipeline' },
    { title: 'CI wait' },
    { title: 'Rebase+Merge' },
    { title: 'Memory' },
  ],
}

// args shape: { state, tsIso, batchIndex }
const { state, tsIso, batchIndex } = args
log(`Batch ${batchIndex} starting at ${tsIso}; allowlist=${state.lastKnownAllowlistCount}`)

// ---------- Agent output schemas (JSON Schema draft-07) ----------

const PRE_VET_SCHEMA = {
  type: 'object',
  required: ['picks', 'rejected'],
  properties: {
    picks: {
      type: 'array', minItems: 0, maxItems: 3,
      items: {
        type: 'object',
        required: ['route', 'allowlistLine', 'classification', 'justification'],
        properties: {
          route: { type: 'string' },
          allowlistLine: { type: 'integer' },
          classification: { enum: ['SIMPLE_POST', 'SIMPLE_GET', 'MULTI_METHOD', 'PAGINATED'] },
          justification: { type: 'string' },
        },
      },
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        required: ['route', 'classification', 'reason'],
        properties: {
          route: { type: 'string' },
          classification: { enum: ['RUNNER_BLOCKED', 'COMPLEX_SKIP', 'ALREADY_SKIPPED'] },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const IMPLEMENT_RESULT_SCHEMA = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
    prUrl: { type: 'string' },
    prNumber: { type: 'integer' },
    branch: { type: 'string' },
    worktreePath: { type: 'string' },
    contractsDelta: { type: 'integer' },
    allowlistDelta: { type: 'integer' },
    localChecksOk: { type: 'boolean' },
    reason: { type: 'string' },
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
        properties: {
          finding: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'reason'],
        properties: {
          finding: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const CI_WAIT_RESULT_SCHEMA = {
  type: 'object',
  required: ['results', 'waitedSeconds'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['prNumber', 'state'],
        properties: {
          prNumber: { type: 'integer' },
          state: { enum: ['GREEN', 'RED', 'TIMEOUT'] },
          failedChecks: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    waitedSeconds: { type: 'integer' },
  },
}

const MERGE_RESULT_SCHEMA = {
  type: 'object',
  required: ['merges'],
  properties: {
    merges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['prNumber', 'state'],
        properties: {
          prNumber: { type: 'integer' },
          state: { enum: ['MERGED', 'REBASE_FAILED', 'MERGE_FAILED', 'CI_FAILED_AFTER_REBASE'] },
          mergeCommit: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const MEMORY_UPDATE_SCHEMA = {
  type: 'object',
  required: ['ok', 'updatedAllowlistCount', 'updatedContractedCount'],
  properties: {
    ok: { type: 'boolean' },
    updatedAllowlistCount: { type: 'integer' },
    updatedContractedCount: { type: 'integer' },
    sessionLogPath: { type: 'string' },
    memoryMdPath: { type: 'string' },
    reason: { type: 'string' },
  },
}

// ---------- Prompt template generators ----------

function preVetPrompt(skipListRoutes) {
  const skipBlock = skipListRoutes.length === 0
    ? '(none)'
    : skipListRoutes.map(r => `  - ${r}`).join('\n')

  return `You are pre-vetting candidate routes for a parallel-3 batch of the
PropertyPro A1 contract-drain effort. Pick exactly 3 disjoint routes that
can each be migrated from \`withErrorHandler(async (req, ctx) => {...})\`
to \`withErrorHandler(runRoute(contract, async ({...}) => {...}))\`.

## Inputs

Read the current allowlist:
\`\`\`bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
git fetch origin --quiet
git show origin/main:scripts/verify-contracts.ts | grep -E "^  'apps/web"
\`\`\`

These routes are PERMANENTLY skipped (do not pick):
${skipBlock}

## Selection rules

1. Pick 3 routes from DIFFERENT domains (e.g., not three esign/* routes).
2. Avoid alphabetically-adjacent allowlist lines (rebase-conflict risk).
3. For each pick, read the pre-migration \`route.ts\` source via
   \`git show origin/main:<path>\` and classify it. Use these labels:

   - **SIMPLE_POST** — single-method POST, body-only, standard auth chain.
   - **SIMPLE_GET** — single-method GET, query-only, no pagination.
   - **MULTI_METHOD** — two or more methods on the same path.
   - **PAGINATED** — uses a \`paginate*ForCommunity\` service helper.

   Reject (do NOT include in picks) routes with any of:

   - **RUNNER_BLOCKED**: custom Cache-Control headers, cookie-set,
     multipart upload, 429 with retryAfter, raw-body signatures, OAuth
     redirect, binary CSV/PDF/ZIP responses, unauth+token verification.
   - **COMPLEX_SKIP**: Stripe API calls, reauth gate, FSM/multi-branch
     auth, Supabase Storage + image processing, fire-and-forget
     notifications with side effects.

4. Justification: 1 sentence per pick (why drainable, what shape).

## Return

Use the StructuredOutput tool. Schema:

\`\`\`
{
  picks: [
    { route: "apps/web/src/app/api/v1/...", allowlistLine: <int>, classification: <enum>, justification: "<sentence>" },
    ...up to 3...
  ],
  rejected: [
    { route: "<path>", classification: "RUNNER_BLOCKED" | "COMPLEX_SKIP" | "ALREADY_SKIPPED", reason: "<sentence>" },
    ...
  ]
}
\`\`\`

If you find fewer than 3 viable picks, return what you have. Do not fabricate.
`
}

phase('Pre-vet')

const permanentSkips = Object.entries(state.skipList ?? {})
  .filter(([_, entry]) => entry.classification === 'PERMANENT')
  .map(([route]) => route)

const preVet = await agent(preVetPrompt(permanentSkips), {
  schema: PRE_VET_SCHEMA,
  label: 'pre-vet',
  phase: 'Pre-vet',
})

if (!preVet || preVet.picks.length === 0) {
  log('Pre-vet returned 0 viable picks. Batch ends as dry.')
  return {
    merged: 0,
    skipped: (preVet?.rejected ?? []).map(r => ({
      route: r.route,
      classification: r.classification === 'RUNNER_BLOCKED' ? 'PERMANENT' : 'NEEDS_HUMAN',
      reason: r.reason,
    })),
    mergeCommits: [],
    findings: { high: 0, mediumAdopted: 0, dismissed: 0 },
    updatedState: state,
  }
}

log(`Pre-vet picked ${preVet.picks.length} candidate(s): ${preVet.picks.map(p => p.route.split('/').pop()).join(', ')}`)

// Phase 2+ will be added in subsequent tasks. For now, return the picks
// in `notes` so we can verify the phase works in isolation.
return {
  merged: 0,
  skipped: preVet.rejected.map(r => ({
    route: r.route,
    classification: r.classification === 'RUNNER_BLOCKED' ? 'PERMANENT' : 'NEEDS_HUMAN',
    reason: r.reason,
  })),
  mergeCommits: [],
  findings: { high: 0, mediumAdopted: 0, dismissed: 0 },
  updatedState: state,
  _debug: { picks: preVet.picks },
}

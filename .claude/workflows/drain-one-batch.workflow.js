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

// Return empty result for now — phases will be added incrementally.
return {
  merged: 0,
  skipped: [],
  mergeCommits: [],
  findings: { high: 0, mediumAdopted: 0, dismissed: 0 },
  updatedState: state,
}

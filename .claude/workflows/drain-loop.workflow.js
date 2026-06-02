// Multi-batch outer loop for the A1 contract-drain automation.
// Spec: docs/superpowers/specs/2026-06-02-a1-drain-automation-design.md
//
// Pure in-memory orchestration. State flows in via args (from the skill)
// and out via the return value (back to the skill, which persists it).

export const meta = {
  name: 'drain-loop',
  description: 'Multi-batch loop draining A1 contract allowlist routes via the drain-one-batch child workflow',
  whenToUse: 'Invoked by the /drain-loop skill — not called directly',
  phases: [
    { title: 'Loop' },
  ],
}

phase('Loop')

// The skill invokes this via Workflow({name:'drain-loop', args:{...}}) through
// the tool boundary, which serializes structured args to a JSON string.
// Inline workflow() calls pass real objects. Handle both.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { state: seedState, tsIso, overrides } = parsedArgs
const maxBatches = overrides?.maxBatches ?? Infinity
const stopFloor = overrides?.stopFloor  // may be undefined

let state = seedState
let dryBatches = 0
let batchesDone = 0
const batchResults = []

log(`drain-loop starting: allowlist=${state.lastKnownAllowlistCount}, maxBatches=${maxBatches === Infinity ? 'Infinity' : maxBatches}, stopFloor=${stopFloor ?? 'none'}`)

while (true) {
  // Stop conditions
  if (dryBatches >= 2) {
    log('Stopping: 2 consecutive dry batches')
    break
  }
  if (batchesDone >= maxBatches) {
    log(`Stopping: reached maxBatches=${maxBatches}`)
    break
  }
  if (stopFloor !== undefined && state.lastKnownAllowlistCount <= stopFloor) {
    log(`Stopping: allowlist (${state.lastKnownAllowlistCount}) reached stopFloor (${stopFloor})`)
    break
  }
  if (budget.total && budget.remaining() < 100_000) {
    log(`Stopping: budget low (${budget.remaining()} tokens remaining)`)
    break
  }

  log(`--- Batch ${batchesDone + 1} ---`)

  let result
  try {
    result = await workflow('drain-one-batch', {
      state,
      tsIso,
      batchIndex: batchesDone,
    })
  } catch (err) {
    log(`Batch ${batchesDone + 1} threw: ${err?.message ?? err}. Treating as dry.`)
    dryBatches++
    batchesDone++
    continue
  }

  batchResults.push(result)
  state = result.updatedState
  batchesDone++

  if (result.merged === 0) {
    dryBatches++
    log(`Batch ${batchesDone} produced 0 merges. Dry counter: ${dryBatches}/2`)
  } else {
    dryBatches = 0
    log(`Batch ${batchesDone} merged ${result.merged} drain(s). Dry counter reset.`)
  }
}

const stopReason =
  dryBatches >= 2 ? 'DRY_BATCHES'
  : batchesDone >= maxBatches ? 'MAX_BATCHES'
  : (stopFloor !== undefined && state.lastKnownAllowlistCount <= stopFloor) ? 'STOP_FLOOR'
  : (budget.total && budget.remaining() < 100_000) ? 'BUDGET'
  : 'UNKNOWN'

return {
  updatedState: state,
  summary: {
    batchesDone,
    totalMerged: batchResults.reduce((s, r) => s + r.merged, 0),
    totalSkipped: batchResults.flatMap(r => r.skipped),
    stopReason,
    batches: batchResults.map(r => ({
      merged: r.merged,
      skipped: r.skipped.length,
      findings: r.findings,
      mergeCommits: r.mergeCommits,
    })),
  },
}

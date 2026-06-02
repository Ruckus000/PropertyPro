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

function implementPrompt(pick, mainTipSha) {
  return `Implement A1 contract-allowlist drain for the route:
**${pick.route}**

## Worktree

- Worktree path: \`/Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/drain-${pick.route.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(-40)}\`
- Branch: \`a1/auto-drain-${pick.route.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(-40)}\`
- Base commit: \`${mainTipSha}\` (origin/main tip)

Create the worktree first:
\`\`\`bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
git worktree add <worktree-path> origin/main -b <branch>
cd <worktree-path>
\`\`\`

## Read the pre-migration source

\`\`\`bash
cat ${pick.route}
\`\`\`

## Read the service function's TS return type — CRITICAL

**Before writing the test fixture, you MUST \`Read\` the service function's
TypeScript return type from its source file in \`apps/web/src/lib/services/<service>.ts\`.
Read at least 30 lines around the function definition to see the return type
annotation in full. Then construct the mock fixture using ONLY fields present
in that real return type — do not invent additional fields (no \`connectedAt\`,
no \`generatedAt\`, no \`recipientCount\` unless they appear in the source).
Failing this rule produces tests that green-bar against fictional contracts.**

## Classification: ${pick.classification}

Use the matching canonical template:

- **SIMPLE_POST** / **SIMPLE_GET** — mirror \`apps/web/src/app/api/v1/elections/[id]/vote/{contract.ts,route.ts}\` and \`apps/web/__tests__/elections/elections-vote-route.test.ts\`.
- **PAGINATED** — mirror \`apps/web/src/app/api/v1/visitors/denied/{contract.ts,route.ts}\` (tri-state filter) or \`apps/web/src/app/api/v1/polls/{contract.ts,route.ts}\` (boolean filters + time-dependent service args). Set \`paginated: true\` on the contract.
- **MULTI_METHOD** — two contracts in one file (one per method).

## Corpus rules to follow

1. **Auth chain preserved verbatim** from pre-migration. Same order, same sync vs async behavior.
2. **\`assertNotDemoGrace\` runs BEFORE \`requireCommunityMembership\`** on any mutating method.
3. **Async helpers must be \`await\`ed**: \`requireFinanceEnabled\`, \`requirePlanFeature\`, \`requireActiveSubscriptionForMutation\`, \`requireVisitorLoggingEnabled\`, \`requireArcEnabled\`, \`requireViolationsEnabled\`, \`assertNotDemoGrace\`.
4. **Sync helpers are NOT \`await\`ed**: \`requireFinanceWritePermission\`, \`requireAccountingEnabled\`, \`requirePollsEnabled\`, \`requireStaffOperator\`, \`requireFinanceAdminWrite\`, \`requirePermission\`.
5. **Response model**:
   - Loose \`z.unknown()\` for services returning Drizzle rows (Date fields safeParse-fail tight schemas).
   - Tight \`z.object({...})\` only for synthesized return shapes with no Dates (e.g., \`{success: true}\`, \`{disconnected: true}\`).
6. **\`?? null\` coercion** on optional body fields where the service signature expects \`string | null\` (not \`string | undefined\`).
7. **Tri-state / boolean query filters parsed manually in handler** from \`new URL(req.url).searchParams\` — NOT declared in Zod (preserves \`'garbage' → undefined\` and \`'true' | '1' → true\` semantics).
8. **Time-dependent service args**: capture \`now: new Date()\` ONCE in handler before the paginate call.
9. **Test file naming**: \`apps/web/__tests__/<domain>/<slug>-route.test.ts\`. Delete any legacy \`__tests__/<domain>/route.test.ts\` that's incompatible — don't leave duplication.
10. **RBAC resource naming**: verify against \`packages/shared/src/rbac-matrix.ts\` BEFORE writing \`permission\` metadata. Plural/snake-case examples: \`'finances'\` (NOT \`'finance'\`), \`'work_orders'\` (NOT \`'workOrders'\`).
11. **Validation-layer discipline**: declare in contract OR parse in handler, NEVER both. The runner has already validated by the time the handler runs.
12. **Business-rule error messages preserved byte-identical** when consumers might surface \`json.error?.message\`.

## File list

1. **CREATE** \`<route-dir>/contract.ts\` with the contract(s) + docblock explaining auth chain, behavior changes, response model rationale.
2. **REWRITE** \`<route-dir>/route.ts\` to use \`runRoute(contract, handler)\`. Preserve auth chain.
3. **CREATE** \`apps/web/__tests__/<domain>/<slug>-route.test.ts\` mirroring the canonical template structure (vi.hoisted mocks, beforeEach setup, request helpers).
4. **DELETE** any legacy incompatible test file.
5. **EDIT** \`scripts/verify-contracts.ts\` — remove the one allowlist line for this route.

## Test coverage minimums

- Happy path with required fields.
- Happy path with optional fields omitted (assert \`?? null\` coercion).
- 401 unauth.
- 400 per body validation field.
- 400 \`params.id = 'abc'\` (non-numeric) AS A SEPARATE CASE from 400 \`params.id = '0'\` (zero). Symmetric on both methods if multi-method.
- 403 per auth gate (assert downstream gates NOT called when this gate fires).
- For paginated GETs: missing-cursor and with-cursor happy paths, invalid pageSize.
- x-request-id null forwarding (header absent, assert service called with \`null\` at correct positional index).

## Local checks

Run BEFORE opening the PR:

\`\`\`bash
pnpm install --silent
pnpm --filter @propertypro/api-contract build
pnpm guard:contracts          # Expect Contracted +N, Allowlist -1
pnpm typecheck
cd apps/web && pnpm exec vitest run __tests__/<domain>/<slug>-route.test.ts
\`\`\`

If any check fails, fix and re-run. If a check repeatedly fails and you can't resolve, return \`{ok: false, reason: "<specific error>"}\`.

## Open the PR

\`\`\`bash
gh pr create --title "Drain ${pick.route} to runRoute (A1 auto-drain)" --body "$(cat <<'EOF'
## Summary
- Migrates \`${pick.route}\` from \`withErrorHandler(async ...)\` to \`withErrorHandler(runRoute(contract, ...))\`.
- Auth chain preserved verbatim. Wire shape \`{ data: ... }\` byte-identical.

## Allowlist delta
- KNOWN_UNCONTRACTED_ROUTES: ${'${oldCount}'} → ${'${newCount}'}

## Test plan
- [x] pnpm --filter @propertypro/api-contract build
- [x] pnpm guard:contracts
- [x] pnpm typecheck
- [x] pnpm --filter @propertypro/web exec vitest run __tests__/<domain>/<slug>-route.test.ts

🤖 Auto-drained via drain-loop workflow
EOF
)"
\`\`\`

Capture the PR URL and PR number from the gh output.

## Return

Use StructuredOutput with this shape:

\`\`\`
{
  ok: true,
  prUrl: "https://github.com/.../pull/XXX",
  prNumber: XXX,
  branch: "<branch>",
  worktreePath: "<worktree-path>",
  contractsDelta: <int>,    // from guard:contracts output
  allowlistDelta: -1,
  localChecksOk: true,
}
\`\`\`

Or on failure:

\`\`\`
{
  ok: false,
  reason: "<specific error message>",
  worktreePath: "<worktree-path>",  // so the orchestrator can clean up
}
\`\`\`
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

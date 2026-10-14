// Whole-repo refactor audit, ponytail lens: 8 read-only dimension auditors →
// one adversarial verifier per dimension (with planted canaries) → one
// synthesized report.
//
// Invoked via:
//   Workflow({ scriptPath: '.claude/workflows/refactor-audit.workflow.js', args: {
//     dateIso: 'YYYY-MM-DD', root: '<abs repo root>', headSha: '<sha>',
//     baseSha: '<previous audit sha>', groundTruth: '<markdown>',
//     dimensions: ['C'],   // optional — run a subset (dry-check); omit for all 8
//   }})
//
// The orchestrating session builds `groundTruth` first (guard snapshot,
// deferral ledger, deltas, load profile, settled decisions, never-cut list) —
// this script hard-codes NO repo counts, because hard-coded counts are what
// made the 2026-07 version of this file wrong by 2026-09.
//
// Output: <root>/docs/audits/<dateIso>-ponytail-audit.md (written by the
// synthesis agent; the session re-checks must-fix evidence and commits).
//
// Lens: github.com/dietrichgebert/ponytail (learned from, not installed) —
// read everything, recommend the smallest fix, rank bugs → security/data loss
// → scale → untested risk → slow → bloat, and treat a deferral that names its
// trigger as a decision rather than a defect.
//
// Why verifiers get canaries: the 2026-09-22 run's verifier rejected 0 of 65
// findings — it proved the facts were true, not that the work was worth doing,
// and humans trimmed Phase 3 afterwards. Each verifier now judges two planted
// findings (one false, one true-but-settled); one it lets through downgrades
// its whole batch to UNCHECKED.
//
// Sandbox constraints: no filesystem, no clock, no RNG; self-contained; meta
// is a pure literal.

export const meta = {
  name: 'refactor-audit',
  description: 'Whole-repo ponytail audit: 8 dimension auditors → canary-calibrated adversarial verifiers → one report + deferral ledger',
  whenToUse: 'When a fresh codebase-health audit is wanted. The session must build args.groundTruth first (see header).',
  phases: [
    { title: 'Audit' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { dateIso, root, headSha, baseSha, groundTruth, dimensions: onlyDims } = parsedArgs ?? {}
if (!dateIso) throw new Error('args.dateIso is required (the sandbox has no clock)')
if (!root) throw new Error('args.root is required (absolute repo root)')
if (!groundTruth) throw new Error('args.groundTruth is required — build it before running')

const REPORT_PATH = `${root}/docs/audits/${dateIso}-ponytail-audit.md`

// ---------- Schemas ----------

const DIM_KEYS = ['M', 'T', 'W', 'S', 'P', 'R', 'E', 'C']
const RUNGS = [
  '1-need-not-exist', '2-already-in-repo', '3-platform-or-stdlib',
  '4-installed-dep', '5-one-line', '6-minimum-code', 'correctness-fix',
]

const FINDING_PROPS = {
  id: { type: 'string' },
  dimension: { enum: DIM_KEYS },
  severity: { enum: ['must', 'should', 'nice'] },
  title: { type: 'string' },
  fileLine: { type: 'string' },
  whatThisIs: { type: 'string' },
  problem: { type: 'string' },
  fix: { type: 'string' },
  ifWeSkip: { type: 'string' },
  failureScenario: {
    type: 'object',
    properties: { trigger: { type: 'string' }, path: { type: 'string' }, outcome: { type: 'string' } },
  },
  ladderRung: { enum: RUNGS },
  netLines: { type: 'integer' },
  depsRemoved: { type: 'integer' },
  loadAtWhichItBites: { type: 'string' },
  evidenceCommands: { type: 'array', items: { type: 'string' } },
  existingDecision: { type: 'string' },
  testCover: { enum: ['none', 'mocked-only', 'direct', 'n/a'] },
}
const FINDING_REQUIRED = [
  'id', 'dimension', 'severity', 'title', 'fileLine', 'whatThisIs', 'problem',
  'fix', 'ifWeSkip', 'ladderRung', 'evidenceCommands', 'testCover',
]

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['verifiedBaseline', 'assumedLoad', 'healthNotes', 'findings', 'consideredAndDropped', 'notChecked'],
  properties: {
    verifiedBaseline: { type: 'string' },
    assumedLoad: { type: 'string' },
    healthNotes: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: { type: 'object', required: FINDING_REQUIRED, properties: FINDING_PROPS } },
    consideredAndDropped: {
      type: 'array',
      items: { type: 'object', required: ['what', 'why'], properties: { what: { type: 'string' }, why: { type: 'string' } } },
    },
    notChecked: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICTS = ['CONFIRMED', 'CORRECTED', 'SHRUNK', 'DEFER', 'REJECTED']
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['verdicts', 'baselineCorrections'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'note'],
        properties: {
          id: { type: 'string' },
          verdict: { enum: VERDICTS },
          note: { type: 'string' },
          deferTrigger: { type: 'string' },
          // Only the fields that change (CORRECTED/SHRUNK): fileLine, fix,
          // evidenceCommands, netLines, severity, ladderRung, failureScenario…
          patch: { type: 'object', properties: FINDING_PROPS },
        },
      },
    },
    baselineCorrections: { type: 'string' },
  },
}

const REPORT_SCHEMA = {
  type: 'object',
  required: ['reportPath', 'headlineCount', 'mustFix', 'deferredCount', 'reportLines'],
  properties: {
    reportPath: { type: 'string' },
    headlineCount: { type: 'integer' },
    mustFix: { type: 'array', items: { type: 'string' } },
    deferredCount: { type: 'integer' },
    reportLines: { type: 'integer' },
    notes: { type: 'string' },
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

// ---------- Shared prompt fragments ----------

const READ_ONLY = `## Hard rules — read-only
- Repo root: \`${root}\` at HEAD \`${headSha ?? '(see ground truth)'}\`. Run every command from there.
- You may: read files, grep/find/wc, \`git log/show/diff\`, read-only \`gh run list\` / \`gh api\` GETs,
  and guard scripts in check mode.
- You may NOT: edit or create files, run anything with --fix/--write/--write-baseline, run migrations,
  seeds or tests that write, mutate git, install packages, query any production database, or read
  \`.env.local\` (it holds production secrets).
- Every count or line reference you assert must come with the EXACT command that produced it, in
  \`evidenceCommands\` — the verifier re-runs them verbatim.`

const LENS = `## The lens (ponytail — "the best code is the code you never wrote")
- Lazy about the SOLUTION, never about READING. Before filing, read the code the finding touches end to
  end: route → service → scoped client → table, plus its callers and its tests. A finding about code you
  have not traced is not allowed.
- Priority, which is also severity order: bugs → security & data loss → scale → risky logic without a
  test → slow code → bloat. A bloat finding never outranks a bug.
- The ladder — every \`fix\` names the first rung that holds (\`ladderRung\`): (1) does it need to exist?
  (2) already in this repo? (3) platform/std-lib (a house component beats a native one)? (4) an installed
  dependency (never add one for a few lines)? (5) one readable line? (6) minimum new code. "Create a new
  shared abstraction" is allowed only with ≥3 copies AND no existing home. Prefer deletion over new layers.
- Split by responsibility, never by line count. "This file is long" is never a finding by itself.
- A comment naming its limit + upgrade trigger (\`ponytail:\`, \`// route-gate:\`, \`// AUTHZ:\`,
  \`design-tokens:exempt\`) or a deferral row in an audit doc is a DECISION. Challenge one only with a
  concrete failure or by showing its trigger has FIRED (cite the commit).
- Before calling anything unused, grep the WHOLE tree: apps/ packages/ scripts/ e2e/ .github/
  vercel.json next.config.* package.json — including string literals and dynamic \`import()\`.
- must/should findings need \`failureScenario\`: a trigger (actor, input or schedule) → the code path with
  line numbers → the bad outcome. No scenario → it is at most \`nice\`.
- Judge scale against the measured load in the ground truth. State \`loadAtWhichItBites\` for any scale
  claim. But one real customer is enough load for a money, auth or data-loss defect.
- Never cut anything on the ground truth's never-cut list. Never re-litigate a settled decision.
- Zero findings is a valid answer. At most 3 \`must\` per dimension. Do not pad.
- Report what you skipped: \`consideredAndDropped\` (with why — this calibrates the next audit) and
  \`notChecked\`.
- Ownership: a finding belongs to the dimension of the WORST outcome if it is skipped. If something you
  found belongs to another dimension, list it in \`consideredAndDropped\` as "→ <dim>: <what>" rather
  than filing it.`

const RETURN_RULES = `## Return
End your turn by calling StructuredOutput with the schema — even with zero findings. Ids are
\`<DIM>-NN\` (e.g. M-01). \`fileLine\` is repo-relative \`path:line\`. \`netLines\` is negative for a
deletion. \`assumedLoad\` restates, in one line, the load you judged against.`

function groundTruthBlock() {
  return `## Shared ground truth (measured by the orchestrator — build on it, do not re-derive)

${groundTruth}`
}

// ---------- The eight dimensions ----------

const DIMENSIONS = [
  {
    key: 'M',
    label: 'money',
    brief: `You are the **M — MONEY** auditor: anything that computes, parses, stores or moves money.

Owns: the Stripe webhook route and \`stripe-webhook-service.ts\`; \`finance-service.ts\`; the money crons
(generate-assessments, assessment-overdue, late-fee-processor, payment-reminders, coupon-sync-retry,
revenue-snapshot); leases money (Leases v3, #1306); \`scripts/verify-stripe-mode.ts\` (unwired — you
decide: wire it or delete it). **Admin:** \`apps/admin/src/lib/server/billing{,-actions}.ts\` and the
admin billing routes are yours.

Hunt:
1. Idempotency under every SECOND trigger path, not just Stripe re-delivery: Vercel retry; the admin
   Health "Retry" button (POSTs \`internal/<slug>\` with CRON_SECRET) racing the scheduled run of a money
   cron; a double-click; two distinct events for one charge (security-audit gap 3: \`ledger_entries\`
   has no unique key).
2. The finance fence at \`finance-service.ts:2121\` — its trigger FIRED (3.T2 landed 2026-09-30). Is the
   fence+writes transaction now buildable? What breaks today?
3. The money-representation boundary: integer cents almost everywhere, \`numeric\` dollar strings in
   Leases v3 compared via \`Number()\`, \`parseFloat\` conversions. Find a concrete wrong answer
   (rounding, string compare, NaN) or drop it.
4. Admin change-plan idempotency key (\`billing-actions.ts:424\`) — read its §2 rationale FIRST; file only
   a concrete sequence that charges or skips wrongly.
5. Money logic whose only tests mock the service wholesale.

Not yours: display-only formatting → R. Security-audit #5 (Connect account binding) is already filed —
do not re-file.`,
  },
  {
    key: 'T',
    label: 'trust',
    brief: `You are the **T — TRUST** auditor: who can reach what. Today's security audit
(\`docs/audits/2026-10-13-security-audit.md\`) already swept auth, XSS, tokens, payments and RLS — do
NOT repeat it. Read its report first. Your job is what it explicitly left OPEN:

1. **Shared gate-helper internals** — it ASSUMED \`requireCommunityMembership\`,
   \`resolveEffectiveCommunityId\`, \`requirePlanFeature\` (new in #1368), \`requirePermission\`,
   \`requireRootManager\`, \`requireAdminPageSession\`, \`requirePlatformAdmin\` are correct. A bug there is
   systemic. Read each one line by line: soft-deleted memberships, a soft-deleted community, a demo-grace
   community, support-session (impersonation) context, the header-vs-query mismatch, plan downgrade
   mid-session.
2. **Delta census**: apply the census method (\`docs/audits/2026-09-28-route-authz-census.md\`, classes
   HELPER_GATED / SELF_SCOPED / PUBLIC_BY_DESIGN / COMMUNITY_OPEN / SUSPECT) to the 20 new web routes in
   the ground truth AND, per verb, to the admin API routes (the census excluded admin). Remember 4 of the
   census's 5 leaks were INSIDE handlers that already called a gate — read the handler body, not just
   the gate call.
3. **Admin sign-in throttle** (security-audit gap 2): admin grants platform-wide super_admin, and its
   limiter is a per-instance in-memory Map (\`apps/admin/src/middleware.ts\`) on Fluid compute.
4. **Log injection / PII in structured logs** (gap 4): user free text concatenated into log messages,
   PII in Sentry breadcrumbs or console output.
5. **Fake-adapter routes** live with no UI (calendar/google, accounting): what can an HTTP client do
   with them today (corpus lens 1)?
6. Duplicate admin APIs: the web twins were deleted (ponytail #20). Check nothing re-adds a
   platform-admin route under \`apps/web/src/app/api/v1/admin/*\` beside \`apps/admin/src/app/api/admin/*\`.

Treat \`// route-gate:\` and \`// AUTHZ:\` claims as decisions (challenge only with a concrete leak). Do
NOT re-file any of the security audit's 22 findings except as a regression or an incomplete fix.`,
  },
  {
    key: 'W',
    label: 'writes',
    brief: `You are the **W — WRITES** auditor: data loss, concurrency, and non-money background work.

Owns:
- \`apps/web/src/lib/cron/with-cron-job.ts\` — no overlap lock. Compare each cron's real runtime path
  with its schedule (*/5 community-export-worker, */15 reminders/digests, scheduled-site-publish).
  What happens when two runs overlap, or a run exceeds the interval?
- Queue claim semantics: \`export-job-service.ts\`, the notification digest queue, \`provisioning_jobs\`.
- The twilio and inbound-email webhooks (\`twilio-webhook-service.ts\`, \`support-inbox/inbound-email-service.ts\`
  — zero direct tests): duplicate delivery, partial failure.
- The deletion lifecycle: \`account-lifecycle-service.ts\`, \`lib/account-lifecycle/purge-guards.ts\`,
  the cron route, and **admin** \`apps/admin/src/lib/server/deletion-requests.ts\` intervene/recover.
- \`.github/workflows/reset-demo.yml\` + \`scripts/reset-demo.ts\` run against PRODUCTION nightly, now that
  Stripe is live and real customers are imminent; backstop \`scripts/lib/seed-safety.ts\`.
- Hard deletes (scoped \`hardDelete\`, \`site-blocks-service.ts\` raw delete, admin hard-delete routes) and
  storage-object vs DB-row ordering (an orphaned object, or a row pointing at a deleted object).
- Module-level mutable state under Fluid compute's concurrent instance reuse (web middleware
  \`tenantCache\`, the sanitizer depth counter, telemetry maps).
- One-off repair scripts in \`scripts/\` that can still reach prod.
- The trigger-less \`ponytail:\` markers in your area (\`residents/route.ts:317\`, \`import-units/route.ts:73\`,
  \`starter-pack-service.ts:137\`): is the stated limit still true, and does it need a trigger?

Not yours: money crons and Stripe → M. Pure throughput → P.`,
  },
  {
    key: 'S',
    label: 'statute',
    brief: `You are the **S — STATUTE** auditor: Florida statutory logic. This is the never-cut zone —
correctness only, no lean cuts (except consolidating duplicated deadline math that could drift).

Owns: \`packages/shared/src/compliance/{posting-deadline,fine-caps,templates}.ts\`;
\`apps/web/src/lib/compliance/notice-window.ts\`; \`lib/meetings/{notice-warning,meeting-status}.ts\`;
\`lib/utils/{compliance-calculator,meeting-calculator}.ts\`; \`violations-service.ts\` (13 of 14 tests mock
it); \`lib/violations/{hearing-notice-warning,fining-committee,arc-actions}.ts\`; \`notice-consent-service.ts\`
(e-notice consent, migration 0090); \`violation-notice-pdf.ts\`; ARC denial reasons (HB 1203).

Hunt: boundary errors at the 30-day posting / 14-day owner / 48-hour board / 14-day hearing windows;
DST and timezone (a \`date-fns\` local-calendar computation where elapsed time is meant, or vice versa);
the deadline direction rule (an adjustment must never shorten a statutory notice); duplicated deadline
math that could drift; statutory logic with no non-mocked test.

Elections: only check that the gate is airtight — no route or UI path can run an election without
\`0062\` applied and attorney review recorded. Do not propose enabling anything.

Read \`.claude/rules/florida-compliance.md\` as the spec, but flag where it disagrees with the code. You
may veto an R consolidation that would touch deadline math — say so in \`consideredAndDropped\`.
**Admin:** check whether any admin route or override edits compliance or notice state.`,
  },
  {
    key: 'P',
    label: 'scale',
    brief: `You are the **P — SCALE** auditor, calibrated to measured load. Every finding states the load at
which it bites, how that compares with the measured profile, and an OBSERVABLE numeric trigger (a row
count, a duration, an event name). A load-only finding is \`nice\` at most and expected to be DEFERRED by
the verifier. Anything wrong at load 1 belongs to W, M or T — hand it over.

Hunt: per-item queries inside loops (notification fan-out, digests, reminders); the \`fullTableRead\`
entries in \`call-ceilings-baseline.json\`; \`walkPaginated\`'s 2,000-row cap vs the \`*_truncated\` events;
serial sends (\`invitations/batch\`, \`document-share-service\`) vs the 300s function limit; client
request waterfalls on the heaviest pages (directory, site-editor, dashboard); the route JS budgets in
\`scripts/perf-check.ts\`; middleware per-request cost; cron runtime vs cron interval. **Admin:** the
console's server-computed signals and shell reads on every page.

Your most valuable output is the "load at which it bites" table — it becomes the triggers in the
deferral ledger. A finding that is already a ledger entry with an unfired trigger is not a finding.`,
  },
  {
    key: 'R',
    label: 'reuse',
    brief: `You are the **R — REUSE** auditor: ladder rungs 2–4 (already in the repo / platform / installed
dependency). Every finding names the canonical home that ALREADY EXISTS and has a negative \`netLines\`.

Hunt:
- web↔admin copies: Sentry configs and instrumentation, \`cron-auth.ts\`, navigation-progress-event,
  search-shortcut, security-header wrappers, \`cn\` ×3 (\`packages/ui\` exports one), admin
  \`with-error-handler\`/\`parse-body\` vs web's. Some copies are deliberate and say so in-file — read the
  reason before filing.
- Formatter sprawl: \`formatDate\` (no shared home exists — so is one justified?), display money
  formatters vs \`formatCents\`/admin \`billing/format.ts\`, status maps vs \`packages/ui/src/constants/status.ts\`
  and \`StatusBadge\`, hand-written community-type switches vs \`COMMUNITY_TYPE_DISPLAY_NAMES\`.
- Fetch helpers: the three private \`apiFetch\` copies (also a probable bug — they read the error message
  from the wrong envelope level; file the bug, the dedupe is the fix) and other private
  requestJson/postJson/fetchJson copies vs \`lib/api/request-json.ts\`.
- \`useDebouncedValue\` private in \`hooks/use-help.ts\` vs hand-written debounce copies.
- Unique-violation predicates outside \`lib/db/postgres-error.ts\` (the digest-queue fork is documented
  — leave it); OAuth-state validation ×3 vs \`oauth-state.ts\`; password rules hard-coded in
  \`account-settings-client.tsx\` vs \`PASSWORD_POLICY\`.
- Hand-written raw-PDF writers vs \`pdf-lib\`/puppeteer; \`lib/markdown.ts\` vs \`next-mdx-remote\`/\`marked\`
  (T rules on sanitizer equivalence — note it); 4 sanitizer modules over 2 libraries.

S may veto anything touching deadline math. The cursor codecs are deferred SVC-01 — file them only if its
trigger fired (a new list endpoint needing a non-id order, e.g. in Leases v3 or Directory v2).
The \`components/ui/*\` re-export shims are settled.`,
  },
  {
    key: 'E',
    label: 'exist',
    brief: `You are the **E — EXIST** auditor: ladder rung 1 — should this exist at all? Before declaring
anything dead, grep the WHOLE tree (see the lens). \`/pdfjs-test\` looks like debug code but CI's e2e
depends on it — that is the trap to avoid.

Hunt:
- Fake adapters with services and live routes but no UI caller: Google Calendar
  (\`lib/calendar/google-calendar-adapter.ts\`, \`calendar-sync-service.ts\`, \`api/v1/calendar/google/*\`)
  and QuickBooks/Xero (\`lib/accounting/adapters.ts\`, \`accounting-connectors-service.ts\`,
  \`api/v1/accounting/*\`). Note #1368 just added plan gates to them — someone is maintaining dead code.
  File as delete-pending-product-confirm.
- \`USE_COMMAND_PALETTE_V2 = true\` hard-coded → dead V1 palette + \`cmdk\`; feature-registry \`audience\`
  (written, never read); zero-importer modules (\`validate-upload.ts\`, test-only \`pdf-export.ts\`).
- Unused dependencies in every package.json (web \`marked\`, \`prettier\`, \`@dnd-kit/utilities\`,
  \`@types/qrcode\` in runtime deps; admin \`codemirror\` ×5) — check \`next.config\` transpile lists, tsup
  externals and peer requirements before filing.
- Unwired verify scripts (except \`verify-stripe-mode\` → M).
- Env drift: \`.env.example\` vars never read; vars read but undocumented. \`OPERATIONS_HUB_CREATE_SHEETS\`
  read in a \`'use client'\` module without \`NEXT_PUBLIC_\` is a probable BUG — file it as one.
- One-implementation interfaces with test-only setters (\`sms-provider\`); single-export, single-importer
  modules (inline only if not a test seam).
- Tests that pin nothing: file one only if a mental revert-check says it stays green with the behavior
  deleted (assertions only on mocks being called with whatever they were given).
- Completed one-off scripts (\`backfill-*\`, \`remediate-*\`, \`repair-*\`).
**Admin:** its own dead components, routes and deps count.

Not yours: "risky logic without a test" → the domain owner.`,
  },
  {
    key: 'C',
    label: 'truth',
    brief: `You are the **C — TRUTH** auditor: do the agent context, the docs, and the protections we claim
actually match reality?

1. **Agent context** — every checkable factual claim in \`CLAUDE.md\`, \`AGENTS.md\`, \`DESIGN.md\`,
   \`.claude/rules/*.md\`, \`.claude/phase-run/corpus.md\`, \`.claude/skills/*.md\`, \`.claude/workflows/*\`
   headers, ADR status sections, \`docs/LAUNCH-BLOCKERS.md\`, and the memory index
   \`/Users/jphilistin/.claude/projects/-Users-jphilistin-Documents-Coding-PropertyPro/memory/MEMORY.md\`
   with the linked memories that name a file, flag or command. Verify against the repo and CI (read-only
   \`gh run list\` / \`gh api\`). Classify each problem as FALSE (contradicts reality), STALE-COUNT (a
   number another system owns — the fix is to delete the number and point at the command), or DUPLICATED
   (the same rule in several files — pick one home). Agents act on these files every session, so a FALSE
   claim is a real defect. Group them: one finding per file, with a list of claims.
2. **Deferral ledger** (the \`/ponytail-debt\` pass): for every seeded deferral — trigger present?
   observable? fired (cite the commit)? A fired trigger with the marker still open is a finding. A
   trigger-less marker is a finding only if the limit can bite; propose its trigger. Note that the
   \`ponytail:\` convention is defined nowhere an agent loads it.
3. **Protections that claim to run**: GUARDS in \`scripts/run-lint-guards.mjs\` vs the \`lint\` script;
   \`apps/web/e2e/ci-safe-specs.json\` vs \`expectedTestCount\`; the lint guards with no self-test — could
   any pass while checking nothing (empty scan root, swallowed exit status)?; \`.skip\`/\`.fixme\` counts
   and whether each is env-conditional; \`docs/LOAD_TEST_RESULTS.md\` (an empty template).
4. **Comment bloat**: changelog-in-code (drain history, census tallies, "previously…") in \`contract.ts\`
   files and elsewhere. Keep "why"; history belongs in git. NEVER propose touching \`AUTHZ:\`,
   \`route-gate:\`, \`ponytail:\`, \`design-tokens:exempt\` claim comments. File this as at most one or two
   aggregate findings with a sampled rule, not per file.`,
  },
]

function auditorPrompt(dim) {
  return `${dim.brief}

${READ_ONLY}

${LENS}

${groundTruthBlock()}

${RETURN_RULES}
Use \`dimension: "${dim.key}"\`.`
}

// ---------- Canaries ----------
// Two planted findings per dimension, shaped exactly like real ones.
// A — false fact: the file or line does not exist. Must come back REJECTED.
// B — true but settled / not worth it. Must come back REJECTED (or DEFER, for a
//     load-only one). Every premise here was checked at 70cefc77a.

function canary(dim, id, f) {
  return {
    id,
    dimension: dim,
    testCover: 'n/a',
    netLines: 0,
    depsRemoved: 0,
    existingDecision: '',
    loadAtWhichItBites: '',
    ...f,
  }
}

const CANARIES = {
  M: [
    { kind: 'false', f: { severity: 'must', title: 'Ledger postings stored as floats', fileLine: 'apps/web/src/lib/services/ledger-posting-service.ts:142', whatThisIs: 'postLedgerEntries converts amounts with parseFloat before insert', problem: 'float rounding corrupts cent balances', fix: 'store integer cents', ifWeSkip: 'balances drift by cents', ladderRung: 'correctness-fix', failureScenario: { trigger: 'any assessment payment', path: 'ledger-posting-service.ts:142 parseFloat(amount)', outcome: 'balance off by 0.01' }, evidenceCommands: ['grep -n parseFloat apps/web/src/lib/services/ledger-posting-service.ts'] } },
    { kind: 'settled', f: { severity: 'should', title: 'Stripe webhook route is not on runRoute', fileLine: 'apps/web/src/app/api/v1/webhooks/stripe/route.ts:1', whatThisIs: 'the webhook handler is hand-written instead of contracted', problem: 'it bypasses the contract layer', fix: 'convert it to runRoute with a contract.ts', ifWeSkip: 'contract coverage stays below 100%', ladderRung: '2-already-in-repo', failureScenario: { trigger: 'a malformed event body', path: 'route.ts', outcome: 'not schema-validated' }, evidenceCommands: ["grep -n 'webhooks/stripe' scripts/verify-contracts.ts"] } },
  ],
  T: [
    { kind: 'false', f: { severity: 'must', title: 'Resident export route has no gate', fileLine: 'apps/web/src/app/api/v1/residents/export/route.ts:31', whatThisIs: 'GET exports the full resident roster', problem: 'no requirePermission call', fix: "add requirePermission(membership, 'residents', 'read')", ifWeSkip: 'any member downloads every resident PII', ladderRung: 'correctness-fix', failureScenario: { trigger: 'a tenant calls GET', path: 'residents/export/route.ts:31', outcome: 'full roster returned' }, evidenceCommands: ["grep -n 'requirePermission' apps/web/src/app/api/v1/residents/export/route.ts"] } },
    { kind: 'settled', f: { severity: 'must', title: 'cron-health internal route is ungated', fileLine: 'apps/web/src/app/api/v1/internal/cron-health/route.ts:71', whatThisIs: 'GET has no requireCronSecret call', problem: 'anyone can read cron state', fix: 'add requireCronSecret(req)', ifWeSkip: 'job names and timestamps are public', ladderRung: '5-one-line', failureScenario: { trigger: 'anonymous GET', path: 'cron-health/route.ts:71', outcome: 'job slugs and last-run times returned' }, evidenceCommands: ["grep -n 'requireCronSecret' apps/web/src/app/api/v1/internal/cron-health/route.ts"] } },
  ],
  W: [
    { kind: 'false', f: { severity: 'must', title: 'Cron lock released before the job finishes', fileLine: 'apps/web/src/lib/cron/cron-lock.ts:57', whatThisIs: 'releaseLock runs in a finally that fires before the awaited job', problem: 'overlapping runs double-process', fix: 'await the job before releasing', ifWeSkip: 'duplicate digests', ladderRung: 'correctness-fix', failureScenario: { trigger: 'two */15 ticks', path: 'cron-lock.ts:57', outcome: 'job runs twice' }, evidenceCommands: ['sed -n 50,60p apps/web/src/lib/cron/cron-lock.ts'] } },
    { kind: 'settled', f: { severity: 'should', title: '0062_secret_ballot is stranded below the ledger tip', fileLine: 'packages/db/migrations/0062_secret_ballot.sql:1', whatThisIs: 'a merged migration never applied to prod', problem: 'drizzle-kit migrate will skip it forever', fix: 'apply 0062 to production now', ifWeSkip: 'schema drift persists', ladderRung: '6-minimum-code', failureScenario: { trigger: 'next drizzle-kit migrate', path: 'drizzle ledger', outcome: '0062 skipped' }, evidenceCommands: ['ls packages/db/migrations/0062_secret_ballot.sql'] } },
  ],
  S: [
    { kind: 'false', f: { severity: 'must', title: 'Posting deadline uses local-calendar addDays', fileLine: 'packages/shared/src/compliance/posting-deadline.ts:212', whatThisIs: 'calculatePostingDeadline adds 30 days with date-fns addDays', problem: 'DST shifts the deadline by an hour', fix: 'add exact elapsed ms', ifWeSkip: 'a document posted near DST is scored late', ladderRung: 'correctness-fix', failureScenario: { trigger: 'document created 2026-10-10', path: 'posting-deadline.ts:212', outcome: 'deadline one hour early' }, evidenceCommands: ['sed -n 205,215p packages/shared/src/compliance/posting-deadline.ts'] } },
    { kind: 'settled', f: { severity: 'should', title: 'Violation notice PDFs are generated for no community', fileLine: 'apps/web/src/lib/violations/common.ts:94', whatThisIs: 'noticePdfGenerationEnabled is off everywhere', problem: 'boards cannot produce statutory hearing notices', fix: 'default noticePdfGenerationEnabled to true', ifWeSkip: 'hearing notices are produced by hand', ladderRung: '5-one-line', failureScenario: { trigger: 'a board schedules a hearing', path: 'violations/common.ts:94', outcome: 'no PDF available' }, evidenceCommands: ["grep -rn 'noticePdfGenerationEnabled' apps/web/src/lib/violations/common.ts"] } },
  ],
  P: [
    { kind: 'false', f: { severity: 'should', title: 'Announcement feed issues one query per announcement', fileLine: 'apps/web/src/lib/services/announcement-feed-service.ts:88', whatThisIs: 'buildFeed loops announcements and loads authors one by one', problem: 'N+1 queries', fix: 'batch with inArray', ifWeSkip: 'feed slows linearly', ladderRung: '6-minimum-code', loadAtWhichItBites: '200 announcements', failureScenario: { trigger: 'dashboard load', path: 'announcement-feed-service.ts:88', outcome: '200 queries' }, evidenceCommands: ['sed -n 80,95p apps/web/src/lib/services/announcement-feed-service.ts'] } },
    { kind: 'settled', f: { severity: 'should', title: 'Lists load every page client-side through walkPaginated', fileLine: 'apps/web/src/lib/api/walk-paginated.ts:1', whatThisIs: 'walkPaginated fetches up to 2,000 rows before rendering', problem: 'large lists will be slow', fix: 'build cursor "Load more" UIs for every list', ifWeSkip: 'slow pages at scale', ladderRung: '6-minimum-code', loadAtWhichItBites: '>2,000 rows in one list', failureScenario: { trigger: 'a community with 2,500 documents', path: 'walk-paginated.ts', outcome: 'list truncated' }, evidenceCommands: ['wc -l apps/web/src/lib/api/walk-paginated.ts'] } },
  ],
  R: [
    { kind: 'false', f: { severity: 'should', title: 'Admin duplicates the web format-date module verbatim', fileLine: 'apps/admin/src/lib/utils/format-date.ts:1', whatThisIs: 'a byte-identical copy of apps/web/src/lib/utils/format-date.ts', problem: 'two copies drift', fix: 'move it to packages/shared and import from both', ifWeSkip: 'divergent date output', ladderRung: '2-already-in-repo', netLines: -40, failureScenario: { trigger: 'a fix to one copy', path: 'format-date.ts', outcome: 'admin and web show different dates' }, evidenceCommands: ['diff apps/admin/src/lib/utils/format-date.ts apps/web/src/lib/utils/format-date.ts'] } },
    { kind: 'settled', f: { severity: 'nice', title: 'components/ui re-export shims add an import layer', fileLine: 'apps/web/src/components/ui/button.tsx:1', whatThisIs: 'twelve one-line files re-export @propertypro/ui', problem: 'an indirection layer with no logic', fix: 'codemod every import to @propertypro/ui and delete the shims', ifWeSkip: 'one extra hop per import', ladderRung: '1-need-not-exist', netLines: -12, evidenceCommands: ['cat apps/web/src/components/ui/button.tsx'] } },
  ],
  E: [
    { kind: 'false', f: { severity: 'nice', title: 'moment is installed in web with zero imports', fileLine: 'apps/web/package.json:1', whatThisIs: 'the moment dependency', problem: 'unused dependency', fix: 'remove moment from apps/web/package.json', ifWeSkip: 'install weight', ladderRung: '1-need-not-exist', depsRemoved: 1, evidenceCommands: ["grep -n '\"moment\"' apps/web/package.json"] } },
    { kind: 'settled', f: { severity: 'should', title: 'pdfjs-test debug page ships in production', fileLine: 'apps/web/src/app/pdfjs-test/page.tsx:1', whatThisIs: 'a test page in the production route tree', problem: 'debug surface in prod', fix: 'delete apps/web/src/app/pdfjs-test', ifWeSkip: 'a stray page stays deployed', ladderRung: '1-need-not-exist', netLines: -60, evidenceCommands: ['ls apps/web/src/app/pdfjs-test'] } },
  ],
  C: [
    { kind: 'false', f: { severity: 'should', title: 'CLAUDE.md overstates the guard count', fileLine: 'CLAUDE.md:120', whatThisIs: 'CLAUDE.md says run-lint-guards.mjs bundles 41 guards', problem: 'the runner holds 34', fix: 'correct the number', ifWeSkip: 'agents expect guards that do not exist', ladderRung: '5-one-line', failureScenario: { trigger: 'an agent reads CLAUDE.md', path: 'CLAUDE.md:120', outcome: 'wrong expectation' }, evidenceCommands: ["grep -n '41 guards' CLAUDE.md"] } },
    { kind: 'settled', f: { severity: 'should', title: 'Web and admin page headers disagree', fileLine: 'apps/admin/src/components/shell/AdminPageHeader.tsx:1', whatThisIs: 'admin paints a visible h1 while web PageHeader renders it sr-only', problem: 'two inconsistent header conventions', fix: 'make admin render its h1 sr-only like web', ifWeSkip: 'inconsistent UI', ladderRung: '2-already-in-repo', failureScenario: { trigger: 'any admin page', path: 'AdminPageHeader.tsx', outcome: 'a different header style' }, evidenceCommands: ["grep -n 'sr-only' apps/web/src/components/shared/page-header.tsx"] } },
  ],
}

function pad2(n) { return n < 10 ? `0${n}` : `${n}` }

// Insert the two canaries at deterministic positions with ordinary-looking ids.
function withCanaries(dimKey, findings) {
  const n = findings.length
  const [a, b] = CANARIES[dimKey]
  const idA = `${dimKey}-${pad2(n + 1)}`
  const idB = `${dimKey}-${pad2(n + 2)}`
  const ca = canary(dimKey, idA, a.f)
  const cb = canary(dimKey, idB, b.f)
  const mid = Math.floor(n / 2)
  const list = [...findings.slice(0, mid), ca, ...findings.slice(mid), cb]
  return { list, canaryIds: { [idA]: a.kind, [idB]: b.kind } }
}

// ---------- Verifier ----------

const PRECEDENTS = `## Precedent — findings that were TRUE but NOT WORTH DOING (09-22 roadmap, trimmed by humans)
- "19 hand-rolled cursor helpers → one generic paginateOrdered": deferred — "all work and none has a defect".
- "Split the 1,446-line middleware": deferred — ~166 ordering assertions already pin it; splitting is churn.
- "Convert 156 hand-resolving routes to declared tenantScope": deferred — they already cross-check the
  header and a shrink-only ceiling pins them.
- "Extract site-editor panels / provisioning modules": deferred — extraction with no defect is cosmetic.
That audit's verifier REJECTED 0 of 65. Your job is to do better: get findings removed or shrunk.`

function verifierPrompt(dim, audit, list) {
  return `You are the adversarial verifier for the **${dim.key} (${dim.label})** dimension of a ponytail
audit of PropertyPro. Your job is to get findings REMOVED or SHRUNK. Your question for each one is
"what concretely breaks if we skip it?" — not merely "do the facts reproduce?".

${READ_ONLY}

${LENS}

${PRECEDENTS}

${groundTruthBlock()}

## The findings to judge (JSON)

\`\`\`json
${JSON.stringify(list, null, 2)}
\`\`\`

The auditor's baseline note: ${JSON.stringify(audit.verifiedBaseline)}

## For EVERY finding
1. Re-run every \`evidenceCommands\` entry verbatim. Check that every path and line exists.
2. Walk the \`failureScenario\` on the actual lines. Is it reachable? Under what real input or schedule?
3. Check it against the ground truth: a settled decision, the never-cut list, a deferral whose trigger has
   NOT fired, a finding the 2026-10-13 security audit already filed, or a \`route-gate:\`/\`AUTHZ:\`/
   \`ponytail:\` decision → REJECTED, unless it proves a defect or a fired trigger.
4. Apply the ladder to the fix. If a lower rung holds (delete instead of extract, reuse instead of
   write, one line instead of a helper), return SHRUNK with the smaller \`fix\` in \`patch\`.
5. Lean findings (R/E): run the whole-tree grep yourself before accepting "unused" or "duplicate".

## Verdicts
- CONFIRMED — stands as filed.
- CORRECTED — real, but a number, path or line drifted; put the corrected fields in \`patch\`.
- SHRUNK — real, but the fix is bigger than needed; put the smaller fix (and \`netLines\`) in \`patch\`.
- DEFER — real but load-only; MUST include \`deferTrigger\`: an observable number or event. **Not allowed
  for money, auth/tenancy, statutory or data-loss findings** — one real customer is enough load.
- REJECTED — evidence does not reproduce, the path doesn't exist, the scenario is unreachable, or it hits
  a settled decision / never-cut item / unfired deferral / already-filed finding.

Every verdict needs a one-to-three sentence \`note\` saying what you checked. Return a verdict for every
id in the list. Put corrections to the auditor's baseline in \`baselineCorrections\` ("" if none).
End by calling StructuredOutput.`
}

function applyVerdicts(list, canaryIds, verified) {
  const byId = new Map((verified?.verdicts ?? []).map((v) => [v.id, v]))
  const canaryResults = Object.entries(canaryIds).map(([id, kind]) => {
    const v = byId.get(id)
    const verdict = v?.verdict ?? 'MISSING'
    const caught = kind === 'false' ? verdict === 'REJECTED' : verdict === 'REJECTED' || verdict === 'DEFER'
    return { id, kind, verdict, caught, note: v?.note ?? '' }
  })
  const calibrated = canaryResults.every((c) => c.caught)
  const real = list.filter((f) => !(f.id in canaryIds))
  const judged = real.map((f) => {
    const v = byId.get(f.id)
    if (!v) return { ...f, verdict: 'UNCHECKED', verifierNote: 'verifier returned no verdict' }
    let merged = { ...f, ...(v.patch ?? {}), id: f.id, dimension: f.dimension }
    let verdict = v.verdict
    let note = v.note
    if (v.verdict === 'DEFER') merged = { ...merged, deferTrigger: v.deferTrigger ?? '(missing trigger)' }
    if (!calibrated && ['CONFIRMED', 'CORRECTED', 'SHRUNK'].includes(verdict)) {
      note = `[verifier failed a canary — downgraded from ${verdict}] ${note}`
      verdict = 'UNCHECKED'
    }
    return { ...merged, verdict, verifierNote: note }
  })
  return { judged, canaryResults, calibrated }
}

// ---------- Stage A+B: audit → verify, pipelined per dimension ----------

const selected = Array.isArray(onlyDims) && onlyDims.length
  ? DIMENSIONS.filter((d) => onlyDims.includes(d.key))
  : DIMENSIONS
if (selected.length === 0) throw new Error(`args.dimensions matched nothing (valid: ${DIM_KEYS.join(', ')})`)
log(`Ponytail audit (dateIso=${dateIso}, head=${headSha ?? '?'}): dimensions ${selected.map((d) => d.key).join(', ')} → ${REPORT_PATH}`)

phase('Audit')

const results = await pipeline(
  selected,
  (dim) =>
    safeAgent(auditorPrompt(dim), { schema: AUDIT_SCHEMA, label: `audit:${dim.key}-${dim.label}`, phase: 'Audit' })
      .then((audit) => ({ dim, audit })),
  async ({ dim, audit }) => {
    if (!audit) {
      log(`${dim.key}: auditor failed — reported as a coverage gap`)
      return { key: dim.key, label: dim.label, failed: true, findings: [], canaryResults: [], calibrated: false }
    }
    const musts = audit.findings.filter((f) => f.severity === 'must').length
    if (musts > 3) log(`${dim.key}: auditor filed ${musts} must-fix (cap is 3) — the verifier and synthesis will see all`)
    // Verify even with zero real findings: the canaries still calibrate the dimension.
    const { list, canaryIds } = withCanaries(dim.key, audit.findings)
    const verified = await safeAgent(verifierPrompt(dim, audit, list), {
      schema: VERIFY_SCHEMA, label: `verify:${dim.key}-${dim.label}`, phase: 'Verify',
    })
    const base = {
      key: dim.key, label: dim.label, failed: false,
      assumedLoad: audit.assumedLoad,
      healthNotes: audit.healthNotes,
      consideredAndDropped: audit.consideredAndDropped,
      notChecked: audit.notChecked,
    }
    if (!verified) {
      log(`${dim.key}: verifier failed — ${audit.findings.length} findings kept as UNCHECKED`)
      return {
        ...base,
        verifiedBaseline: audit.verifiedBaseline,
        findings: audit.findings.map((f) => ({ ...f, verdict: 'UNCHECKED', verifierNote: 'verifier agent failed' })),
        canaryResults: [], calibrated: false,
      }
    }
    const { judged, canaryResults, calibrated } = applyVerdicts(list, canaryIds, verified)
    const tally = (v) => judged.filter((f) => f.verdict === v).length
    log(`${dim.key}: ${audit.findings.length} filed → confirmed ${tally('CONFIRMED')}, corrected ${tally('CORRECTED')}, shrunk ${tally('SHRUNK')}, deferred ${tally('DEFER')}, rejected ${tally('REJECTED')}, unchecked ${tally('UNCHECKED')}; canaries ${canaryResults.filter((c) => c.caught).length}/2 caught`)
    return {
      ...base,
      verifiedBaseline: verified.baselineCorrections
        ? `${audit.verifiedBaseline}\n[verifier correction: ${verified.baselineCorrections}]`
        : audit.verifiedBaseline,
      findings: judged,
      canaryResults,
      calibrated,
    }
  },
)

const dims = results.filter(Boolean)
const failed = dims.filter((d) => d.failed).map((d) => d.key)
const floor = selected.length === DIMENSIONS.length ? 7 : selected.length
if (dims.length - failed.length < floor) {
  throw new Error(`Only ${dims.length - failed.length}/${selected.length} dimensions completed (failed: ${failed.join(', ') || 'none'}; floor ${floor}) — rerun via resumeFromRunId`)
}

const stats = dims.map((d) => {
  const n = (v) => d.findings.filter((f) => f.verdict === v).length
  const filed = d.findings.length
  const removed = n('REJECTED') + n('SHRUNK') + n('DEFER')
  return {
    key: d.key, failed: d.failed, filed,
    confirmed: n('CONFIRMED'), corrected: n('CORRECTED'), shrunk: n('SHRUNK'),
    deferred: n('DEFER'), rejected: n('REJECTED'), unchecked: n('UNCHECKED'),
    removedOrShrunkPct: filed ? Math.round((removed / filed) * 100) : null,
    canaries: d.canaryResults, calibrated: d.calibrated,
  }
})

// ---------- Stage C: synthesis ----------

phase('Synthesize')

const survivors = dims.map((d) => ({
  key: d.key, label: d.label, failed: d.failed,
  assumedLoad: d.assumedLoad, verifiedBaseline: d.verifiedBaseline,
  healthNotes: d.healthNotes, notChecked: d.notChecked,
  consideredAndDropped: d.consideredAndDropped,
  findings: d.findings.filter((f) => f.verdict !== 'REJECTED'),
  rejected: d.findings.filter((f) => f.verdict === 'REJECTED').map((f) => ({ id: f.id, title: f.title, why: f.verifierNote })),
}))

const synthesisPrompt = `You are the synthesis agent for a ponytail audit of PropertyPro. Write the report to
**${REPORT_PATH}** (create the file — it is the ONLY file you write), then return the structured summary.

## Inputs
Verified dimensions (REJECTED findings are listed separately under \`rejected\`; canary findings are already
removed):
\`\`\`json
${JSON.stringify(survivors, null, 2)}
\`\`\`
Verification stats, including canary outcomes:
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`
Audited commit: ${headSha ?? '(run git rev-parse --short HEAD in ' + root + ')'}; previous audit ${baseSha ?? '07e56b6e7'}.

## Report format (≈400 lines max — a long report is one nobody re-reads; if over, compress the
appendices to one-line rows, never drop a headline item's four bullets)
Header block in house style (see docs/audits/2026-10-13-security-audit.md): H1, then bold **Date**
(${dateIso}), **Author** (Claude, multi-agent refactor-audit workflow, ponytail lens), **Status** (audit
only — no code changed), **Scope** (commit, dimensions run).

1. **What this repo does:** two or three sentences, plus the assumed load.
2. **Findings** — at most 20 headline items under **Must fix**, **Should fix**, **Nice to have**, most
   important first. Rank strictly by ponytail priority: bugs → security/data loss → scale → untested risky
   logic → slow → bloat. Each item: a bold title with \`file:line\` and the finding id, then four bullets —
   **What this is**, **Problem**, **Fix** (the smallest; name the ladder rung), **If we skip it**.
   UNCHECKED findings (a verifier failed a canary) may NOT appear in the headline — put them in Appendix A
   marked as such. Dedupe across dimensions on (primary file, failure class); credit both ids.
3. **Verdict** — one paragraph.
4. **Lean:** "−N lines, −N dependencies possible" — summed from surviving lean findings' netLines/depsRemoved.
5. **Not checked** — union of every dimension's notChecked, deduped, plus any failed dimension.

Appendices:
- **A. All surviving findings**: one table \`| ID | Sev | Verdict | Title | file:line | Rung | Net lines |\`.
- **B. Deferral ledger** — the SINGLE home for every deferral: the seeded ones from the ground truth
  (with fired/unfired status from the C dimension) plus every DEFER verdict. Columns: \`| Item | Limit |
  Trigger (observable) | Fired? | Owner |\`. Add a code marker only where a future editor of that file
  must see it; say which rows need one.
- **C. Load at which it bites** — from the P dimension.
- **D. Agent-context truth table** — from the C dimension: \`| File | Claim | FALSE/STALE/DUPLICATED | Fix |\`.
- **E. Roadmap** — dependency-ordered, with the first 3 PRs. Fired-trigger items and must-fixes first.
- **F. Method** — the 8 dimensions, the verifier policy, the canary design, a per-dimension table of
  filed / confirmed / corrected / shrunk / deferred / rejected / unchecked / % removed-or-shrunk /
  canaries caught, and coverage gaps. Flag any dimension where nothing was removed, shrunk or deferred.
  Also list the "considered and dropped" counts per dimension.

Rules: every number must trace to a finding's evidence or a baseline; no invented paths (verify a path
exists before citing it if it is not in the inputs); no present-tense claim about another system without a
date or SHA; tables over prose.

Return StructuredOutput: { reportPath, headlineCount, mustFix: [ids], deferredCount, reportLines, notes }.`

const report = await safeAgent(synthesisPrompt, { schema: REPORT_SCHEMA, label: 'synthesize-report', phase: 'Synthesize' })
if (!report) throw new Error('Synthesis failed — findings are in the journal; resume with resumeFromRunId to rerun only synthesis')

log(`Report: ${report.reportPath} — ${report.headlineCount} headline, ${report.mustFix.length} must-fix, ${report.deferredCount} deferred, ${report.reportLines} lines`)

return { report, stats, failedDimensions: failed }

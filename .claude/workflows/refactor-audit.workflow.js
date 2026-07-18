// Full-monorepo refactor audit: 10 read-only dimension auditors → adversarial
// verification → synthesized report + phased cleanup roadmap.
//
// Invoked via:
//   Workflow({ name: 'refactor-audit', args: { dateIso: 'YYYY-MM-DD' } })
//
// Output: docs/audits/<dateIso>-refactor-audit-and-cleanup-roadmap.md
// (written by the Synthesize agent; the orchestrating session reviews,
// verifies cited numbers at HEAD, and commits).
//
// This workflow is STRICTLY READ-ONLY with respect to product code: auditors
// may run guard scripts / grep / wc and read files, but never edit, never run
// anything with --fix/--write flags, never touch git state.
//
// Constraints (Workflow tool sandbox):
//   - No filesystem access (Read/Write happen via agents)
//   - No Date.now(), no new Date() without args, no Math.random()
//   - Script must be self-contained: no imports of other files
//   - meta block must be a pure literal
//   - agent() outputs are JSON-schema-validated where structured data matters

export const meta = {
  name: 'refactor-audit',
  description: 'Full-monorepo refactor audit: 10 dimension auditors → adversarial verify → synthesized report + phased cleanup roadmap',
  whenToUse: 'When a fresh codebase-health audit and cleanup roadmap is wanted (re-runnable; report is dated by args.dateIso)',
  phases: [
    { title: 'Audit' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

// args shape: { dateIso: 'YYYY-MM-DD' } — tolerate a JSON-string args payload,
// which some invocation paths deliver instead of the parsed object.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { dateIso } = parsedArgs ?? {}
if (!dateIso) throw new Error('args.dateIso is required (workflow sandbox has no clock)')

const ROOT = '/home/user/PropertyPro'
const REPORT_PATH = `${ROOT}/docs/audits/${dateIso}-refactor-audit-and-cleanup-roadmap.md`

log(`Refactor audit starting (dateIso=${dateIso}); report → ${REPORT_PATH}`)

// ---------- Agent output schemas (JSON Schema draft-07) ----------

const AREA_ENUM = ['services', 'role-v3', 'authz', 'contracts', 'db-boundary', 'pagination', 'frontend', 'testing', 'infra', 'dead-code']

const FINDING_PROPS = {
  id: { type: 'string' },
  title: { type: 'string' },
  area: { enum: AREA_ENUM },
  files: { type: 'array', items: { type: 'string' } },
  evidence: { type: 'string' },
  impact: { enum: ['high', 'medium', 'low'] },
  effort: { enum: ['S', 'M', 'L'] },
  risk: { enum: ['low', 'medium', 'high'] },
  suggestedApproach: { type: 'string' },
  dependsOn: { type: 'array', items: { type: 'string' } },
  existingTooling: { type: 'string' },
}
const FINDING_REQUIRED = ['id', 'title', 'area', 'files', 'evidence', 'impact', 'effort', 'risk', 'suggestedApproach']

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['verifiedBaseline', 'healthNotes', 'findings'],
  properties: {
    verifiedBaseline: { type: 'string' },
    healthNotes: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      maxItems: 12,
      items: { type: 'object', required: FINDING_REQUIRED, properties: FINDING_PROPS },
    },
  },
}

const VERIFIED_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: [...FINDING_REQUIRED, 'verdict'],
        properties: {
          ...FINDING_PROPS,
          verdict: { enum: ['CONFIRMED', 'CORRECTED', 'REJECTED', 'UNCHECKED'] },
          verifierNote: { type: 'string' },
        },
      },
    },
    baselineCorrections: { type: 'string' },
  },
}

const REPORT_SCHEMA = {
  type: 'object',
  required: ['reportPath', 'findingCount', 'rejectedCount', 'phases'],
  properties: {
    reportPath: { type: 'string' },
    findingCount: { type: 'integer' },
    rejectedCount: { type: 'integer' },
    phases: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

// ---------- Resilient agent wrapper ----------
// A direct `await agent({schema})` THROWS if the subagent finishes without
// calling StructuredOutput; safeAgent degrades that to null so one flaky
// auditor doesn't kill the audit. Call sites all tolerate null.
async function safeAgent(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log(`agent ${opts?.label ?? '(unlabeled)'} dropped/failed: ${e?.message ?? e}`)
    return null
  }
}

// ---------- Shared prompt fragments ----------

const READ_ONLY_RULES = `## Hard rules — READ-ONLY audit

- Repo root: \`${ROOT}\` (branch already checked out; audit the working tree at HEAD).
- You may: Read/Glob/Grep files, run read-only shell (\`wc -l\`, \`grep -c\`, \`git log\`,
  \`git rev-parse HEAD\`), and run guard scripts in check/report mode
  (e.g. \`pnpm guard:contracts\`, \`pnpm guard:legacy-roles\`).
- You may NOT: edit any file, run anything with \`--fix\`/\`--write\`/\`--write-baseline\`,
  run migrations/seeds, mutate git state, or install packages.
- Every count you assert MUST appear in the finding's \`evidence\` field together with
  the EXACT command that produced it (verifiers re-run your commands verbatim).`

const OUTPUT_RULES = `## Return

**You MUST end your turn by calling the StructuredOutput tool** with the schema you
were given — even if you have zero findings (return \`"findings": []\`). A completion
without a StructuredOutput call is dropped as null and wastes your whole dimension.

- \`verifiedBaseline\`: 2-4 sentences confirming or correcting the ground-truth numbers
  you were given (state the numbers you measured).
- \`healthNotes\`: genuine strengths you observed (feeds the report's "what's healthy"
  section) — empty array if none.
- \`findings\`: max 12, high-signal only. Quality over quantity — do NOT pad.
  \`id\` = your prefix + 2-digit index (e.g. SVC-01). \`files\` = repo-relative paths.
  \`dependsOn\` = ids or program names this item is blocked by (e.g. "role-v3 Phase 4").
  \`existingTooling\` = in-repo automation/design docs that already cover this (so the
  roadmap reuses instead of re-inventing).`

// ---------- The 10 auditors ----------
// Each prompt: (a) ground truth pasted in (verify + deepen, never re-discover),
// (b) specific verify commands, (c) an adjacent-issue hunt, (d) explicit
// exclusions naming which auditor owns neighboring territory.

const DIMENSIONS = [
  {
    key: 'SVC',
    label: 'services',
    prompt: `You are the **SVC (service-layer decomposition)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

\`apps/web/src/lib/services/\` holds the app's business logic. Prior survey found 13+
files >750 LOC: finance-service.ts 2,410; esign-service.ts 1,581; elections-service.ts
1,445; provisioning-service.ts 1,350; package-visitor-service.ts 1,217;
violations-service.ts 1,206; calendar-event-reminder-service.ts 1,186;
work-orders-service.ts 1,178; notification-service.ts 1,014; account-lifecycle-service.ts
987. They allegedly share a repeated CRUD + notification-dispatch + audit-log shape.

## Tasks

1. Verify: \`wc -l apps/web/src/lib/services/*.ts | sort -rn | head -20\` (from ${ROOT}).
2. Read the section structure of the top 4 files (finance, esign, elections,
   provisioning). Characterize the repeated shape CONCRETELY: which blocks recur
   (scoped-client setup, pagination plumbing, notification fan-out, logAuditEvent
   calls, error wrapping)? Name the extraction that would collapse the most lines
   (e.g. a shared crud-with-audit helper, a notification-dispatch mixin) and estimate
   the win.
3. For each proposed decomposition target, check test cover: does
   \`apps/web/__tests__/\` have direct tests for that service (grep the service name)?
   Refactoring an untested 2,400-line billing service is high-risk — say so via
   \`risk\` and \`dependsOn\` (e.g. "TST test backfill").
4. Adjacent hunt: services that are trivially thin wrappers (merge candidates),
   services duplicating each other's helpers, dead exported service functions.

## Exclusions (owned by other auditors)
Route-layer shape → CON. DB import boundaries → DBB. Test-coverage strategy → TST
(you only note per-service cover as refactor-safety input).

${OUTPUT_RULES}
Use \`area: "services"\`, id prefix SVC-.`,
  },
  {
    key: 'R3',
    label: 'role-v3',
    prompt: `You are the **R3 (role-v3 / ADR-006 completion)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

ADR-006 (docs/adr/ADR-006-root-manager-role-model.md) collapses the legacy seven-role
vocabulary to three storage roles + a board \`designation\` column, behind a compat shim.
Prior survey measured: guard \`scripts/verify-legacy-roles.ts\` in BAN mode with a
per-file ceiling allowlist; 73 dead legacy literals across 20 files (rbac-matrix.ts 16,
access-policies.ts 7, compliance-command-center.tsx 6, rbac-parity.test.ts 6,
nav-config.ts 5); \`CommunityRole\` 93 occurrences / 25 files; \`ADMIN_ROLES\` 72 / 13
(feature-registry.ts 32, nav-config.ts 10). Deferred per the ADR: Phase 4 cleanup
migration (drop presetKey / per-membership permissions JSONB / legacyRole / dead enum
values), Phase 4.4 BRIDGE-file drain + delete inferCanonicalRoleFromMembership,
Phase 3.4 billing/community-deletion root-only, uniform PM permissions in
checkPermissionV2.

## Tasks

1. Verify counts: run the guard's report mode
   (\`pnpm exec tsx scripts/verify-legacy-roles.ts --report\` or the \`guard:legacy-roles\`
   script — read the script header to find the right flag), plus
   \`grep -rn 'CommunityRole' apps/web/src --include='*.ts*' | wc -l\` and the same for
   \`ADMIN_ROLES\`.
2. Read ADR-006's transition-status section and restate each DEFERRED phase accurately.
   Turn each into a finding with effort/risk: the Phase 4 contract migration touches a
   live enum + column drops (migration-safety rules apply — expand/contract, prod is
   manual-apply); the BRIDGE drain is mechanical.
3. Identify which allowlisted files are at 0 residue (ceiling slack that should be
   ratcheted down) — cheap-win finding.
4. Adjacent hunt: places treating \`designation\` as a permission role (the ADR forbids
   that), new code written against the legacy vocabulary since the ADR landed
   (\`git log --since=2026-06-15 -p -- packages/shared/src/access-policies.ts\` etc.).

## Exclusions
Authorization idiom unification across routes → AZ (you own legacy-role RESIDUE only;
AZ owns the choke-point). DB migration mechanics themselves are audit-reported, not
executed.

${OUTPUT_RULES}
Use \`area: "role-v3"\`, id prefix R3-.`,
  },
  {
    key: 'AZ',
    label: 'authz',
    prompt: `You are the **AZ (authorization consistency)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

256 route.ts files under apps/web/src/app/api/v1. Prior survey found THREE coexisting
authorization idioms with no single RBAC choke point: \`requirePermission(...)\` (~74
routes), \`isAdminRole(membership.role)\` ad-hoc checks, and bare
\`requireCommunityMembership\` with no further check. rbac-matrix.ts
(packages/shared/src/rbac-matrix.ts) is the canonical permission matrix.

## Tasks

1. Verify + classify: count routes per idiom
   (\`grep -rl 'requirePermission' apps/web/src/app/api/v1 --include=route.ts | wc -l\`,
   same for isAdminRole / requireCommunityMembership; a route may hit several).
2. Hunt routes with NO authz call at all beyond session auth: list candidates, then
   READ each to confirm whether missing authz is real or delegated (middleware,
   token-gated internal/cron, public-by-design). Only confirmed gaps become findings
   (impact high).
3. Verify the documented path-traversal concern: apps/web/__tests__/announcements/route.test.ts
   around line 357 has a TODO claiming \`filePath\` is not sanitized against path
   traversal in the documents route. Read the actual documents route/service code and
   determine if it's real. If real → finding (impact high). If already mitigated →
   note it in verifiedBaseline.
4. Name the choke-point target: what would unification onto
   requirePermission/checkPermissionV2 look like, and state its dependency on role-v3
   Phase 4 (can't unify onto canonical roles while legacy vocabulary drives policy).

## Exclusions
Legacy-role literal residue → R3. Tenant scoping / contract adoption → CON.
Cross-tenant \`db/unsafe\` audit → DBB.

${OUTPUT_RULES}
Use \`area: "authz"\`, id prefix AZ-.`,
  },
  {
    key: 'CON',
    label: 'contracts',
    prompt: `You are the **CON (route contract & tenant-scope adoption)** auditor for a
full-monorepo refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

Prior survey: runRoute contract style on 220/256 api/v1 routes (~86%), withErrorHandler
on 251/256; tenantScope declared on only 9/219 contract.ts files while 148/256 routes
still hand-call resolveEffectiveCommunityId; 3 genuine legacy CRUD routes remain
(announcements, maintenance-requests, meetings — action-string dispatch, manual
safeParse). The A1 contract drain ALREADY HAS automation: scripts/verify-contracts.ts
(ratchet allowlist) + .claude/workflows/drain-loop.workflow.js /
drain-one-batch.workflow.js.

## Tasks

1. Verify: \`pnpm guard:contracts\` (prints "Contracted: N; Allowlist: M"),
   \`pnpm guard:tenant-scope\`, count tenantScope declarations
   (\`grep -rl 'tenantScope' apps/web/src/app/api/v1 --include=contract.ts | wc -l\`)
   and hand-rolled resolution
   (\`grep -rl 'resolveEffectiveCommunityId' apps/web/src/app/api/v1 --include=route.ts | wc -l\`).
2. Read the 3 legacy CRUD routes; size each conversion (S/M/L) and note blockers
   (announcements is also a hard-tier pagination route — cross-reference, don't own it).
3. Drain velocity: \`git log --oneline --since=2026-06-01 -- scripts/verify-contracts.ts | wc -l\`
   and eyeball the log — how fast is the allowlist draining? At current velocity, when
   does it hit zero? That's roadmap input.
4. Adjacent hunt: contract.ts files that DON'T declare tenantScope but match the
   canonical single-tenant shapes in .claude/rules/api-patterns.md (query/body/path) —
   i.e. the mechanically-drainable tenantScope backlog. Estimate its size.

## Exclusions
Authorization idioms → AZ. Pagination redesign → PAG. For anything the drain-loop
already automates, set \`existingTooling: "drain-loop workflow"\` — the roadmap must
NOT propose re-building it.

${OUTPUT_RULES}
Use \`area: "contracts"\`, id prefix CON-.`,
  },
  {
    key: 'DBB',
    label: 'db-boundary',
    prompt: `You are the **DBB (data-layer boundary)** auditor for a full-monorepo refactor
audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

docs/audits/a3-third-boundary-guard-survey-2026-05-08.md surveyed route-layer DB
imports (READ IT FIRST — diff against it, don't redo it): at 2026-05-08 there were 230
routes — tier A service-only 114 (49.6%), tier B helper-only 27, tier C direct
table/schema imports 89 (38.7%); \`@propertypro/db/unsafe\` in 42 routes, every call
site carrying an \`// AUTHZ:\` comment (guard:authz-comments). A more recent sweep
counted 71 \`db/unsafe\` import sites repo-wide and \`guard:route-table-imports\`
(scripts/verify-route-table-imports.ts) now exists.

## Tasks

1. Re-measure NOW and diff against the 2026-05-08 numbers — drift direction is itself
   a finding (is tier C growing or shrinking?):
   \`grep -rl "@propertypro/db/unsafe" apps/web/src --include='*.ts*' | wc -l\`, same
   scoped to app/api; count tier-C style table imports (read
   scripts/verify-route-table-imports.ts to reuse its detection logic / allowlist size).
2. Identify the top tier-C offenders (routes importing tables directly) and which
   existing service each should delegate to.
3. Check guard coverage: does guard:route-table-imports ratchet (allowlist shrink-only)
   or is it static? A non-ratcheting guard is a finding (the a3 survey planned a
   ratchet).
4. Adjacent hunt: \`db/unsafe\` call sites whose AUTHZ comments are stale/vague
   (sample ~10), scoped-client construction outside services/routes (components?
   would be a layering violation).

## Exclusions
Service internals → SVC. Authorization semantics → AZ (you own the IMPORT boundary).

${OUTPUT_RULES}
Use \`area: "db-boundary"\`, id prefix DBB-.`,
  },
  {
    key: 'PAG',
    label: 'pagination',
    prompt: `You are the **PAG (B3 hard-tier pagination)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

The B3 pagination program's easy tier (id-order \`paginate()\` from
packages/db/src/pagination.ts) is exhausted (~12 endpoints migrated). The hard tier —
endpoints whose user-visible order is NOT id-order — was designed per-endpoint in
docs/audits/b3-hard-tier-pagination-design-2026-05-11.md (READ IT; CITE it; do NOT
re-design). At last check 10 endpoints remained unbounded: announcements, reservations,
vendors, assessments, amenities, visitors, forum/threads, calendar/events, elections,
leases (faqs landed since the doc).

## Tasks

1. Verify each of the 10 is STILL unbounded: for each route file, grep for
   \`paginate\` / cursor handling; confirm current state per endpoint.
2. Rank the still-unbounded endpoints by data-growth risk (which tables grow per-day
   vs per-year — forum threads and calendar events likely worst; check seed sizes /
   schema for hints). The ranking, with the design doc's per-endpoint recommendation
   attached, is your main finding set.
3. Note endpoints the design doc says should NOT be migrated (e.g. reservations →
   keep offset; calendar/events → not a paginate candidate) so the roadmap doesn't
   over-count remaining work.
4. Adjacent hunt: NEW unbounded list endpoints added since 2026-05-11 that the doc
   never covered (grep recent contract.ts/route.ts for array returns without
   pagination).

## Exclusions
Contract migration mechanics → CON. This is the SMALLEST dimension — stay focused;
\`existingTooling\` = the b3 design doc for every finding it covers.

${OUTPUT_RULES}
Use \`area: "pagination"\`, id prefix PAG-.`,
  },
  {
    key: 'FE',
    label: 'frontend',
    prompt: `You are the **FE (frontend & design system)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

Design-token guard baseline (scripts/design-token-baseline.json) freezes ~1,650
violations across 86 files — admin-app-dominated (CommunityAccess.tsx 98) plus
apps/web mobile components; **apps/admin and mobile are EXPLICITLY out of scope until
their own migration programs** (per CLAUDE.md / design.md) — report them as
"scheduled elsewhere", NOT as findings. packages/ui Button/Card/NavRail are
@deprecated (shadcn components in apps/web/src/components/ui are canonical for web;
packages/ui versions admin-only until its migration). 13 pages carry
\`breadcrumbs:exempt\`. 427 components / 163 hooks in apps/web.

## Tasks

1. Verify: parse scripts/design-token-baseline.json (file count, total violations,
   web-vs-admin split — jq or node -e is fine, read-only). Separate the WEB
   non-mobile share (in-scope debt) from admin/mobile (scheduled elsewhere).
2. Deprecated-component removal feasibility: count remaining imports of packages/ui
   Button/Card/NavRail from apps/web vs apps/admin
   (\`grep -rln "from '@propertypro/ui'" apps/web/src | xargs grep -l 'Button\\|Card\\|NavRail'\`
   — refine as needed). If apps/web is at zero, deletion-for-web is a cheap win.
3. Breadcrumb exemptions: list the 13 exempt pages; classify which are legitimately
   permanent (redirect-only/delegated) vs drainable.
4. Adjacent hunt: oversized components (>500 lines) in apps/web/src/components;
   component logic duplicated between apps/web and apps/admin (same-named or
   near-identical files); hook families that are copy-paste parallels
   (condo-onboarding vs apartment-onboarding, esign-* x4) — generic-extraction
   candidates.

## Exclusions
Hook TEST coverage → TST. Token DEFINITIONS (packages/tokens) are healthy — don't
audit them.

${OUTPUT_RULES}
Use \`area: "frontend"\`, id prefix FE-.`,
  },
  {
    key: 'TST',
    label: 'testing',
    prompt: `You are the **TST (test posture & quality gates)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

Prior survey: 648 unit/component test files (apps/web/__tests__), 36 integration
(no-mock doctrine, real Postgres), 13 Playwright e2e. The hooks layer has 163 source
files but only ~9 dedicated test files. ~17 guard scripts chain into \`pnpm lint\` —
the guard suite is a STRENGTH (say so in healthNotes), not a finding.

## Tasks

1. Verify the counts (find/wc on the test globs; read vitest.workspace.ts).
2. Map coverage against the refactor targets the SVC auditor will propose: for each of
   finance-service, esign-service, elections-service, provisioning-service — how many
   direct test files / test cases exist? Is coverage adequate to decompose under
   (characterization-test safety)? This produces the "test backfill BEFORE
   decomposition" sequencing findings.
3. Quantify the hooks gap: which of the 84 TanStack-Query hooks carry the most
   business logic (cache invalidation chains, optimistic updates) yet have no test?
   Top-5 list, not exhaustive.
4. Adjacent hunt: large untested surfaces (middleware.ts test cover? cron routes
   ~18 vs __tests__/cron ~10?), guard scripts THEMSELVES without fixture tests
   (scripts/__tests__?), obviously-stale skipped tests (\`it.skip\`/\`describe.skip\`
   counts).

## Exclusions
Proposing service decompositions → SVC (you provide their safety input). CI pipeline
structure → INF.

${OUTPUT_RULES}
Use \`area: "testing"\`, id prefix TST-.`,
  },
  {
    key: 'INF',
    label: 'infra',
    prompt: `You are the **INF (app-shell & infra hotspots)** auditor for a full-monorepo
refactor audit of PropertyPro.

${READ_ONLY_RULES}

## Ground truth to verify + deepen

apps/web/src/middleware.ts is 994 lines (session refresh, tenant resolution, auth
redirects, email-verification, request tracing, rate limiting, header sanitization —
one monolith). apps/web/src/lib/constants/feature-registry.ts 830.
packages/db/src/seed/seed-community.ts 2,113 (plus scripts/seed-demo.ts ~64KB).
14 GitHub workflows; deploy.yml is code-only on CI-success with MANUAL migrations —
that is DELIBERATE policy (healthNote, not a finding; do not propose re-coupling).

## Tasks

1. Verify sizes (\`wc -l\`). Read middleware.ts fully and propose a CONCRETE split:
   which of its concerns are separable modules (e.g. tenant-resolution,
   rate-limiting, header-sanitization as pure functions composed in one exported
   middleware), what ordering constraints exist between them, and what test seam the
   split would create. This is your headline finding.
2. feature-registry.ts and nav-config.ts (662): are they data-only tables that could
   be split per-domain, and do they carry the ADMIN_ROLES coupling R3 flagged?
   (Cross-reference R3, don't own the role part.)
3. seed-community.ts: is it one linear script that could become per-domain seed
   modules? Note whether seed:verify (scripts/verify-seed-evidence.ts) would catch a
   bad split — that determines risk.
4. Adjacent hunt: CI redundancy/speed — read .github/workflows/ci.yml; are guards
   parallelized or serial inside the lint job? Any duplicated work across the 14
   workflows (e.g. scoped-db-access run twice)? Cheap wall-clock wins only —
   don't redesign CI.

## Exclusions
Services → SVC. Guard-script TEST coverage → TST. Deploy/migration policy is settled —
report as healthy.

${OUTPUT_RULES}
Use \`area: "infra"\`, id prefix INF-.`,
  },
  {
    key: 'DC',
    label: 'dead-code',
    prompt: `You are the **DC (dead code & duplication sweep)** auditor for a full-monorepo
refactor audit of PropertyPro — the one mostly-greenfield hunter.

${READ_ONLY_RULES}

## Known context (do NOT re-inventory)

Marker debt is negligible (10 TODOs repo-wide) — skip TODO inventories. Prior art on
orphans: docs/audits/migration-orphan-files-2026-05-06.md. The @deprecated
packages/ui components are owned by FE. Legacy-role residue is owned by R3.

## Tasks (high-confidence only — every claim must survive an adversarial verifier)

1. Unused exports in packages/shared and packages/ui: sample exported symbols from
   package entry points and grep apps/* + packages/* for consumers. Report only
   symbols with ZERO references outside their own package (and not part of a public
   package API consumed by scripts/tests). List the grep commands in evidence.
2. Duplicated helpers between apps/web and apps/admin: same-named files or
   near-identical utility functions (diff candidates like cn/utils, date formatting,
   status maps that design.md says are canonical in packages/ui/src/constants/status.ts —
   is admin duplicating instead of importing?).
3. Orphan files: components/hooks with zero importers
   (\`grep -rL\` / import-graph spot checks on suspicious names — old *-v1/*-old/copy
   files, .bak, unused mock data).
4. Stale guard-allowlist entries: for each major guard with a file allowlist/baseline
   (verify-legacy-roles.ts ceilings, design-token-baseline.json, verify-contracts.ts),
   find entries whose files are ALREADY CLEAN or deleted — ratchet-down cheap wins
   (report; do not edit).
5. Dead API routes: v1 routes with no client consumer (grep the route path across
   apps/web/src/hooks, components, lib) — flag as "candidate, needs product
   confirmation", impact low.

## Exclusions
Everything named above as owned by FE/R3/SVC. Cap at 12 findings; if confidence is
medium, leave it out.

${OUTPUT_RULES}
Use \`area: "dead-code"\`, id prefix DC-.`,
  },
]

// ---------- Verifier prompt ----------

function verifierPrompt(dim, auditorOutput) {
  return `You are the adversarial verifier for the **${dim.key}** dimension of a
PropertyPro refactor audit. Your job is to get findings REMOVED. A finding survives
only if its evidence reproduces against the working tree.

${READ_ONLY_RULES}

## The auditor's output (JSON)

\`\`\`json
${JSON.stringify(auditorOutput, null, 2)}
\`\`\`

## Verification policy

- **Always verify:** every count/LOC/ratio claim (re-run the exact command in
  \`evidence\`; if no runnable command is given for a numeric claim, that alone
  justifies REJECTED unless you can cheaply reconstruct one that confirms it); every
  finding with \`impact: "high"\` or \`effort: "L"\` (these anchor roadmap phases);
  every \`dependsOn\` claim (does the dependency actually block it?); every file path
  (a nonexistent path = REJECTED).
- **Spot-check:** 2 of the medium/low findings of your choice, end-to-end.
- **Do NOT re-litigate:** subjective ratings (impact/effort/risk levels) and
  \`suggestedApproach\` phrasing — leave them unless factually impossible.

## Verdicts (per finding)

- CONFIRMED — evidence reproduced as stated.
- CORRECTED — real issue, but a number/path drifted: fix the finding's fields IN
  PLACE (evidence, files, counts) and explain in \`verifierNote\`.
- REJECTED — evidence does not reproduce, path doesn't exist, claim is wrong, or the
  "issue" is explicitly documented as intentional/out-of-scope policy. Give the
  reason in \`verifierNote\`.
- UNCHECKED — only for unspot-checked medium/low findings you did not examine.

Also return \`baselineCorrections\`: corrections to the auditor's verifiedBaseline
numbers, or "" if accurate.

## Return

**You MUST end your turn by calling the StructuredOutput tool** — return ALL findings
(including REJECTED/UNCHECKED ones) with their verdicts; the orchestrator filters.
Zero findings in → return \`{"findings": [], "baselineCorrections": ""}\`.`
}

// ---------- Synthesis prompt ----------

function synthesisPrompt(dimensions, stats) {
  return `You are the synthesis agent for a PropertyPro full-monorepo refactor audit.
Write the final audit report to **${REPORT_PATH}** (create the file; docs/ is the ONLY
thing you write — no code changes), then return the structured summary.

## Inputs

Verified findings by dimension (REJECTED already filtered out; verdicts retained):

\`\`\`json
${JSON.stringify(dimensions, null, 2)}
\`\`\`

Verification stats (for the method appendix — honesty matters):
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`

Get the audited commit: \`cd ${ROOT} && git rev-parse --short HEAD\`.

## Report requirements

House style: match docs/audits/a3-third-boundary-guard-survey-2026-05-08.md — H1
title, then a bold-label header block:

\`\`\`
**Date**: ${dateIso}
**Author**: Claude (multi-agent refactor-audit workflow)
**Status**: Audit only — no code changes in this pass
**Scope**: Full monorepo (~2,800 files / ~390K LOC) at commit <sha>. Findings
adversarially verified; counts re-run at HEAD.
\`\`\`

Sections, in order:

1. **Headline numbers** — one table up front: LOC by workspace, routes on contract
   style, tenantScope adoption, legacy-role residue, unbounded hard-tier endpoints,
   design-token baseline size, hooks test ratio. Use the VERIFIED numbers from
   verifiedBaseline/baselineCorrections, never the pre-audit ground truth.
2. **Executive summary** — 5-8 bullets: overall verdict (expected: debt concentrates
   in file size and migration tails, NOT architecture — but write what the findings
   actually support), top 3 programs to finish, top 3 new items.
3. **What's healthy** — synthesize the healthNotes: guard suite, contract layer,
   hooks layer, guarded db/unsafe, deliberate deploy policy, drain-loop automation.
   This section prevents the report reading as a rewrite pitch.
4. **Findings by theme** — one subsection per dimension (Services, Role-v3, Authz,
   Contracts & tenant scope, DB boundary, Pagination, Frontend & design system,
   Testing, Infra, Dead code). Each: 2-3 sentence state summary, then a table
   \`| ID | Finding | Files | Impact | Effort | Risk |\`, then evidence notes for
   high-impact rows (exact commands + numbers). Dedupe cross-dimension overlaps: the
   announcements route may appear in CON and PAG — ONE roadmap item, cross-referenced
   evidence. Note per-dimension how many findings verification rejected.
5. **Phased cleanup roadmap** — the core deliverable. ORDER BY DEPENDENCY, not
   impact, and state the sequencing rationale. Expected shape (adjust to the actual
   surviving findings):
   - Phase 1 — finish in-flight migrations (unblockers): role-v3 Phase 4 + 4.4;
     tenantScope/contract drain via EXISTING drain-loop; B3 hard tier per EXISTING
     design doc.
   - Phase 2 — consolidate choke points: RBAC unification (depends on role-v3
     Phase 4); convert the legacy CRUD routes; db-boundary ratchet / db-unsafe
     reduction.
   - Phase 3 — structural decomposition: test backfill FIRST, then service
     decomposition (finance et al.), middleware split, seed/feature-registry
     modularization.
   - Phase 4 — deferred programs already scoped elsewhere (admin/mobile tokens,
     deprecated packages/ui removal, breadcrumb drain): pointers only.
   Every item: effort (S/M/L) + risk + dependsOn where applicable + existingTooling
   where it exists (NEVER propose re-building drain-loop or re-designing B3).
   End with a mermaid dependency diagram and a "first 3 PRs" recommendation.
6. **Method appendix** — workflow name (refactor-audit), the 10 auditor dimensions,
   the verification policy (counts always re-run; high-impact always verified;
   2 spot-checks per dimension), and the confirmed/corrected/rejected/unchecked
   tallies per dimension. If any dimension's auditor failed entirely, list it as a
   coverage gap.

Rules: every number in the report must be traceable to a finding's evidence or a
verifiedBaseline; no invented paths (only paths present in the findings JSON or that
you verify exist); keep it scannable — tables over prose walls; target roughly
300-500 lines.

## Return

After writing the file, use StructuredOutput:
\`{ reportPath, findingCount, rejectedCount, phases: [<roadmap phase titles>], notes }\``
}

// ---------- Stage A+B: audit → verify, pipelined per dimension ----------

phase('Audit')

const dimensionResults = await pipeline(
  DIMENSIONS,
  (dim) =>
    safeAgent(dim.prompt, {
      schema: FINDINGS_SCHEMA,
      label: `audit:${dim.key}`,
      phase: 'Audit',
    }).then((out) => ({ dim, audit: out })),
  async ({ dim, audit }) => {
    if (!audit) {
      log(`${dim.key}: auditor failed — dimension will be reported as a coverage gap`)
      return { key: dim.key, failed: true, findings: [], healthNotes: [], verifiedBaseline: '', rejected: 0, unchecked: 0, corrected: 0, confirmed: 0 }
    }
    if (audit.findings.length === 0) {
      log(`${dim.key}: 0 findings (healthNotes: ${audit.healthNotes.length}) — skipping verification`)
      return { key: dim.key, failed: false, findings: [], healthNotes: audit.healthNotes, verifiedBaseline: audit.verifiedBaseline, rejected: 0, unchecked: 0, corrected: 0, confirmed: 0 }
    }
    const verified = await safeAgent(verifierPrompt(dim, audit), {
      schema: VERIFIED_SCHEMA,
      label: `verify:${dim.key}`,
      phase: 'Verify',
    })
    if (!verified) {
      // Verifier flaked: keep the auditor's findings but mark them all UNCHECKED
      // so the report is honest about it.
      log(`${dim.key}: verifier failed — findings kept as UNCHECKED`)
      return {
        key: dim.key,
        failed: false,
        findings: audit.findings.map((f) => ({ ...f, verdict: 'UNCHECKED', verifierNote: 'verifier agent failed' })),
        healthNotes: audit.healthNotes,
        verifiedBaseline: audit.verifiedBaseline,
        rejected: 0,
        unchecked: audit.findings.length,
        corrected: 0,
        confirmed: 0,
      }
    }
    const surviving = verified.findings.filter((f) => f.verdict !== 'REJECTED')
    const tally = (v) => verified.findings.filter((f) => f.verdict === v).length
    log(`${dim.key}: ${audit.findings.length} found → ${surviving.length} survived (rejected ${tally('REJECTED')}, corrected ${tally('CORRECTED')})`)
    return {
      key: dim.key,
      failed: false,
      findings: surviving,
      healthNotes: audit.healthNotes,
      verifiedBaseline: verified.baselineCorrections
        ? `${audit.verifiedBaseline}\n[verifier correction: ${verified.baselineCorrections}]`
        : audit.verifiedBaseline,
      rejected: tally('REJECTED'),
      unchecked: tally('UNCHECKED'),
      corrected: tally('CORRECTED'),
      confirmed: tally('CONFIRMED'),
    }
  }
)

const dims = dimensionResults.filter(Boolean)
const failedDims = dims.filter((d) => d.failed).map((d) => d.key)
if (dims.length - failedDims.length < 8) {
  throw new Error(`Only ${dims.length - failedDims.length}/10 dimensions completed (failed: ${failedDims.join(', ')}) — below the 8-dimension floor; rerun the failed dimensions`)
}

const totalSurviving = dims.reduce((s, d) => s + d.findings.length, 0)
const totalRejected = dims.reduce((s, d) => s + d.rejected, 0)
log(`Audit+verify complete: ${totalSurviving} findings survived across ${dims.length - failedDims.length} dimensions (${totalRejected} rejected${failedDims.length ? `; failed dims: ${failedDims.join(', ')}` : ''})`)

// ---------- Stage C: synthesis ----------

phase('Synthesize')

const stats = {
  perDimension: dims.map((d) => ({
    key: d.key,
    failed: d.failed,
    surviving: d.findings.length,
    confirmed: d.confirmed,
    corrected: d.corrected,
    rejected: d.rejected,
    unchecked: d.unchecked,
  })),
  totalSurviving,
  totalRejected,
  failedDimensions: failedDims,
}

const report = await safeAgent(synthesisPrompt(dims, stats), {
  schema: REPORT_SCHEMA,
  label: 'synthesize-report',
  phase: 'Synthesize',
})

if (!report) throw new Error('Synthesis agent failed — findings JSON is in the journal; rerun synthesis only via resume')

log(`Report written: ${report.reportPath} (${report.findingCount} findings, ${report.rejectedCount} rejected)`)

return {
  reportPath: report.reportPath,
  findingCount: report.findingCount,
  rejectedCount: report.rejectedCount,
  phases: report.phases,
  failedDimensions: failedDims,
  stats,
}

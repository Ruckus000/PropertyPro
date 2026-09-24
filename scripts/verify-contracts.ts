/**
 * A1 Contracts Guard — Route Contract Adoption Ratchet
 *
 * Enforces that every API route handler under `apps/web/src/app/api/**\/route.ts`
 * is wrapped with `runRoute()` from `@propertypro/api-contract`. This guard
 * locks in Plan A1's foundation (#405) and lets future route migrations be
 * drained one-by-one from the allowlist.
 *
 * Why: with A1's runner shipped, every new route should declare a typed
 * contract. Without a CI ratchet, a fresh route written tomorrow could skip
 * the contract entirely and the floor would silently rise back up.
 *
 * Existing routes: 46 files (2026-09-23), grandfathered via ALLOWLIST_REASONS.
 * They are NOT migrated as part of this guard's introduction (per the plan,
 * "no big-bang refactors"). Existing files remain on the allowlist; new
 * files MUST use `runRoute()`.
 *
 * CON-07 (2026-09-23): the allowlist is a `Map<path, AllowlistReason>`, not a
 * bare Set — every entry carries a machine-readable classification of WHY it
 * cannot go through the runner today. This is the single source of truth for
 * permanent skips; the prose in `.claude/rules/api-patterns.md` and the
 * pre-seed in `.claude/skills/drain-loop.md` are derived from it, not parallel
 * registries. An entry without a reason fails this guard, and only the three
 * CON-05 CRUD routes (announcements / meetings / maintenance-requests) may
 * carry `pending-drain` — anything else claimed as pending-drain must actually
 * be drained, not relabelled.
 *
 * Detection: a route is "contracted" if its source contains a call to
 * `runRoute(...)`. This is the canonical adoption marker — the only way to
 * use the contract package is to wrap your handler. We don't require an
 * exported `contract` constant (the contract can live in `./contract.ts`
 * next to the handler, or be inlined inside `runRoute(defineRoute({...}), ...)`).
 *
 * Companion guards:
 *   - guard:component-api-calls (#198)        — first boundary (UI → route)
 *   - guard:component-service-imports (#208)  — second boundary (UI → service)
 *   - guard:route-table-imports (#242)        — third boundary (route → table)
 *   - guard:authz-comments (#203)             — gates @propertypro/db/unsafe
 *
 * Plan reference: ~/.claude/plans/draft-a-plan-that-reflective-pie.md § A1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCeiling } from './lib/ceiling';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

const SCAN_ROOT = 'apps/web/src/app/api';

/**
 * Shrink-only ceiling on the grandfather allowlist below.
 *
 * Pinned at 46 (2026-09-07). THE LANE IS CLOSED to new entries: every one of
 * the 46 now carries a machine-readable `AllowlistReason` (CON-07), and 43 of
 * them are structurally runner-blocked (internal cron token-auth, raw webhook
 * bodies, redirects, Set-Cookie, non-JSON content types, non-200 durability
 * codes, multipart, headless-Chromium publishes). The honest floor is 46
 * TODAY, not the eventual ~41, because pinning lower would fail the moment
 * CON-05 lands a partial drain and force a ceiling RAISE on a "closed" lane —
 * the exact anti-pattern this pin exists to prevent.
 *
 * Named shrink paths (the only sanctioned ways this number goes down):
 *   - CON-05 (Phase 3.5): drain the 3 `pending-drain` CRUD routes
 *     (announcements / meetings / maintenance-requests) once the runner grows
 *     the envelope-sibling + audit-context channels (CON-04/06). −3.
 *   - DC-05 (Phase 2.12): DELETE the two statutory violation-notice PDF
 *     routes (violations/[id]/notice, violations/[id]/hearing-notice) if
 *     product confirms they stay unwired. −2 by deletion, not drainage.
 * Together those take the floor to ~41. Do not expect zero.
 *
 * Growth history, for the record: it went 37 -> 46 in the seven weeks after
 * the 2026-07-18 audit measured it, one appended line at a time (same
 * dating as `scripts/lib/ceiling.ts`).
 */
const ALLOWLIST_CEILING = 46;

// ---------------------------------------------------------------------------
// Adoption marker
//
// A route is considered "contracted" if its source contains a call to
// `runRoute(...)`. This is a pragmatic regex check — match `\brunRoute\s*\(`
// rather than full AST parsing. Comments mentioning `runRoute` would NOT
// trip the check because they don't have the `(` follow-up on the same line
// pattern most of the time; if a route author wants to leave a doc-comment
// without adopting, they should reference it as text (e.g. "uses runRoute")
// or wrap in backticks (e.g. `runRoute()`).
//
// Note: the marker `runRoute(` does match the latter, but adopting the
// runner is so cheap that producing false positives via a misleading comment
// is not a realistic problem. If it ever happens, tighten the regex.
// ---------------------------------------------------------------------------

const RUN_ROUTE_REGEX = /\brunRoute\s*\(/;

// ---------------------------------------------------------------------------
// Grandfather allowlist — 46 routes that predate the guard (Plan A1
// foundation #405 shipped only the document-categories pilot). New files
// MUST NOT be added without explicit review — the guard errors on any new
// file.
//
// CON-07: this is a Map<path, AllowlistReason>, not a bare Set. Every entry
// carries the classification of WHY it cannot go through `runRoute()` today;
// the guard fails an entry with no reason (or with an unknown reason). The
// reason values below were AUTHORED by reading each route (2026-09-23), not
// copied from prose — the map is the machine-readable single source of truth
// for permanent skips, and `drain-loop`'s PERMANENT_SKIPS pre-seed is
// regenerated from `git show origin/main:scripts/verify-contracts.ts`.
//
// To migrate a file off the list:
//   1. Author the contract — either inline `runRoute(defineRoute({...}), ...)`
//      or factor into a sibling `contract.ts` (preferred for shared client
//      type imports; see `apps/web/src/app/api/v1/document-categories/contract.ts`).
//   2. Convert the handler body to the runner-input shape (`{ params, query,
//      body, req }`) and return the canonical inner payload.
//   3. Compose with `withErrorHandler(runRoute(contract, handler))`.
//   4. Remove the entry (path AND reason) from this map.
//   5. Update any consumer hook to use `Infer<typeof contract>` (optional in
//      this PR; required when the response shape is non-trivial).
// ---------------------------------------------------------------------------

/**
 * Why an allowlisted route cannot currently be wrapped in `runRoute()`.
 * The union mirrors the runner's documented constraints
 * (`.claude/rules/api-patterns.md` → "Known constraints"), widened per-entry
 * by what the route actually does — see each entry's comment.
 */
export type AllowlistReason =
  /** `/internal/*` Bearer/CRON-secret crons — the runner has no token-auth
   * bypass and resolves tenancy from session headers these routes never have. */
  | 'internal-cron'
  /** Needs the RAW request body (HMAC / Twilio signature verification)
   * BEFORE any Zod parsing the runner performs. */
  | 'raw-body'
  /** Its whole contract is a 3xx redirect (signed storage URL / landing
   * page); the runner always emits a JSON 200 envelope. */
  | 'redirect'
  /** Must attach Set-Cookie headers; `buildResponse` constructs a fresh
   * `NextResponse.json(...)` with no way to carry response cookies. */
  | 'set-cookie'
  /** Returns a non-JSON binary/attachment content type — zip, CSV, PDF. */
  | 'non-json-binary'
  /** Returns an HTML page for a human (no-login token-auth unsubscribes). */
  | 'non-json-html'
  /** Its durability/monitoring contract is the non-200 STATUS CODE it
   * returns (429 temp-fail, 503 stale-probe, 422/503 provider errors). */
  | 'status-codes'
  /** Accepts multipart/form-data; the runner Zod-parses a JSON body. */
  | 'multipart'
  /** Headless-Chromium render needing the Node runtime and an extended
   * function `maxDuration` — a batch job wearing a route's clothes. */
  | 'headless-long-running'
  /** Genuinely drainable: the three CON-05 legacy action-dispatch CRUD
   * routes, blocked only on the runner's envelope-sibling + audit-context
   * extension (CON-04/06, Phase 3.4). NOTHING else may carry this. */
  | 'pending-drain';

/**
 * The ONLY paths permitted to carry `pending-drain` (CON-05, Phase 3.5).
 * Everything else that claims pending-drain is a real permanent skip being
 * laundered into "we'll get to it" — the guard refuses it.
 */
const PENDING_DRAIN_ROUTES = new Set<string>([
  'apps/web/src/app/api/v1/announcements/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/route.ts',
  'apps/web/src/app/api/v1/meetings/route.ts',
]);

const ALLOWLIST_REASONS = new Map<string, AllowlistReason>([
  // `runRoute`'s `buildResponse` always constructs a fresh
  // `NextResponse.json(...)`, so a handler has no way to attach a `Set-Cookie`.
  // This route's whole job is to close the support session AND expire the
  // `pp-support-session` cookie in one response. `auth/demo-login/route.ts`
  // below carries the same class of blocker (it redirects AND sets cookies).
  //
  // Drain this entry when the runner grows a way to return response headers
  // (e.g. a `{ data, cookies }` result shape), not by dropping the cookie.
  ['apps/web/src/app/api/v1/support/end-session/route.ts', 'set-cookie'],
  // Platform liveness probe: `runtime = 'edge'` and deliberately OUTSIDE
  // `/api/v1` — uptime monitors poll its bare `{ status: 'ok' }` shape, and a
  // 503-style down signal is a monitoring contract the JSON-200-only runner
  // cannot express (the in-suite 503 variant is internal/cron-health below).
  // Classified `status-codes` because the binding constraint is the probe's
  // status/response contract, not its payload.
  ['apps/web/src/app/api/health/route.ts', 'status-codes'],
  // CON-05 (Phase 3.5): legacy action-dispatch CRUD. Drainable once CON-04/06
  // give the runner the envelope-sibling + audit-context channels.
  ['apps/web/src/app/api/v1/announcements/route.ts', 'pending-drain'],
  // Serves BOTH paginated JSON and `?format=csv` → `text/csv` attachment with
  // custom X-CSV-* truncation headers, one handler, one route. The CSV branch
  // makes it non-JSON like the export family below.
  ['apps/web/src/app/api/v1/audit-trail/route.ts', 'non-json-binary'],
  // Dev-only login helper: 302 to a target portal AND sets the session
  // cookies on the redirect — the two blockers above combined.
  ['apps/web/src/app/api/v1/auth/demo-login/route.ts', 'redirect'],
  // Demo enter: 303 redirect chain into a provisioned demo community.
  ['apps/web/src/app/api/v1/demo/[slug]/enter/route.ts', 'redirect'],
  // 302s an authenticated visitor to a short-lived signed storage URL. A
  // JSON envelope would mean the client cannot simply follow a Download link.
  ['apps/web/src/app/api/v1/documents/[id]/download/route.ts', 'redirect'],
  // Accepts a single image via multipart/form-data (`req.formData()`); the
  // runner Zod-parses a JSON body.
  ['apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts', 'multipart'],
  // Headless-Chromium PDF render — needs the nodejs runtime, elevated memory,
  // and an extended function maxDuration. A batch job behind a route.
  ['apps/web/src/app/api/v1/documents/drafts/[id]/publish/route.ts', 'headless-long-running'],
  // Streams an `application/zip` via `archiver` (Node streams; `runtime =
  // 'nodejs'`). Non-JSON, and the run may outlive a normal function budget.
  ['apps/web/src/app/api/v1/export/route.ts', 'non-json-binary'],
  // `text/csv` attachment.
  ['apps/web/src/app/api/v1/finance/export/csv/route.ts', 'non-json-binary'],
  // `application/pdf` inline/attachment.
  ['apps/web/src/app/api/v1/finance/export/statement/route.ts', 'non-json-binary'],
  // --- internal/* block (21 entries): Bearer/CRON-secret token-auth crons.
  // The runner has no integration for token-authenticated (cron-secret) auth,
  // resolves tenancy from session headers these routes never carry, and
  // hardcodes a 200 JSON envelope. Some also export GET and POST from one
  // handler. Same posture for every sibling in this block. ---
  ['apps/web/src/app/api/v1/internal/account-lifecycle/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/assessment-overdue/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/calendar-event-reminders/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/community-export-worker/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/compliance-alerts/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts', 'internal-cron'],
  // Also a 503 stale-job probe: `runRoute` hardcodes a 200, and this probe's
  // entire purpose is to return 503 when a scheduled job has gone stale. It
  // still enters via the cron token, so `internal-cron` owns the entry.
  ['apps/web/src/app/api/v1/internal/cron-health/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/expire-demos/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/generate-assessments/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/late-fee-processor/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/notification-digests/process/route.ts', 'internal-cron'],
  // Snowbird digest cron (no tenant/session); its HTML-unsubscribe sibling is
  // the separate `non-json-html` entry below it.
  ['apps/web/src/app/api/v1/internal/snowbird-digest/route.ts', 'internal-cron'],
  // Snowbird no-login unsubscribe confirmation: signed-token GET returns an
  // HTML page — no session for the runner to resolve tenancy from.
  ['apps/web/src/app/api/v1/snowbird-digest/unsubscribe/route.ts', 'non-json-html'],
  // Insurance alerts cron; HTML-unsubscribe sibling below, same shape.
  ['apps/web/src/app/api/v1/internal/insurance-alerts/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/insurance-alerts/unsubscribe/route.ts', 'non-json-html'],
  // Community bulk-email unsubscribe (announcements / notifications / digests /
  // calendar reminders). Identical shape to the two above: no session, a signed
  // token instead of tenant scope, an HTML confirmation page for the human GET
  // and a bare-text 200 for the RFC 8058 one-click POST. runRoute can express
  // none of those — it resolves tenancy from headers and emits a JSON envelope.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-11.
  ['apps/web/src/app/api/v1/notifications/unsubscribe/route.ts', 'non-json-html'],
  ['apps/web/src/app/api/v1/internal/payment-reminders/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/provision/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/provisioning-watchdog/route.ts', 'internal-cron'],
  // Bearer-token readiness probe (READINESS_CHECK_SECRET / CRON_SECRET).
  ['apps/web/src/app/api/v1/internal/readiness/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/scheduled-site-publish/route.ts', 'internal-cron'],
  ['apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts', 'internal-cron'],
  // CON-05 (Phase 3.5): legacy action-dispatch CRUD — the ONLY one of the
  // three with no known runner blocker today.
  ['apps/web/src/app/api/v1/maintenance-requests/route.ts', 'pending-drain'],
  // CON-05 (Phase 3.5): legacy action-dispatch CRUD; real blocker is the
  // envelope-sibling smuggling it does today (CON-04), not a status code.
  ['apps/web/src/app/api/v1/meetings/route.ts', 'pending-drain'],
  // Twilio Verify send/confirm: the caller branches on 429 / 503 / 422 / 400
  // (rate-limit, provider-down, invalid-code). `runRoute` hardcodes 200.
  ['apps/web/src/app/api/v1/phone/verify/confirm/route.ts', 'status-codes'],
  ['apps/web/src/app/api/v1/phone/verify/send/route.ts', 'status-codes'],
  // DC-05 candidates: statutory violation-notice PDFs with zero client call
  // sites — these shrink via DELETION in Phase 2.12, not drainage. `runtime
  // = 'nodejs'` PDF render + `application/pdf` attachment.
  ['apps/web/src/app/api/v1/violations/[id]/hearing-notice/route.ts', 'non-json-binary'],
  ['apps/web/src/app/api/v1/violations/[id]/notice/route.ts', 'non-json-binary'],
  // Stripe webhook: signature verification needs the RAW body before any
  // Zod parsing; also returns non-2xx on unprocessable events (retry loop).
  ['apps/web/src/app/api/v1/webhooks/stripe/route.ts', 'raw-body'],
  // Twilio webhook: HMAC over `req.text()` before parsing, and the TwiML
  // reply is its own content-type game.
  ['apps/web/src/app/api/v1/webhooks/twilio/route.ts', 'raw-body'],
  // Inbound support mail. The runner hardcodes a 200 response, and this
  // route's entire durability contract is the status code it returns: a 429
  // makes Forward Email temp-fail the SMTP session so the SENDER's mail server
  // holds the message and retries for 24-72 hours; a 200 over a failed write
  // loses it silently while telling the sender it arrived. It also needs the
  // raw request body for HMAC verification before any parsing, like the two
  // webhooks above. Classified `raw-body` (the shared webhook blocker); the
  // status-code need is secondary and recorded here.
  ['apps/web/src/app/api/v1/webhooks/inbound-email/route.ts', 'raw-body'],
  // 302 an anonymous visitor to a short-lived signed storage URL. A JSON
  // envelope would mean the association's public site could not simply link
  // to it. Drain when the runner can express a redirect, not by returning
  // JSON to a browser that followed a Download link.
  ['apps/web/src/app/api/v1/public/documents/[id]/download/route.ts', 'redirect'],
]);

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

function walkDir(dirAbs: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const abs = join(dirAbs, entry);
    let s;
    try {
      s = statSync(abs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...walkDir(abs));
    } else if (s.isFile() && entry === 'route.ts') {
      out.push(abs);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Route Contract Adoption Guard (Plan A1)');
  console.log('='.repeat(60));

  const rootAbs = resolve(repoRoot, SCAN_ROOT);
  const files = walkDir(rootAbs);

  // For each route: is it contracted?
  const uncontractedFiles: string[] = [];
  const contractedFiles: string[] = [];
  for (const fileAbs of files) {
    const rel = relative(repoRoot, fileAbs);
    const content = readFileSync(fileAbs, 'utf-8');
    if (RUN_ROUTE_REGEX.test(content)) {
      contractedFiles.push(rel);
    } else {
      uncontractedFiles.push(rel);
    }
  }

  // Bucket uncontracted into allowlisted (grandfathered) vs new (violations).
  const allowlistedHits = new Set<string>();
  const newViolations: string[] = [];
  for (const rel of uncontractedFiles) {
    if (ALLOWLIST_REASONS.has(rel)) {
      allowlistedHits.add(rel);
    } else {
      newViolations.push(rel);
    }
  }

  // Detect dead allowlist entries — files that DO now have a contract (or no
  // longer exist). Pruning these keeps the debt ledger honest and the
  // count meaningful as a progress metric.
  const deadAllowlistEntries: string[] = [];
  for (const entry of ALLOWLIST_REASONS.keys()) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  // CON-07 classification integrity. TypeScript makes an omitted/unknown
  // reason a compile error in the literal above, but this file is run through
  // tsx, and a future refactor could widen the value type — so the guard
  // asserts the invariants itself:
  //   1. every entry carries a non-empty, known AllowlistReason;
  //   2. `pending-drain` is reserved for the three CON-05 CRUD routes —
  //      anything else claiming it is a permanent skip being laundered into
  //      "we'll get to it", or a drainable route being frozen permanently by
  //      omission from PENDING_DRAIN_ROUTES (both fail loudly here).
  const VALID_REASONS = new Set<AllowlistReason>([
    'internal-cron',
    'raw-body',
    'redirect',
    'set-cookie',
    'non-json-binary',
    'non-json-html',
    'status-codes',
    'multipart',
    'headless-long-running',
    'pending-drain',
  ]);
  const unclassifiedEntries: string[] = [];
  const misusedPendingDrain: string[] = [];
  for (const [entry, reason] of ALLOWLIST_REASONS) {
    if (!reason || !VALID_REASONS.has(reason)) {
      unclassifiedEntries.push(`${entry} (reason: ${JSON.stringify(reason)})`);
    }
    if (reason === 'pending-drain' && !PENDING_DRAIN_ROUTES.has(entry)) {
      misusedPendingDrain.push(entry);
    }
  }
  // Conversely: a CON-05 route marked with any other reason freezes the
  // closed lane around routes the plan says must drain in Phase 3.5.
  const pendingDrainFrozen: string[] = [];
  for (const drainable of PENDING_DRAIN_ROUTES) {
    if (ALLOWLIST_REASONS.has(drainable) && ALLOWLIST_REASONS.get(drainable) !== 'pending-drain') {
      pendingDrainFrozen.push(drainable);
    }
  }

  console.log(`\nScanned ${files.length} route.ts files.`);
  console.log(
    `Contracted: ${contractedFiles.length}; ` +
      `Allowlist: ${ALLOWLIST_REASONS.size} grandfathered files; ` +
      `${allowlistedHits.size} active hits.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} file(s) are in ALLOWLIST_REASONS ` +
        `but now use runRoute() (or no longer exist). ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (unclassifiedEntries.length > 0) {
    console.error(
      `\n❌ ${unclassifiedEntries.length} allowlist entries carry no valid AllowlistReason ` +
        `(CON-07: every entry must state WHY the runner cannot take it today):`,
    );
    for (const entry of unclassifiedEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (misusedPendingDrain.length > 0) {
    console.error(
      `\n❌ ${misusedPendingDrain.length} entries claim 'pending-drain' but are not CON-05 ` +
        `routes. Only announcements / meetings / maintenance-requests may be pending; a ` +
        `genuinely blocked route must name its constraint family instead:`,
    );
    for (const entry of misusedPendingDrain) {
      console.error(`  - ${entry}`);
    }
  }

  if (pendingDrainFrozen.length > 0) {
    console.error(
      `\n❌ ${pendingDrainFrozen.length} CON-05 route(s) are classified as something other than ` +
        `'pending-drain' — that freezes a lane the roadmap closes in Phase 3.5:`,
    );
    for (const entry of pendingDrainFrozen) {
      console.error(`  - ${entry}`);
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} new route(s) do not call runRoute():`,
    );
    for (const v of newViolations) {
      console.error(`  ${v}`);
    }
    console.error(
      '\nPlan A1: every new API route must use runRoute() from ' +
        '`@propertypro/api-contract`. Declare a contract via ' +
        '`defineRoute({ method, path, request, response, paginated?, permission? })` ' +
        'and wrap the handler with `withErrorHandler(runRoute(contract, async ({...}) => {...}))`. ' +
        'See `apps/web/src/app/api/v1/document-categories/{contract.ts,route.ts}` for the pilot, ' +
        'and `packages/api-contract/src/index.ts` for the full public surface.',
    );
  }

  // The allowlist is a hand-edited map: without a ceiling, "add a line" is the
  // frictionless way past this guard, and it went 37 -> 46 in the seven weeks
  // after the 2026-07-18 audit measured it.
  const ceiling = checkCeiling(
    'Uncontracted-route allowlist',
    ALLOWLIST_REASONS.size,
    ALLOWLIST_CEILING,
    'Contract the route through runRoute() instead of allowlisting it — see ' +
      '`.claude/rules/api-patterns.md` for the runner constraints that make a ' +
      'route genuinely uncontractable (201/202/204, raw bodies, non-JSON).',
  );
  if (ceiling.message) {
    console[ceiling.failed ? 'error' : 'log'](`\n${ceiling.failed ? '❌' : 'ℹ️ '} ${ceiling.message}`);
  }

  const hasErrors =
    newViolations.length > 0 || deadAllowlistEntries.length > 0 || unclassifiedEntries.length > 0 ||
    misusedPendingDrain.length > 0 || pendingDrainFrozen.length > 0 || ceiling.failed;
  if (hasErrors) {
    process.exit(1);
  }

  console.log(
    `\n✅ No new uncontracted routes outside the allowlist. ` +
      `${ALLOWLIST_REASONS.size} classified files remain (ceiling ${ALLOWLIST_CEILING}) — A1 lane CLOSED; ` +
      `it shrinks only via CON-05 (3 pending-drain CRUD routes, Phase 3.5) and DC-05 (2 PDF routes by deletion, Phase 2.12).`,
  );
}

main();

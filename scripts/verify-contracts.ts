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
 * Existing routes: 229 files, grandfathered via KNOWN_UNCONTRACTED_ROUTES.
 * They are NOT migrated as part of this guard's introduction (per the plan,
 * "no big-bang refactors"). Existing files remain on the allowlist; new
 * files MUST use `runRoute()`.
 *
 * Goal: drain KNOWN_UNCONTRACTED_ROUTES over time. As features touch a
 * grandfathered file, the author should adopt the runner and remove the file
 * from this list. The companion `defineRoute` / `Infer<typeof contract>` API
 * is documented in `packages/api-contract/src/index.ts`.
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

const SCAN_ROOT = 'apps/web/src/app/api';

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
// Grandfather allowlist — 229 routes that predate the guard (Plan A1
// foundation #405 shipped only the document-categories pilot). New files
// MUST NOT be added without explicit review — the guard errors on any new
// file.
//
// To migrate a file off the list:
//   1. Author the contract — either inline `runRoute(defineRoute({...}), ...)`
//      or factor into a sibling `contract.ts` (preferred for shared client
//      type imports; see `apps/web/src/app/api/v1/document-categories/contract.ts`).
//   2. Convert the handler body to the runner-input shape (`{ params, query,
//      body, req }`) and return the canonical inner payload.
//   3. Compose with `withErrorHandler(runRoute(contract, handler))`.
//   4. Remove the file from this set.
//   5. Update any consumer hook to use `Infer<typeof contract>` (optional in
//      this PR; required when the response shape is non-trivial).
// ---------------------------------------------------------------------------

const KNOWN_UNCONTRACTED_ROUTES = new Set<string>([
  // NOT grandfathered — added 2026-08-05, and for a specific reason worth
  // recording: `runRoute`'s `buildResponse` always constructs a fresh
  // `NextResponse.json(...)`, so a handler has no way to attach a `Set-Cookie`.
  // This route's whole job is to close the support session AND expire the
  // `pp-support-session` cookie in one response. `auth/demo-login/route.ts`
  // below is on this list for the same reason.
  //
  // Drain this entry when the runner grows a way to return response headers
  // (e.g. a `{ data, cookies }` result shape), not by dropping the cookie.
  'apps/web/src/app/api/v1/support/end-session/route.ts',
  // NOT grandfathered — added with the public-documents path, same class of
  // reason as the entry above. `runRoute`'s `buildResponse` always constructs a
  // fresh `NextResponse.json(...)`, and this route's whole job is to 302 an
  // anonymous visitor to a short-lived signed storage URL. A JSON envelope would
  // mean the association's public site could not simply link to it.
  //
  // Drain this entry when the runner can express a redirect, not by returning
  // JSON to a browser that followed a Download link.
  'apps/web/src/app/api/health/route.ts',
  'apps/web/src/app/api/v1/announcements/route.ts',
  'apps/web/src/app/api/v1/audit-trail/route.ts',
  'apps/web/src/app/api/v1/auth/demo-login/route.ts',
  'apps/web/src/app/api/v1/demo/[slug]/enter/route.ts',
  'apps/web/src/app/api/v1/documents/[id]/download/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/publish/route.ts',
  'apps/web/src/app/api/v1/export/route.ts',
  'apps/web/src/app/api/v1/finance/export/csv/route.ts',
  'apps/web/src/app/api/v1/finance/export/statement/route.ts',
  'apps/web/src/app/api/v1/internal/account-lifecycle/route.ts',
  'apps/web/src/app/api/v1/internal/assessment-overdue/route.ts',
  'apps/web/src/app/api/v1/internal/calendar-event-reminders/route.ts',
  // Internal cron routes are a documented runRoute constraint: the runner has no
  // integration for token-authenticated (cron-secret) auth, and this one also
  // exports both GET and POST from one handler. Same posture as every sibling
  // in this block.
  'apps/web/src/app/api/v1/internal/community-export-worker/route.ts',
  'apps/web/src/app/api/v1/internal/compliance-alerts/route.ts',
  'apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts',
  'apps/web/src/app/api/v1/internal/expire-demos/route.ts',
  'apps/web/src/app/api/v1/internal/generate-assessments/route.ts',
  'apps/web/src/app/api/v1/internal/late-fee-processor/route.ts',
  'apps/web/src/app/api/v1/internal/notification-digests/process/route.ts',
  // Snowbird digest: Bearer-token cron (no tenant/session) + no-login token-auth
  // unsubscribe that returns an HTML page — neither fits the tenant-scoped
  // runRoute/JSON-envelope model, same as the digest/webhook crons above.
  'apps/web/src/app/api/v1/internal/snowbird-digest/route.ts',
  'apps/web/src/app/api/v1/snowbird-digest/unsubscribe/route.ts',
  // Insurance alerts: Bearer-token cron + no-login token-auth unsubscribe
  // (HTML page + one-click POST) — same non-tenant-scoped shape as snowbird.
  'apps/web/src/app/api/v1/internal/insurance-alerts/route.ts',
  'apps/web/src/app/api/v1/insurance-alerts/unsubscribe/route.ts',
  // Community bulk-email unsubscribe (announcements / notifications / digests /
  // calendar reminders). Identical shape to the two above: no session, a signed
  // token instead of tenant scope, an HTML confirmation page for the human GET
  // and a bare-text 200 for the RFC 8058 one-click POST. runRoute can express
  // none of those — it resolves tenancy from headers and emits a JSON envelope.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-11.
  'apps/web/src/app/api/v1/notifications/unsubscribe/route.ts',
  'apps/web/src/app/api/v1/internal/payment-reminders/route.ts',
  'apps/web/src/app/api/v1/internal/provision/route.ts',
  'apps/web/src/app/api/v1/internal/provisioning-watchdog/route.ts',
  'apps/web/src/app/api/v1/internal/readiness/route.ts',
  'apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts',
  'apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts',
  'apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/route.ts',
  'apps/web/src/app/api/v1/meetings/route.ts',
  'apps/web/src/app/api/v1/phone/verify/confirm/route.ts',
  'apps/web/src/app/api/v1/phone/verify/send/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/hearing-notice/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/notice/route.ts',
  'apps/web/src/app/api/v1/webhooks/stripe/route.ts',
  'apps/web/src/app/api/v1/webhooks/twilio/route.ts',
  'apps/web/src/app/api/v1/public/documents/[id]/download/route.ts',
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
    if (KNOWN_UNCONTRACTED_ROUTES.has(rel)) {
      allowlistedHits.add(rel);
    } else {
      newViolations.push(rel);
    }
  }

  // Detect dead allowlist entries — files that DO now have a contract (or no
  // longer exist). Pruning these keeps the debt ledger honest and the
  // count meaningful as a progress metric.
  const deadAllowlistEntries: string[] = [];
  for (const entry of KNOWN_UNCONTRACTED_ROUTES) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  console.log(`\nScanned ${files.length} route.ts files.`);
  console.log(
    `Contracted: ${contractedFiles.length}; ` +
      `Allowlist: ${KNOWN_UNCONTRACTED_ROUTES.size} grandfathered files; ` +
      `${allowlistedHits.size} active hits.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} file(s) are in KNOWN_UNCONTRACTED_ROUTES ` +
        `but now use runRoute() (or no longer exist). ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
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

  const hasErrors = newViolations.length > 0 || deadAllowlistEntries.length > 0;
  if (hasErrors) {
    process.exit(1);
  }

  console.log(
    `\n✅ No new uncontracted routes outside the allowlist. ` +
      `${KNOWN_UNCONTRACTED_ROUTES.size} grandfathered files remain — drain over time.`,
  );
}

main();

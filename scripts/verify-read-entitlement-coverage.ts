/**
 * guard:read-entitlement — lapsed-state admin read coverage.
 *
 * Blocks admin-tier reads on a `lapsed` community (see
 * apps/web/src/lib/middleware/read-entitlement-guard.ts). The lockout is only
 * real if every admin GET route participates, so this guard fails when an
 * in-scope route neither calls `requireEntitledForAdminRead` nor is explicitly
 * exempt. It is the backstop that stops a NEW admin GET route from silently
 * shipping ungated.
 *
 * ## Scope (heuristic, matches the repo's other route guards)
 *   in-scope  = file exports `GET` AND calls `requireCommunityMembership(`
 *   satisfied = calls `requireEntitledForAdminRead(`  (gated)
 *            OR carries a `// read-entitlement:exempt — <reason>` comment
 *            OR is listed in REACTIVATION_CRITICAL or PENDING_BROAD_GATE below
 *
 * ## The two allowlists
 * The lapsed read-gate rolls out in two PRs. PR #1 introduces the guard, the
 * shared middleware, one worked route (`/api/v1/ledger`), the transparency
 * gate, and this checker. The ~100-route broad sweep is PR #2. Rather than
 * stamp an inline comment onto 100 files in PR #1 only to delete them in PR #2,
 * the current backlog is captured here as a single reviewable, SHRINK-ONLY
 * baseline (same pattern as scripts/design-token-baseline.json):
 *
 *   REACTIVATION_CRITICAL — PERMANENT exemptions. A lapsed admin must still be
 *     able to reach these to recover: the dunning notifications that carry the
 *     "reactivate" message, notification prefs, onboarding (pre-subscription),
 *     resident-dues fee policy + Stripe Connect status (Connect is separate
 *     from the platform subscription), and the display-name lookup the billing
 *     UI itself calls. NEVER gate these.
 *
 *   PENDING_BROAD_GATE — TEMPORARY. The PR #2 backlog. Each route here will be
 *     gated (or reclassified as reactivation-critical) in PR #2; as that lands,
 *     delete the route from this array. The guard warns with the remaining
 *     count so the backlog is never silent. Do NOT add new routes here — a new
 *     ungated admin GET route must gate or carry an inline exempt comment.
 *
 * When a PENDING route is gated in PR #2, remove it from the array. When every
 * PENDING route is drained, delete the array and this note.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = 'apps/web/src/app/api/v1';
const EXEMPT_COMMENT = /\/\/\s*read-entitlement:exempt\b/;
const HAS_GET = /export\s+const\s+GET\b/;
const RESOLVES_MEMBERSHIP = /requireCommunityMembership\s*\(/;
const GATED = /requireEntitledForAdminRead\s*\(/;

/** PERMANENT — a lapsed admin needs these to reactivate. Never gate. */
const REACTIVATION_CRITICAL: readonly string[] = [
  'apps/web/src/app/api/v1/notification-preferences/route.ts',
  'apps/web/src/app/api/v1/notifications/route.ts',
  'apps/web/src/app/api/v1/notifications/unread-count/route.ts',
  'apps/web/src/app/api/v1/onboarding/apartment/route.ts',
  'apps/web/src/app/api/v1/onboarding/checklist/route.ts',
  'apps/web/src/app/api/v1/onboarding/condo/route.ts',
  'apps/web/src/app/api/v1/payments/fee-policy/route.ts',
  'apps/web/src/app/api/v1/stripe/connect/status/route.ts',
  'apps/web/src/app/api/v1/users/names/route.ts',
];

/** TEMPORARY — PR #2 broad-gate backlog. Shrink-only; remove as each is gated. */
const PENDING_BROAD_GATE: readonly string[] = [
  'apps/web/src/app/api/v1/access-requests/route.ts',
  'apps/web/src/app/api/v1/accounting/callback/route.ts',
  'apps/web/src/app/api/v1/accounting/mapping/route.ts',
  'apps/web/src/app/api/v1/admin/join-requests/route.ts',
  'apps/web/src/app/api/v1/amenities/[id]/schedule/route.ts',
  'apps/web/src/app/api/v1/amenities/route.ts',
  'apps/web/src/app/api/v1/announcements/route.ts',
  'apps/web/src/app/api/v1/arc/[id]/route.ts',
  'apps/web/src/app/api/v1/arc/route.ts',
  'apps/web/src/app/api/v1/assessments/[id]/line-items/route.ts',
  'apps/web/src/app/api/v1/assessments/route.ts',
  'apps/web/src/app/api/v1/audit-trail/route.ts',
  'apps/web/src/app/api/v1/calendar/events/route.ts',
  'apps/web/src/app/api/v1/calendar/google/callback/route.ts',
  'apps/web/src/app/api/v1/community/contact/route.ts',
  'apps/web/src/app/api/v1/compliance/route.ts',
  'apps/web/src/app/api/v1/contracts/route.ts',
  'apps/web/src/app/api/v1/delinquency/route.ts',
  'apps/web/src/app/api/v1/document-categories/route.ts',
  'apps/web/src/app/api/v1/documents/[id]/versions/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/document-search/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/route.ts',
  'apps/web/src/app/api/v1/documents/route.ts',
  'apps/web/src/app/api/v1/documents/search/route.ts',
  'apps/web/src/app/api/v1/elections/[id]/my-vote/route.ts',
  'apps/web/src/app/api/v1/elections/[id]/proxies/route.ts',
  'apps/web/src/app/api/v1/elections/[id]/results/route.ts',
  'apps/web/src/app/api/v1/elections/[id]/route.ts',
  'apps/web/src/app/api/v1/elections/route.ts',
  'apps/web/src/app/api/v1/emergency-broadcasts/[id]/route.ts',
  'apps/web/src/app/api/v1/emergency-broadcasts/route.ts',
  'apps/web/src/app/api/v1/emergency-broadcasts/templates/route.ts',
  'apps/web/src/app/api/v1/esign/consent/route.ts',
  'apps/web/src/app/api/v1/esign/my-pending/route.ts',
  'apps/web/src/app/api/v1/esign/submissions/[id]/download/route.ts',
  'apps/web/src/app/api/v1/esign/submissions/[id]/route.ts',
  'apps/web/src/app/api/v1/esign/submissions/route.ts',
  'apps/web/src/app/api/v1/esign/templates/[id]/pdf/route.ts',
  'apps/web/src/app/api/v1/esign/templates/[id]/route.ts',
  'apps/web/src/app/api/v1/esign/templates/route.ts',
  'apps/web/src/app/api/v1/export/route.ts',
  'apps/web/src/app/api/v1/faqs/route.ts',
  'apps/web/src/app/api/v1/finance/export/csv/route.ts',
  'apps/web/src/app/api/v1/finance/export/statement/route.ts',
  'apps/web/src/app/api/v1/forum/threads/[id]/route.ts',
  'apps/web/src/app/api/v1/forum/threads/route.ts',
  'apps/web/src/app/api/v1/help/article/route.ts',
  'apps/web/src/app/api/v1/help/contextual/route.ts',
  'apps/web/src/app/api/v1/help/featured/route.ts',
  'apps/web/src/app/api/v1/help/feedback/route.ts',
  'apps/web/src/app/api/v1/help/search/route.ts',
  'apps/web/src/app/api/v1/help/views/route.ts',
  'apps/web/src/app/api/v1/insurance/certificate-requests/route.ts',
  'apps/web/src/app/api/v1/insurance/policies/route.ts',
  'apps/web/src/app/api/v1/leases/route.ts',
  'apps/web/src/app/api/v1/ledger/balance/[unitId]/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/route.ts',
  'apps/web/src/app/api/v1/meetings/[id]/route.ts',
  'apps/web/src/app/api/v1/meetings/route.ts',
  'apps/web/src/app/api/v1/move-checklists/[id]/route.ts',
  'apps/web/src/app/api/v1/move-checklists/route.ts',
  'apps/web/src/app/api/v1/operations/route.ts',
  'apps/web/src/app/api/v1/packages/my/route.ts',
  'apps/web/src/app/api/v1/packages/route.ts',
  'apps/web/src/app/api/v1/payments/history/route.ts',
  'apps/web/src/app/api/v1/payments/statement/route.ts',
  'apps/web/src/app/api/v1/pm/branding/route.ts',
  'apps/web/src/app/api/v1/pm/portfolio/templates/route.ts',
  'apps/web/src/app/api/v1/pm/site/blocks/route.ts',
  'apps/web/src/app/api/v1/pm/site/domain/check/route.ts',
  'apps/web/src/app/api/v1/pm/site/domain/route.ts',
  'apps/web/src/app/api/v1/pm/site/hero/route.ts',
  'apps/web/src/app/api/v1/polls/[id]/my-vote/route.ts',
  'apps/web/src/app/api/v1/polls/[id]/results/route.ts',
  'apps/web/src/app/api/v1/polls/route.ts',
  'apps/web/src/app/api/v1/reservations/route.ts',
  'apps/web/src/app/api/v1/reserve-assets/route.ts',
  'apps/web/src/app/api/v1/residents/route.ts',
  'apps/web/src/app/api/v1/search/announcements/route.ts',
  'apps/web/src/app/api/v1/search/documents/route.ts',
  'apps/web/src/app/api/v1/search/maintenance/route.ts',
  'apps/web/src/app/api/v1/search/meetings/route.ts',
  'apps/web/src/app/api/v1/search/residents/route.ts',
  'apps/web/src/app/api/v1/search/route.ts',
  'apps/web/src/app/api/v1/search/units/route.ts',
  'apps/web/src/app/api/v1/search/users/route.ts',
  'apps/web/src/app/api/v1/search/violations/route.ts',
  'apps/web/src/app/api/v1/settings/support-access/route.ts',
  'apps/web/src/app/api/v1/snowbird-digest/subscription/route.ts',
  'apps/web/src/app/api/v1/storm-damage/route.ts',
  'apps/web/src/app/api/v1/transparency/settings/route.ts',
  'apps/web/src/app/api/v1/units/route.ts',
  'apps/web/src/app/api/v1/vendors/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/hearing-notice/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/notice/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/route.ts',
  'apps/web/src/app/api/v1/violations/route.ts',
  'apps/web/src/app/api/v1/visitors/denied/match/route.ts',
  'apps/web/src/app/api/v1/visitors/denied/route.ts',
  'apps/web/src/app/api/v1/visitors/my/route.ts',
  'apps/web/src/app/api/v1/visitors/route.ts',
  'apps/web/src/app/api/v1/wind-mitigation/route.ts',
  'apps/web/src/app/api/v1/work-orders/[id]/route.ts',
  'apps/web/src/app/api/v1/work-orders/route.ts',
];

const ALLOWLISTED = new Set<string>([...REACTIVATION_CRITICAL, ...PENDING_BROAD_GATE]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out = out.concat(walk(p));
    } else if (p.endsWith('route.ts')) {
      out.push(p);
    }
  }
  return out;
}

// Normalize to forward slashes so allowlist membership is stable on any OS.
const norm = (p: string): string => p.split('\\').join('/');

const offenders: string[] = [];
const stalePending: string[] = [];
let pendingRemaining = 0;

for (const file of walk(API_ROOT)) {
  const key = norm(file);
  const src = readFileSync(file, 'utf8');
  const inScope = HAS_GET.test(src) && RESOLVES_MEMBERSHIP.test(src);
  const gated = GATED.test(src);

  // Detect a route that got gated (or is now exempt-commented) but was left in
  // the PENDING backlog — the baseline must shrink, not carry dead entries.
  if ((gated || EXEMPT_COMMENT.test(src)) && PENDING_BROAD_GATE.includes(key)) {
    stalePending.push(key);
  }
  if (PENDING_BROAD_GATE.includes(key) && !gated) pendingRemaining++;

  if (!inScope) continue;
  if (gated) continue;
  if (EXEMPT_COMMENT.test(src)) continue;
  if (ALLOWLISTED.has(key)) continue;

  offenders.push(key);
}

let failed = false;

if (offenders.length > 0) {
  failed = true;
  console.error('❌ guard:read-entitlement — admin GET routes missing the read-entitlement gate');
  console.error('   Each must call requireEntitledForAdminRead(communityId, membership),');
  console.error('   carry a "// read-entitlement:exempt — <reason>" comment, or (rollout only)');
  console.error('   be added to an allowlist in scripts/verify-read-entitlement-coverage.ts.\n');
  for (const f of offenders) console.error('   ' + f);
  console.error(`\n   ${offenders.length} offending route(s).`);
}

if (stalePending.length > 0) {
  failed = true;
  console.error('\n❌ guard:read-entitlement — stale PENDING_BROAD_GATE entries (now gated/exempt):');
  console.error('   Remove these from PENDING_BROAD_GATE — the baseline is shrink-only.\n');
  for (const f of stalePending) console.error('   ' + f);
}

if (failed) process.exit(1);

console.log(
  `✅ guard:read-entitlement — all admin GET routes gated or exempt ` +
    `(${pendingRemaining} route(s) still pending the PR #2 broad gate)`,
);

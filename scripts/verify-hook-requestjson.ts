/**
 * Hook requestJson Guard (Plan B6)
 *
 * Enforces the convention from Plan B6: data hooks under `apps/web/src/hooks/`
 * should reach `/api/v1/*` through the canonical `requestJson<T>` helper
 * (`apps/web/src/lib/api/request-json.ts`), not hand-rolled `fetch(...)` +
 * envelope unwrap.
 *
 * Why: `requestJson` centralizes the three things every hand-rolled fetch gets
 * subtly wrong:
 *   - unwrapping the canonical `{ data: T }` (and double-wrapped paginated)
 *     envelope — getting this wrong returns `{ data: ... }` typed as the
 *     payload, the exact `result.x === undefined` class of bug B6 fixed in
 *     useCreateBroadcast
 *   - parsing the `{ error: { code, message } }` error envelope — reading
 *     `err.error` directly yields the "[object Object]" message family
 *   - a single throw shape for TanStack Query error states
 *
 * This is the hook-layer companion to `verify-component-api-calls.ts` (which
 * forbids `fetch('/api/v1/*')` in components/pages outright). Together they
 * enforce: component → hook → `requestJson` → `/api/v1`.
 *
 * Grandfathered allowlist: the hooks that already call `fetch('/api/v1/*')`
 * directly on the date this guard was introduced are listed in
 * KNOWN_RAW_FETCH_HOOKS. This guard is a REGRESSION FLOOR, not a drain-to-zero
 * ledger. Unlike components (which must never fetch — see
 * verify-component-api-calls.ts), hooks ARE allowed to fetch, and a chunk of
 * this set is legitimately permanent: binary/CSV downloads, multipart uploads,
 * presign + external-PUT pipelines, custom error sentinel classes
 * (e.g. PublishConflictError), 429-with-retryAfter metadata, onboarding
 * readApiError, verbatim component-rendered error literals, and fire-and-forget
 * posts whose route returns no `{ data }` body. The rest are mostly-requestJson
 * hooks with one straggler raw fetch that can be picked off opportunistically.
 * The guard's job is to stop NEW raw-fetch hooks from being added — not to
 * force this set to zero.
 *
 * To migrate a hook off the list:
 *   1. Replace the `fetch('/api/v1/*')` call with `requestJson<T>(...)` from
 *      `apps/web/src/lib/api/request-json.ts` (verify the route returns the
 *      canonical `{ data: T }` envelope first).
 *   2. Remove the entry from KNOWN_RAW_FETCH_HOOKS.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './lib/is-main-module';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

export const SCAN_ROOTS: readonly string[] = ['apps/web/src/hooks'];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Match `fetch('/api/v1/...`, `fetch("/api/v1/...`, or `` fetch(`/api/v1/... ``.
 * Requiring a string-literal `/api/v1/` opener means fetches to variable URLs
 * (Supabase Storage presigned PUTs, etc.) are not flagged — those are
 * legitimately raw.
 *
 * Scans the whole file content (global, multiline) rather than line-by-line so
 * a wrapped `fetch(\n  '/api/v1/...')` is still caught — e.g. the multipart
 * image upload in `useDocumentDraft.ts`. (The sibling
 * verify-component-api-calls.ts is still line-by-line; B5 drained it to 0 so it
 * has no multiline survivors, but this guard's allowlist is large and a
 * wrapped call would otherwise slip through silently.)
 */
const DIRECT_API_FETCH_REGEX = /\bfetch\s*\(\s*[`'"]\/api\/v1\//g;

export interface Violation {
  file: string;
  line: number;
  excerpt: string;
}

export function findViolations(content: string, filePath: string): Violation[] {
  const violations: Violation[] = [];
  DIRECT_API_FETCH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIRECT_API_FETCH_REGEX.exec(content)) !== null) {
    const line = content.slice(0, match.index).split('\n').length;
    violations.push({
      file: filePath,
      line,
      excerpt: content.slice(match.index, match.index + 100).replace(/\s+/g, ' ').trim(),
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walkDirectory(dir: string, files: string[]): void {
  // Roots are asserted to exist before the walk, so a read failure here is a
  // real error and must surface rather than shrink the scan silently.
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walkDirectory(full, files);
      continue;
    }

    const ext = full.slice(full.lastIndexOf('.'));
    if (!FILE_EXTENSIONS.has(ext)) continue;
    if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
    if (full.endsWith('.spec.ts') || full.endsWith('.spec.tsx')) continue;
    files.push(full);
  }
}

// ---------------------------------------------------------------------------
// Grandfathered allowlist (Plan B6) — DRAIN, don't grow.
// Paths are repo-relative. See the module docstring for the migration recipe.
// ---------------------------------------------------------------------------

const KNOWN_RAW_FETCH_HOOKS = new Set<string>([
  'apps/web/src/hooks/use-account-settings.ts',
  'apps/web/src/hooks/use-add-community.ts',
  'apps/web/src/hooks/use-billing-group.ts',
  'apps/web/src/hooks/use-bulk-announcements.ts',
  'apps/web/src/hooks/use-bulk-documents.ts',
  'apps/web/src/hooks/use-change-plan.ts',
  'apps/web/src/hooks/use-compliance-activity.ts',
  'apps/web/src/hooks/use-compliance-checklist.ts',
  'apps/web/src/hooks/use-content-blocks.ts',
  'apps/web/src/hooks/use-contracts.ts',
  'apps/web/src/hooks/use-custom-domain.ts',
  'apps/web/src/hooks/use-data-search.ts',
  'apps/web/src/hooks/use-demo-self-service-upgrade.ts',
  'apps/web/src/hooks/use-document-search.ts',
  'apps/web/src/hooks/use-export-data.ts',
  'apps/web/src/hooks/use-faq-manage.ts',
  'apps/web/src/hooks/use-fee-policy.ts',
  'apps/web/src/hooks/use-help.ts',
  'apps/web/src/hooks/use-hero-block.ts',
  'apps/web/src/hooks/use-import-residents.ts',
  'apps/web/src/hooks/use-invitations.ts',
  'apps/web/src/hooks/use-join-requests.ts',
  'apps/web/src/hooks/use-mobile-settings.ts',
  'apps/web/src/hooks/use-mutate-announcement.ts',
  'apps/web/src/hooks/use-onboarding-checklist.ts',
  'apps/web/src/hooks/use-payment-intent.ts',
  'apps/web/src/hooks/use-payment-portal.ts',
  'apps/web/src/hooks/use-phone-verification.ts',
  'apps/web/src/hooks/use-portfolio-templates.ts',
  'apps/web/src/hooks/use-publish-site.ts',
  'apps/web/src/hooks/use-reauth.ts',
  'apps/web/src/hooks/use-residents-management.ts',
  // useSetDesignation does a raw fetch to detect the 409 NON_OWNER_ACK_REQUIRED
  // response and surface it as a typed result rather than a thrown error.
  'apps/web/src/hooks/use-role-management.ts',
  'apps/web/src/hooks/use-stripe-connect-complete.ts',
  'apps/web/src/hooks/use-stripe-connect.ts',
  'apps/web/src/hooks/use-support-access.ts',
  'apps/web/src/hooks/use-transparency.ts',
  'apps/web/src/hooks/use-units.ts',
  'apps/web/src/hooks/use-upload-logo.ts',
  'apps/web/src/hooks/use-compliance-mutations.ts',
  'apps/web/src/hooks/use-document-draft.ts',
  'apps/web/src/hooks/use-document-upload.ts',
]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Exit codes: 0 clean · 1 violations or a dead allowlist entry · 2 could not
 * check (scan root missing, or no hook files in it). `root` and `allowlist`
 * are parameters so the fixture test can point the guard at a temporary tree.
 */
export function checkHookRequestJson(
  root: string = repoRoot,
  allowlist: ReadonlySet<string> = KNOWN_RAW_FETCH_HOOKS,
): number {
  console.log('🔍 Hook requestJson Guard (Plan B6)');
  console.log('='.repeat(60));

  // A moved hooks directory used to be skipped silently — the guard then
  // passed having scanned nothing. Refuse instead.
  const missingRoots = SCAN_ROOTS.filter((r) => !existsSync(join(root, r)));
  if (missingRoots.length > 0) {
    console.error('\n❌ Could not check — scan root(s) missing:');
    for (const r of missingRoots) console.error(`  ${r}`);
    return 2;
  }

  const files: string[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    walkDirectory(join(root, scanRoot), files);
  }

  if (files.length === 0) {
    console.error('\n❌ Could not check — the scan roots hold no .ts/.tsx hook files.');
    return 2;
  }

  const newViolations: Violation[] = [];
  const allowlistedHits = new Set<string>();
  const allowlistedHitDetails: Violation[] = [];

  for (const file of files) {
    const rel = relative(root, file);
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const violations = findViolations(content, rel);
    if (violations.length === 0) continue;

    if (allowlist.has(rel)) {
      allowlistedHits.add(rel);
      allowlistedHitDetails.push(...violations);
    } else {
      newViolations.push(...violations);
    }
  }

  // Detect dead allowlist entries — files that no longer have a violation
  // (or no longer exist). Pruning keeps the drain ledger honest.
  const deadAllowlistEntries: string[] = [];
  for (const entry of allowlist) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  console.log(`\nScanned ${files.length} hook files.`);
  console.log(
    `Allowlist: ${allowlist.size} grandfathered hooks; ` +
      `${allowlistedHitDetails.length} known direct fetches.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} hook(s) are in KNOWN_RAW_FETCH_HOOKS ` +
        `but no longer contain a direct \`fetch('/api/v1/*')\`. ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} new direct API call(s) detected in hooks outside the allowlist:`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`      ${v.excerpt}`);
    }
    console.error(
      '\nPlan B6: hooks should reach /api/v1/* through `requestJson` from ' +
        '`apps/web/src/lib/api/request-json.ts`, which unwraps the canonical ' +
        '`{ data: T }` envelope and parses `{ error: { message } }`. If the ' +
        'call is genuinely bespoke (binary/CSV download, multipart upload, ' +
        'presign + external PUT, custom error sentinel), add it to ' +
        'KNOWN_RAW_FETCH_HOOKS with a one-line reason.',
    );
  }

  const hasErrors = newViolations.length > 0 || deadAllowlistEntries.length > 0;
  if (hasErrors) {
    return 1;
  }

  console.log(
    `\n✅ No new direct API calls in hooks. ` +
      `${allowlist.size} grandfathered hooks on the regression floor.`,
  );
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(checkHookRequestJson());
}

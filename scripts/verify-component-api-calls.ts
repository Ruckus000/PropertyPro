/**
 * Component / Page API-call Guard (ADR-003)
 *
 * Enforces the layering rule from ADR-003: components and pages must not call
 * `fetch('/api/v1/*')` directly. The single sanctioned client-side entry to
 * the API is via hooks under `apps/web/src/hooks/`, which use TanStack Query
 * + the `requestJson` helper to centralize cache, retry, and error handling.
 *
 * Why: when components fetch directly they bypass:
 *   - Query-key cache invalidation (mutations elsewhere don't refresh them)
 *   - Retry / dedupe (every render that triggers a fetch hits the API)
 *   - Uniform error parsing (the `err.error` → "[object Object]" family)
 *
 * Existing violators: 62 files, grandfathered via KNOWN_DIRECT_API_CALL_FILES.
 * They are NOT rewritten as part of this guard's introduction (per ADR-003,
 * "no big-bang refactors"). Existing files remain on the allowlist; new
 * files MUST go through hooks.
 *
 * Goal: drain KNOWN_DIRECT_API_CALL_FILES over time. As features touch a
 * grandfathered file, the author should migrate it to a hook and remove the
 * file from this list.
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

export const SCAN_ROOTS: readonly string[] = [
  'apps/web/src/components',
  'apps/web/src/app/(authenticated)',
  'apps/web/src/app/(marketing)',
  'apps/web/src/app/(public)',
  'apps/web/src/app/(auth)',
  'apps/web/src/app/auth',
  'apps/web/src/app/sign',
  // Legal pages live under (marketing)/legal since 4cb4a808, already scanned
  // above. The bare `app/legal` root was dropped when missing roots became a
  // refusal rather than a silent skip.
  'apps/web/src/app/demo',
  'apps/web/src/app/mobile',
];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Match `fetch('/api/v1/...`, `fetch("/api/v1/...`, or `` fetch(`/api/v1/... ``.
 * The leading `fetch(` plus a string-literal opener means we ignore innocuous
 * content (e.g. a comment or a string mentioning `/api/v1/` for documentation).
 */
const DIRECT_API_FETCH_REGEX = /\bfetch\s*\(\s*[`'"]\/api\/v1\//;

export interface Violation {
  file: string;
  line: number;
  excerpt: string;
}

export function findViolations(content: string, filePath: string): Violation[] {
  const lines = content.split('\n');
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (DIRECT_API_FETCH_REGEX.test(line)) {
      violations.push({
        file: filePath,
        line: i + 1,
        excerpt: line.trim().slice(0, 200),
      });
    }
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
      // Skip __tests__ directories — tests are allowed to call APIs directly.
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walkDirectory(full, files);
      continue;
    }

    const ext = full.slice(full.lastIndexOf('.'));
    if (!FILE_EXTENSIONS.has(ext)) continue;
    // Skip *.test.ts(x) and *.spec.ts(x).
    if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
    if (full.endsWith('.spec.ts') || full.endsWith('.spec.tsx')) continue;
    files.push(full);
  }
}

// ---------------------------------------------------------------------------
// Grandfathered allowlist (ADR-003)
//
// These files exist on the date this guard was introduced (2026-05-06) and
// already call `fetch('/api/v1/*')` directly. Adding new entries here
// requires explicit reviewer + ADR-author sign-off; the goal is to drain
// this set, not grow it.
//
// To migrate a file off the list:
//   1. Move the fetch into a hook under apps/web/src/hooks/.
//   2. Use `requestJson` from `apps/web/src/lib/api/request-json.ts`.
//   3. Wire the component to the hook and remove from this set.
// ---------------------------------------------------------------------------

const KNOWN_DIRECT_API_CALL_FILES = new Set<string>([
]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Exit codes: 0 clean · 1 violations or a dead allowlist entry · 2 could not
 * check (a scan root is missing, or the roots hold no source files). `root`
 * and `allowlist` are parameters so the fixture test can point the guard at a
 * temporary tree.
 */
export function checkComponentApiCalls(
  root: string = repoRoot,
  allowlist: ReadonlySet<string> = KNOWN_DIRECT_API_CALL_FILES,
): number {
  console.log('🔍 Component / Page API-call Guard (ADR-003)');
  console.log('='.repeat(60));

  // A renamed or moved root used to be skipped silently, so the guard could
  // pass having scanned nothing. Refuse instead.
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
    console.error('\n❌ Could not check — the scan roots hold no .ts/.tsx files.');
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
  // (or no longer exist). Pruning these keeps the debt ledger honest.
  const deadAllowlistEntries: string[] = [];
  for (const entry of allowlist) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  console.log(`\nScanned ${files.length} files.`);
  console.log(
    `Allowlist: ${allowlist.size} grandfathered files; ` +
      `${allowlistedHitDetails.length} known direct fetches.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} file(s) are in KNOWN_DIRECT_API_CALL_FILES ` +
        `but no longer contain a direct \`fetch('/api/v1/*')\`. ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} new direct API call(s) detected outside the allowlist:`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`      ${v.excerpt}`);
    }
    console.error(
      '\nADR-003: components and pages must call /api/v1/* through hooks ' +
        '(apps/web/src/hooks/), not via direct fetch. Use `requestJson` from ' +
        '`apps/web/src/lib/api/request-json.ts`. If the call is genuinely server-only ' +
        '(server component or route handler), move it to that layer.',
    );
  }

  const hasErrors = newViolations.length > 0 || deadAllowlistEntries.length > 0;
  if (hasErrors) {
    return 1;
  }

  console.log(
    `\n✅ No new direct API calls in components/pages. ` +
      `${allowlist.size} grandfathered files remain — drain over time.`,
  );
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(checkComponentApiCalls());
}

/**
 * Legacy-role literal guard (role-simplification Phase 4.3+).
 *
 * BAN mode (Phase 4.3): the guard no longer ratchets a numeric floor. It counts
 * the genuinely-DEAD legacy admin-role string literals — `cam`, `site_manager`,
 * `property_manager_admin` — plus the v2 union-type cast, across app + package
 * source, and FAILS if any appear in a file that is NOT on the ALLOWLIST below,
 * or if an allowlisted file EXCEEDS its pinned ceiling. New code therefore cannot
 * introduce a new dead-legacy-role literal anywhere.
 *
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * PASS 2 (added 2026-09-07): the same retired vocabulary in COMMENT PROSE.
 * Pass 1 matches QUOTED literals, so a docblock saying "caller must hold
 * pm_admin" cost nothing and ~60 of them accumulated across the tree after
 * ADR-006 declared role-v3 fully landed — several asserting gates the code does
 * not perform. Pass 2 matches `pm_admin`, `property_manager_admin`,
 * `site_manager` and the dead `BILINGUAL (role-v3)` marker inside comments only.
 *
 * Deliberately NOT matched by pass 2: bare `cam`. It has ~50 legitimate hits
 * (the marketing "CAM portfolio" copy, the `who-cam` asset filename, a
 * `cam.getpropertypro.com` DNS fixture), so matching it would train people to
 * exempt rather than fix. Coverage here is partial ON PURPOSE.
 *
 * Comments are extracted with the TypeScript PARSER, not a regex over the raw
 * text: a regex cannot tell a comment from a string literal or from JSX text,
 * and `'pm_admin'` legitimately appears in both (dev-login aliases, help
 * frontmatter vocabulary). Escape hatch: `legacy-roles:exempt — <reason>` in the
 * offending comment, or on either of the two lines above it.
 *
 * NOT counted (deliberately):
 * - 'owner'/'tenant' — too many legitimate uses (ownerUserId, tenant isolation).
 * - 'board_president'/'board_member' — these are first-class v3 `designation`
 *   enum values now (valid on any role), not legacy admin-role names to drain.
 *   `role` is a typed enum (CommunityRole), so misusing a designation value as a
 *   role is a tsc error, not something this string guard needs to catch.
 *
 * The ALLOWLIST is a CEILING per file: exceeding it fails (no growth); dropping
 * below it only warns (tighten opportunistically on the next drain). The long-term
 * structural sites (rbac-matrix / access-policies / DB enum) are removed when the
 * RBAC_MATRIX/CommunityRole 7→3 collapse lands (a later phase). The bridge-display
 * sites (nav-config / feature-registry / role-guard aliases / esign / compliance /
 * invitations) were drained in Phase 4.4 alongside the
 * inferCanonicalRoleFromMembership removal — the BRIDGE bucket is now empty.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFile, parseDetectorWorks } from './lib/legacy-role-comments';

const ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/shared/src', 'packages/db/src', 'packages/ui/src', 'packages/email/src'];
const LITERAL = /'(cam|site_manager|property_manager_admin)'/g;
const V2_CAST = /'resident'\s*\|\s*'manager'\s*\|\s*'pm_admin'/g;
const EXEMPT = new Set([
  // The v3 source-of-truth module — holds the guard-exempt HELP_FRONTMATTER_ROLES
  // content vocabulary (help-article frontmatter, not runtime roles).
  'packages/shared/src/role-transition.ts',
]);

// Per-file CEILING of legitimate dead-legacy-role literals (pinned 2026-06-22, Phase 4.3).
// Any file NOT listed here must have ZERO such literals. Buckets:
//   STRUCTURAL  — the RBAC permission authority + DB enum; FULLY DRAINED (empty).
//   BRIDGE      — canonical-role-bridge display/config; FULLY DRAINED (empty).
//   HELP        — #733 help-frontmatter v1 visibility vocabulary (content, not runtime roles).
//   DEV         — dev-only portal login aliases (404 in prod).
//   TEST        — co-located *.test fixtures under src asserting the v3↔legacy mapping.
const ALLOWLIST = new Map<string, number>([
  // STRUCTURAL — bucket intentionally EMPTY. The RBAC_MATRIX 7→3 collapse (R3-01)
  // drained the 4 unreachable columns; Level 2 renamed the management row key to
  // `manager` (rbac-matrix.ts + access-control.ts); R3-06 dropped the dead
  // `user_role` pgEnum (enums.ts); Level 3 narrowed `CommunityRole` 7→3 and removed
  // `resolveLegacyRole`'s last `property_manager_admin` input branch
  // (access-policies.ts). The runtime role vocabulary is now v3-only.
  // BRIDGE — drained to zero in Phase 4.4. Bucket intentionally empty.
  // HELP
  ['packages/shared/src/default-faqs.ts', 3],
  ['apps/web/src/lib/help/aliases.ts', 1],
  // DEV
  ['apps/web/src/app/dev/agent-login/route.ts', 2],
  ['apps/web/src/app/dev/login/route.ts', 2],
  // TEST
  ['apps/web/src/hooks/__tests__/use-residents.test.tsx', 3],
  ['apps/web/src/lib/help/__tests__/viewer-role.test.ts', 3],
  ['apps/web/src/lib/services/__tests__/help-article-service.test.ts', 1],
  ['apps/web/src/lib/work-orders/__tests__/common.test.ts', 1],
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

// Assert every search root exists BEFORE either pass walks it. Without this,
// pass 1's readdirSync throws an uncaught ENOENT and the process exits 1
// ("violations found") for what is really "I could not check" — found by the
// tri-state probe in scripts/__tests__/verify-legacy-roles.test.ts's sibling
// runbook, not by reasoning.
for (const root of ROOTS) {
  if (!existsSync(root)) {
    console.error(`guard:legacy-roles COULD NOT CHECK — search root missing: ${root}`);
    process.exit(2);
  }
}

let total = 0;
const perFile = new Map<string, number>();
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXEMPT.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    const n = (src.match(LITERAL)?.length ?? 0) + (src.match(V2_CAST)?.length ?? 0);
    if (n > 0) {
      total += n;
      perFile.set(file, n);
    }
  }
}

if (process.argv.includes('--report')) {
  [...perFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([f, n]) => console.log(`${String(n).padStart(4)}  ${f}  ${ALLOWLIST.has(f) ? `(allowlisted ≤${ALLOWLIST.get(f)})` : 'NOT ALLOWLISTED'}`));
  console.log(`\nTOTAL: ${total}`);
  process.exit(0);
}

const violations: string[] = [];
for (const [file, n] of perFile) {
  const ceiling = ALLOWLIST.get(file);
  if (ceiling === undefined) {
    violations.push(`  ${file}: ${n} dead legacy-role literal(s) — NOT allowlisted. Use the v3 roles / designation / transition constants (packages/shared/src/role-transition.ts).`);
  } else if (n > ceiling) {
    violations.push(`  ${file}: ${n} legacy literal(s) exceeds the allowlisted ceiling of ${ceiling}. Drain the new one or it cannot land.`);
  }
}



// ---------------------------------------------------------------------------
// PASS 2 — retired vocabulary in COMMENT PROSE
// ---------------------------------------------------------------------------

if (!parseDetectorWorks()) {
  console.error(
    'guard:legacy-roles COULD NOT CHECK — the parse-failure detector did not fire on ' +
      'deliberately broken syntax. `parseDiagnostics` is a TS internal and this version may ' +
      'have stopped populating it, which would make every file look parseable.',
  );
  process.exit(2);
}

const commentViolations: string[] = [];
const unparseableFiles: string[] = [];
let commentsScanned = 0;
let filesScanned = 0;
let unparseable = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXEMPT.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    const scan = scanFile(file, source);
    if (scan === null) {
      unparseable += 1;
      unparseableFiles.push(`  ${file}`);
      continue;
    }
    filesScanned += 1;
    commentsScanned += scan.commentCount;
    for (const v of scan.violations) {
      commentViolations.push(
        `  ${file}:${v.line}: comment names retired role vocabulary (${v.terms.join(', ')}). ` +
          'Describe the gate the code actually runs (property_manager / root_manager), ' +
          'or add `legacy-roles:exempt — <reason>` if the name is deliberate.',
      );
    }
  }
}

if (unparseableFiles.length > 0) {
  console.error(
    `guard:legacy-roles COULD NOT CHECK — ${unparseableFiles.length} file(s) did not parse, ` +
      'so their comments were never examined:',
  );
  console.error(unparseableFiles.join('\n'));
  process.exit(2);
}

if (filesScanned === 0 || commentsScanned === 0) {
  console.error(
    `guard:legacy-roles COULD NOT CHECK — scanned ${filesScanned} file(s) and ` +
      `${commentsScanned} comment(s). A scan that examined nothing must not pass.`,
  );
  process.exit(2);
}

if (violations.length > 0 || commentViolations.length > 0) {
  if (violations.length > 0) {
    console.error('guard:legacy-roles BAN — new/over-ceiling dead legacy-role literals found:');
    console.error(violations.join('\n'));
  }
  if (commentViolations.length > 0) {
    console.error('guard:legacy-roles BAN — retired role vocabulary in comment prose:');
    console.error(commentViolations.join('\n'));
  }
  process.exit(1);
}

// Non-failing hint: files now below their pinned ceiling (a drain happened elsewhere) —
// tighten the ALLOWLIST opportunistically.
const slack = [...ALLOWLIST.entries()].filter(([f, max]) => (perFile.get(f) ?? 0) < max);
if (slack.length > 0) {
  console.log('guard:legacy-roles — ceilings with slack (lower them when convenient):');
  slack.forEach(([f, max]) => console.log(`  ${f}: now ${perFile.get(f) ?? 0}, ceiling ${max}`));
}
console.log(
  `guard:legacy-roles OK — ${total} legacy literals within the ${ALLOWLIST.size}-file allowlist; ` +
    `${commentsScanned} comments scanned across ${filesScanned} files, ${unparseable} unparseable.`,
);

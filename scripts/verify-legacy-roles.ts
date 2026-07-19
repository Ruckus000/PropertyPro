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
 * NOT counted (deliberately):
 * - 'owner'/'tenant' — too many legitimate uses (ownerUserId, tenant isolation).
 * - 'board_president'/'board_member' — these are first-class v3 `designation`
 *   enum values now (valid on any role), not legacy admin-role names to drain.
 *   `role` is a typed enum (TransitionRole), so misusing a designation value as a
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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
//   STRUCTURAL  — the RBAC permission authority + DB enum; removed at the 7→3 collapse.
//   BRIDGE      — canonical-role-bridge display/config; drains in Phase 4.4 with the shim.
//   HELP        — #733 help-frontmatter v1 visibility vocabulary (content, not runtime roles).
//   DEV         — dev-only portal login aliases (404 in prod).
//   TEST        — co-located *.test fixtures under src asserting the v3↔legacy mapping.
const ALLOWLIST = new Map<string, number>([
  // STRUCTURAL. The RBAC_MATRIX 7→3 collapse (R3-01) drained the 4 unreachable
  // columns; Level 2 then renamed the surviving `property_manager_admin` row key
  // to the v3-neutral `manager`, draining rbac-matrix.ts and access-control.ts to
  // ZERO (both removed from this list). access-policies.ts keeps ONE literal: the
  // legacy `property_manager_admin` INPUT branch in `resolveLegacyRole` — a valid
  // CommunityRole that must resolve to the manager row until CommunityRole itself
  // narrows 7→3 (Level 3). enums.ts holds the dead `user_role` pgEnum (R3-06).
  ['packages/shared/src/access-policies.ts', 1],
  ['packages/db/src/schema/enums.ts', 3],
  // BRIDGE — drained to zero in Phase 4.4 (this PR). Bucket intentionally empty.
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

if (violations.length > 0) {
  console.error('guard:legacy-roles BAN — new/over-ceiling dead legacy-role literals found:');
  console.error(violations.join('\n'));
  process.exit(1);
}

// Non-failing hint: files now below their pinned ceiling (a drain happened elsewhere) —
// tighten the ALLOWLIST opportunistically.
const slack = [...ALLOWLIST.entries()].filter(([f, max]) => (perFile.get(f) ?? 0) < max);
if (slack.length > 0) {
  console.log('guard:legacy-roles — ceilings with slack (lower them when convenient):');
  slack.forEach(([f, max]) => console.log(`  ${f}: now ${perFile.get(f) ?? 0}, ceiling ${max}`));
}
console.log(`guard:legacy-roles OK (ban mode) — ${total} legacy literals, all within the ${ALLOWLIST.size}-file allowlist.`);

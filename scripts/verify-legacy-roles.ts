/**
 * Legacy-role literal guard (role-simplification Phase 1+).
 *
 * Counts occurrences of (a) the five legacy admin-role string literals and
 * (b) the v2 union-type cast pattern, across app + package source. This is a
 * REGRESSION FLOOR during the Phase 3 drain (ratchet FLOOR down with every
 * drain PR), and flips to forbid (FLOOR = allowlist-only) at Phase 4.
 *
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 * NOTE: 'owner'/'tenant' literals are NOT counted (too many legitimate uses:
 * ownerUserId, tenant isolation, etc.). presetKey VALUES share these strings
 * and legitimately persist until Phase 4 drops the column — that's why this
 * is a floor, not a ban.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FLOOR = 250; // captured 2026-06-10 from --report; ratchet DOWN with every Phase 3 drain PR
const ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/shared/src', 'packages/db/src', 'packages/ui/src', 'packages/email/src'];
const LITERAL = /'(board_member|board_president|cam|site_manager|property_manager_admin)'/g;
const V2_CAST = /'resident'\s*\|\s*'manager'\s*\|\s*'pm_admin'/g;
const EXEMPT = new Set([
  'packages/shared/src/role-transition.ts',
  'packages/shared/src/billing/permissions.ts', // the shim — deleted at Phase 4
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
const perFile: Array<[string, number]> = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXEMPT.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    const n = (src.match(LITERAL)?.length ?? 0) + (src.match(V2_CAST)?.length ?? 0);
    if (n > 0) {
      total += n;
      perFile.push([file, n]);
    }
  }
}

if (process.argv.includes('--report')) {
  perFile.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`${String(n).padStart(4)}  ${f}`));
  console.log(`\nTOTAL: ${total}`);
  process.exit(0);
}

if (Number.isNaN(FLOOR)) {
  console.error('guard:legacy-roles — FLOOR not set. Run with --report and pin the count.');
  process.exit(1);
}
if (total > FLOOR) {
  console.error(`guard:legacy-roles — ${total} legacy role literals found, floor is ${FLOOR}.`);
  console.error('New code must use the v3 roles / transition constants (packages/shared/src/role-transition.ts).');
  console.error('If you DRAINED literals, lower FLOOR in scripts/verify-legacy-roles.ts to the new count.');
  process.exit(1);
}
console.log(`guard:legacy-roles OK — ${total} legacy literals (floor ${FLOOR}).`);

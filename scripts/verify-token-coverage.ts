/**
 * Token consumption-coverage guard.
 *
 * Collects every CSS custom property REFERENCED (`var(--x)`) in app source and
 * Tailwind configs, and every property DEFINED (`--x:`) in any repo CSS file or
 * TS/TSX inline style, then fails if a referenced property has no definition.
 * Catches "the generator dropped a variable some page relies on".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REFERENCE_ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/ui/src'];
const REFERENCE_EXTRA = ['apps/web/tailwind.config.ts', 'apps/admin/tailwind.config.ts'];
const DEFINITION_ROOTS = ['apps', 'packages'];

// Properties defined at runtime or by third parties — never flag.
// NOTE: deliberately no generic `--color-` prefix here — that would also
// swallow genuine bugs like the unrelated `--color-text` reference in the
// onboarding pages. Each chart series var is allowlisted individually below.
const DYNAMIC_PREFIXES = ['--tw-', '--theme-', '--radix-', '--rt-'];
// Individual known-dynamic vars (populate from --report output during rollout).
const DYNAMIC_ALLOWLIST = new Set<string>([
  // next/font/google `Fraunces({ variable: '--font-fraunces' })` injects this
  // as a class-scoped custom property at build time; see
  // apps/web/src/app/(marketing)/layout.tsx. Consumed by
  // apps/web/src/app/(marketing)/marketing-theme.css.
  '--font-fraunces',

  // shadcn/ui `ChartStyle` (apps/web/src/components/ui/chart.tsx, emits
  // `  --color-${key}: ${color};` per series key from a chart's
  // `ChartConfig`) injects these into a `<style>` tag at render time — there
  // is no static definition to find. One entry per literal series-key var
  // referenced via `var(--color-<key>)` in apps/web/src/components/pm/reports/.
  '--color-satisfied', // ComplianceReport.tsx
  '--color-overdue', // ComplianceReport.tsx
  '--color-missing', // ComplianceReport.tsx
  '--color-days0to30', // DelinquencyReport.tsx
  '--color-days31to60', // DelinquencyReport.tsx
  '--color-days61to90', // DelinquencyReport.tsx
  '--color-days90plus', // DelinquencyReport.tsx
  '--color-resolved', // MaintenanceReport.tsx, ViolationReport.tsx
  '--color-inProgress', // MaintenanceReport.tsx
  '--color-open', // MaintenanceReport.tsx, ViolationReport.tsx
  '--color-fined', // ViolationReport.tsx
  // OccupancyReport.tsx builds `` `var(--color-${name.replace(/\s/g, '-')})` ``
  // — the regex only captures the static `--color-` prefix from the template
  // literal, not the interpolated key.
  '--color-',
]);

function* walk(dir: string, exts: RegExp): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.') || entry === 'dist') continue;
    if (statSync(full).isDirectory()) yield* walk(full, exts);
    else if (exts.test(entry)) yield full;
  }
}

const REF_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;
const DEF_RE = /(--[a-zA-Z0-9-]+)\s*:/g;

const referenced = new Map<string, string[]>(); // var -> example files
for (const root of REFERENCE_ROOTS) {
  for (const file of walk(root, /\.(ts|tsx|css)$/)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(REF_RE)) {
      const v = m[1]!;
      if (!referenced.has(v)) referenced.set(v, []);
      const files = referenced.get(v)!;
      if (files.length < 3) files.push(file);
    }
  }
}
for (const file of REFERENCE_EXTRA) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(REF_RE)) {
    const v = m[1]!;
    if (!referenced.has(v)) referenced.set(v, []);
    referenced.get(v)!.push(file);
  }
}

const defined = new Set<string>();
for (const root of DEFINITION_ROOTS) {
  for (const file of walk(root, /\.(css|ts|tsx)$/)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(DEF_RE)) defined.add(m[1]!);
  }
}

const missing = [...referenced.entries()].filter(
  ([v]) =>
    !defined.has(v) &&
    !DYNAMIC_ALLOWLIST.has(v) &&
    !DYNAMIC_PREFIXES.some((p) => v.startsWith(p)),
);

if (process.argv.includes('--report')) {
  missing.forEach(([v, files]) => console.log(`${v}\n    ${files.join('\n    ')}`));
  console.log(`\n${missing.length} referenced-but-undefined properties`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error('guard:token-coverage — CSS custom properties referenced but defined nowhere:');
  missing.forEach(([v, files]) => console.error(`  ${v}  (e.g. ${files[0]})`));
  console.error('Define the token in packages/tokens, or add to DYNAMIC_ALLOWLIST with a comment.');
  process.exit(1);
}
console.log(`guard:token-coverage OK — ${referenced.size} referenced properties all defined.`);

/**
 * guard:design-tokens — bans raw colors / arbitrary values in app code.
 *
 * Rules (per line, in .ts/.tsx/.css under apps/{web,admin}/src):
 *   raw-hex          #RRGGBB / #RGB[A] color literals
 *   raw-palette      Tailwind palette classes (bg-blue-500, text-gray-600, …)
 *   arbitrary-color  bg-[#…] / text-[#…] / border-[…rgb…] etc.
 *   arbitrary-font   text-[NNpx]
 *   arbitrary-space  p-[NNpx] / m-[NNpx] / gap-[NNpx] etc.
 *
 * Baseline: scripts/design-token-baseline.json — { file: { rule: count } }.
 * A file may not exceed its baselined count per rule; unbaselined files must be
 * clean. Renamed/moved files must arrive clean OR update the baseline in the
 * same PR (the diff makes this reviewable). Baseline only shrinks over time.
 *
 * Escape hatch: a line containing `design-tokens:exempt` is skipped (append a reason).
 * `--selftest` checks the rules against embedded fixtures (also runs first always).
 * `--report` prints violations; `--write-baseline` rewrites the baseline
 * (initial adoption / reviewed shrinks only).
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['apps/web/src', 'apps/admin/src'];
const BASELINE_PATH = 'scripts/design-token-baseline.json';

const PALETTE_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const CLASS_PREFIXES =
  'bg|text|border|ring|fill|stroke|divide|outline|decoration|accent|caret|shadow|from|via|to';

const RULES: Record<string, RegExp> = {
  // Negative lookbehind excludes URL-fragment / anchor hrefs (href="#abc") that
  // happen to be composed of hex-looking characters — not color literals.
  'raw-hex': /(?<!href=["'`])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  'raw-palette': new RegExp(
    `\\b(?:${CLASS_PREFIXES})-(?:${PALETTE_NAMES})-(?:25|50|100|200|300|400|500|600|700|800|900|950)\\b`,
    'g',
  ),
  'arbitrary-color': new RegExp(`\\b(?:${CLASS_PREFIXES})-\\[(?:#|rgb|hsl|oklch)`, 'g'),
  'arbitrary-font': /\btext-\[\d+(?:\.\d+)?px\]/g,
  'arbitrary-space': /\b(?:p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\[\d+(?:\.\d+)?px\]/g,
};

type Counts = Record<string, number>;

// Comment-leading lines (JSDoc `*`, `//`, `/*`) are skipped entirely: PR/issue
// references and drain-batch notes (`#172`, `(#107 / #146 precedent)`) are
// digit-only strings 3+ chars long that pass as valid hex under the raw-hex
// rule, and this codebase's comment style puts nearly all of them on
// comment-only lines. Real color literals live in code (quoted strings, CSS
// declarations), never on a comment-only line.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

function scanContent(src: string): Counts {
  const counts: Counts = {};
  for (const line of src.split('\n')) {
    if (line.includes('design-tokens:exempt')) continue;
    if (COMMENT_LINE.test(line)) continue;
    for (const [rule, re] of Object.entries(RULES)) {
      const n = (line.match(re) ?? []).length;
      if (n > 0) counts[rule] = (counts[rule] ?? 0) + n;
    }
  }
  return counts;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry)) yield full;
  }
}

// ── Selftest ──
function selftest(): void {
  const cases: Array<[string, string, number]> = [
    ['raw-hex', `const c = '#2563eb';`, 1],
    ['raw-hex', `border: 1px solid #d1d5db; color: #fff`, 2],
    ['raw-palette', `<div className="bg-blue-500 text-gray-600 dark:bg-red-50">`, 3],
    ['raw-palette', `<div className="bg-surface-card text-content">`, 0],
    ['arbitrary-color', `className="bg-[#0f0f0f] text-[rgb(0,0,0)]"`, 2],
    ['arbitrary-font', `className="text-[13px] text-sm"`, 1],
    ['arbitrary-space', `className="p-[13px] mt-[7px] gap-4"`, 2],
    ['raw-hex', `const c = '#2563eb'; // design-tokens:exempt — email template`, 0],
    ['raw-hex', `href="#abc"`, 0],
    ['raw-hex', `<a href="#section">Jump</a>`, 0],
    ['raw-hex', ` * Plan A1 drain #172. See (#107 / #146 precedent).`, 0],
    ['raw-hex', `// fixed in #123, follow-up #4567`, 0],
    ['raw-hex', `/* legacy note #a1b2c3 */`, 0],
  ];
  for (const [rule, input, expected] of cases) {
    const got = scanContent(input)[rule] ?? 0;
    if (got !== expected) {
      console.error(`SELFTEST FAIL [${rule}] expected ${expected}, got ${got} for: ${input}`);
      process.exit(1);
    }
  }
}
selftest();
if (process.argv.includes('--selftest')) {
  console.log('guard:design-tokens selftest OK');
  process.exit(0);
}

// ── Scan ──
const current = new Map<string, Counts>();
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const counts = scanContent(readFileSync(file, 'utf8'));
    if (Object.keys(counts).length > 0) current.set(file, counts);
  }
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries([...current.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Baseline written: ${BASELINE_PATH} (${current.size} files)`);
  process.exit(0);
}

const baseline: Record<string, Counts> = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : {};

if (process.argv.includes('--report')) {
  let total = 0;
  for (const [file, counts] of [...current.entries()].sort()) {
    const summary = Object.entries(counts).map(([r, n]) => `${r}:${n}`).join(' ');
    const base = baseline[file] ? '' : '  NOT BASELINED';
    console.log(`${file}  ${summary}${base}`);
    total += Object.values(counts).reduce((a, b) => a + b, 0);
  }
  console.log(`\nTOTAL: ${total} violations in ${current.size} files`);
  process.exit(0);
}

const violations: string[] = [];
for (const [file, counts] of current) {
  const base = baseline[file] ?? {};
  for (const [rule, n] of Object.entries(counts)) {
    const ceiling = base[rule] ?? 0;
    if (n > ceiling) {
      violations.push(
        `  ${file} [${rule}]: ${n} > baseline ${ceiling}. Use semantic tokens ` +
          `(see .claude/rules/design.md), or append "// design-tokens:exempt — <reason>".`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('guard:design-tokens — raw colors / arbitrary values exceed the baseline:');
  console.error(violations.join('\n'));
  process.exit(1);
}

// Slack hint — files now below baseline (a drain happened): tighten when convenient.
const slack: string[] = [];
for (const [file, base] of Object.entries(baseline)) {
  const cur = current.get(file) ?? {};
  for (const [rule, ceiling] of Object.entries(base)) {
    if ((cur[rule] ?? 0) < ceiling) slack.push(`  ${file} [${rule}]: now ${cur[rule] ?? 0}, baseline ${ceiling}`);
  }
}
if (slack.length > 0) {
  console.log('guard:design-tokens — baseline slack (run --write-baseline in a reviewed PR to tighten):');
  slack.slice(0, 20).forEach((s) => console.log(s));
  if (slack.length > 20) console.log(`  … and ${slack.length - 20} more`);
}
console.log(`guard:design-tokens OK — ${current.size} files within baseline.`);

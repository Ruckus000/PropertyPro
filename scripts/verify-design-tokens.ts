/**
 * guard:design-tokens — bans raw colors / arbitrary values in app code.
 *
 * Rules (per line, in .ts/.tsx/.css under apps/{web,admin}/src):
 *   raw-hex          #RRGGBB / #RGB[A] color literals
 *   raw-palette      Tailwind palette classes (bg-blue-500, placeholder-gray-400, …)
 *   arbitrary-color  bg-[#…] / text-[…rgb…] / shadow-[0_4px_6px_rgba(…)] etc.
 *   arbitrary-font   text-[NNpx]
 *   arbitrary-space  p-[NNpx] / m-[NNpx] / gap-[NNpx] etc.
 *   raw-color-fn     rgb()/rgba()/hsl()/hsla()/oklch() functional color literals
 *   slash-opacity-semantic  bg-interactive/10, hover:bg-status-danger/90, …
 *                    (slash-opacity on the app's SEMANTIC tokens compiles to
 *                    ZERO CSS — the tokens are plain `var(--x)` with no
 *                    `<alpha-value>` channel, so Tailwind emits nothing.
 *                    Built-in palette alpha like `bg-white/20` is fine.)
 *
 * Rules deliberately overlap on some lines (a `from-[#3B82F6]` literal counts
 * under raw-hex AND arbitrary-color; a bracketed rgba() counts under
 * arbitrary-color AND raw-color-fn) — each rule stays simple and the baseline
 * absorbs the double-count.
 *
 * Baseline: scripts/design-token-baseline.json — { file: { rule: count } }.
 * A file may not exceed its baselined count per rule; unbaselined files must be
 * clean. Renamed/moved files must arrive clean OR update the baseline in the
 * same PR (the diff makes this reviewable). Baseline only shrinks over time.
 * Caveat: the ceiling is a per-file/per-rule COUNT, not a pinned set of lines —
 * a baselined file whose current count sits below its ceiling can absorb a new
 * violation without failing. Ratchet ceilings down (--write-baseline in a
 * reviewed PR) whenever a drain lands to keep that window small.
 *
 * Escape hatch: a line containing `design-tokens:exempt` is skipped (append a reason).
 * Comment-leading lines (`//`, `/*`, JSDoc `*`) are exempt from raw-hex ONLY
 * (PR-number refs like `#172` false-positive as hex); all other rules still scan them.
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
// Longer alternatives sharing a stem come BEFORE the shorter stem
// (ring-offset before ring, border-t/… before border, divide-x/y before
// divide) so the full prefix is consumed and the palette name follows.
const CLASS_PREFIXES =
  'bg|text|placeholder|border-t|border-r|border-b|border-l|border-x|border-y|border-s|border-e|border|ring-offset|ring|fill|stroke|divide-x|divide-y|divide|outline|decoration|accent|caret|shadow|from|via|to';

const RULES: Record<string, RegExp> = {
  // Negative lookbehind excludes URL-fragment / anchor hrefs (href="#abc") that
  // happen to be composed of hex-looking characters — not color literals.
  'raw-hex': /(?<!href=["'`])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  'raw-palette': new RegExp(
    `\\b(?:${CLASS_PREFIXES})-(?:${PALETTE_NAMES})-(?:25|50|100|200|300|400|500|600|700|800|900|950)\\b`,
    'g',
  ),
  // Color function may appear anywhere inside the brackets
  // (shadow-[0_4px_6px_rgba(0,0,0,.1)]), not only at the start.
  // Overlaps intentionally with raw-hex (bg-[#…]) and raw-color-fn (bracketed rgba).
  'arbitrary-color': new RegExp(`\\b(?:${CLASS_PREFIXES})-\\[[^\\]]*(?:#|rgb|hsl|oklch)`, 'g'),
  'arbitrary-font': /\btext-\[\d+(?:\.\d+)?px\]/g,
  'arbitrary-space': /\b(?:p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\[\d+(?:\.\d+)?px\]/g,
  // Functional color literals in plain CSS/TS. Intentionally also fires on
  // bracketed Tailwind values already counted by arbitrary-color (see header).
  'raw-color-fn': /\b(?:rgba?|hsla?|oklch)\(/g,
  // Slash-opacity on the app's semantic tokens (content/surface/edge/
  // interactive/status) is a no-op: those tokens are defined as bare
  // `var(--x)` with no `<alpha-value>` channel, so Tailwind 3.4 generates
  // NOTHING. Use a solid token (…-subtle / …-bg / …-hover) or built-in
  // `white`/`black` alpha for genuine translucency instead.
  'slash-opacity-semantic':
    /\b(?:bg|text|border|ring|from|via|to|divide|outline|placeholder|fill|stroke|ring-offset|decoration|accent|caret)-(?:content|surface|edge|interactive|status)[a-z-]*\/\d+/g,
};

type Counts = Record<string, number>;

// Comment-leading lines (JSDoc `*`, `//`, `/*`, JSX `{/*`) are exempt from
// raw-hex ONLY: PR/issue references and drain-batch notes (`#172`,
// `(#107 / #146 precedent)`) are digit-only strings 3+ chars long that pass
// as valid hex, and this codebase's comment style puts nearly all of them on
// comment-only lines. All other rules still scan comment-marker lines — a
// class string on a line that merely starts with `/** @deprecated */` is real
// code and must count.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*)/;

function scanContent(src: string): Counts {
  const counts: Counts = {};
  for (const line of src.split('\n')) {
    if (line.includes('design-tokens:exempt')) continue;
    for (const [rule, re] of Object.entries(RULES)) {
      if (rule === 'raw-hex' && COMMENT_LINE.test(line)) continue;
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
    // The raw-hex comment-line skip must NOT blind the other rules.
    ['raw-palette', `/** @deprecated */ const legacyClass = "bg-blue-500";`, 1],
    ['arbitrary-font', `/** @deprecated */ const legacySize = "text-[13px]";`, 1],
    // JSX comment lines ({/* … */}) are also covered by the raw-hex skip.
    ['raw-hex', `{/* see #123 */}`, 0],
    // Coverage-gap fixtures (quality review 2026-07-13).
    ['raw-hex', `const white = '#FFFFFF';`, 1],
    ['raw-palette', `className="placeholder-gray-400"`, 1],
    ['raw-palette', `className="focus-visible:ring-offset-red-900"`, 1],
    ['raw-palette', `className="border-t-red-500"`, 1],
    ['arbitrary-color', `className="shadow-[0_4px_6px_rgba(0,0,0,.1)]"`, 1],
    ['raw-color-fn', `background: rgba(0,0,0,.5)`, 1],
    // slash-opacity on semantic tokens is a no-op (compiles to zero CSS);
    // built-in palette alpha (white/black) is fine and must NOT be flagged.
    ['slash-opacity-semantic', 'className="bg-interactive/10 hover:bg-status-danger/90"', 2],
    ['slash-opacity-semantic', 'className="bg-interactive-subtle text-content"', 0],
    ['slash-opacity-semantic', 'className="bg-white/20 bg-black/50"', 0],
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

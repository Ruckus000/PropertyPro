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

// `only` restricts a root to a subset of the rules. The design system DEFINES
// the tokens, so it legitimately holds hex literals and raw ramps
// (`styles/tokens.css` alone has 116 raw-hex, `tokens/shadows.ts` 10 rgba) —
// baselining those would record the token source as if it were in violation.
// It is still the highest-value place to forbid a keyboard-blind focus ring,
// since its components ship to both apps.
const ROOTS: Array<{ dir: string; only?: readonly string[] }> = [
  { dir: 'apps/web/src' },
  { dir: 'apps/admin/src' },
  { dir: 'packages/ui/src', only: ['bare-focus-ring'] },
];
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
  // Slash-opacity on the app's var-backed color families is a no-op: they are
  // defined as bare `var(--x)` with no `<alpha-value>` channel, so Tailwind 3.4
  // generates NOTHING and the color silently renders as absent. Use a solid
  // token (…-subtle / …-bg / …-hover) or built-in `white`/`black` alpha for
  // genuine translucency instead.
  //
  // The family list must match EVERY bare-var group in apps/web/tailwind.config.ts.
  // It originally covered only content/surface/edge/interactive/status, which
  // left the legacy primitives (primary/secondary/accent) and nav uncovered —
  // and `bg-accent/10` shipped invisible in two PM-facing banners for months
  // because of it. `blue`/`gray` are deliberately absent: they are hex ramps, so
  // alpha genuinely compiles there, and using them at all is already caught by
  // the raw-palette rule. apps/admin's ramps (coral/blue/gray) are all hex too.
  'slash-opacity-semantic':
    /\b(?:bg|text|border|ring|from|via|to|divide|outline|placeholder|fill|stroke|ring-offset|decoration|accent|caret)-(?:content|surface|edge|interactive|status|primary|secondary|accent|nav)[a-z-]*\/\d+|\b(?:ring-offset|ring)-(?:focus|error)[a-z-]*\/\d+/g,
  // A bare `focus:` ring paints on MOUSE and PROGRAMMATIC focus, not just
  // keyboard focus — `:focus` matches whenever the element holds focus, however
  // it got there. It shipped that way on the Dialog/Sheet close buttons and the
  // Select trigger: Radix autofocuses the first focusable element when a dialog
  // opens, so a purely mouse-driven open painted a coral ring. Use the
  // `focus-visible:` variant, which the browser gates on keyboard intent.
  //
  // `shadow` is listed alongside `ring` because a box-shadow is the other way to
  // draw a ring. The trailing `(?:-|(?![\w-]))` matters: Tailwind's BARE `ring`
  // and `shadow` utilities carry no hyphen (`focus:ring` is a real 3px ring), so
  // requiring one let the most natural shorthand reintroduction through. The
  // lookbehind requires a real variant boundary so `group-focus:` (a distinct,
  // legitimate variant) is not swept up, and `focus-visible:` never matches since
  // it contains no `focus:` substring.
  //
  // `focus:outline-*` is counted by scanContent only when a bare focus ring sits
  // on the SAME line — a lone `focus:outline-none` is the idiomatic way to quiet
  // a focus CONTAINER that deliberately shows no ring (Radix `Dialog.Content`),
  // and the global `:focus:not(:focus-visible){outline:none}` in tokens.css
  // already covers the mouse case there.
  'bare-focus-ring': /(?<![\w-])focus:(?:ring|shadow)(?:-|(?![\w-]))/g,
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

// Counted only on lines that already carry a bare focus ring — see 'bare-focus-ring'.
const BARE_FOCUS_OUTLINE = /(?<![\w-])focus:outline(?:-|(?![\w-]))/g;

function scanContent(src: string, only?: readonly string[]): Counts {
  const counts: Counts = {};
  for (const line of src.split('\n')) {
    if (line.includes('design-tokens:exempt')) continue;
    for (const [rule, re] of Object.entries(RULES)) {
      if (only && !only.includes(rule)) continue;
      if (rule === 'raw-hex' && COMMENT_LINE.test(line)) continue;
      const n = (line.match(re) ?? []).length;
      if (n > 0) counts[rule] = (counts[rule] ?? 0) + n;
      // Outline suppression only counts as part of the keyboard-blind pattern
      // when it accompanies a bare focus ring on the same line (see the rule's
      // docblock); on its own it is a legitimate focus-container idiom.
      if (rule === 'bare-focus-ring' && n > 0) {
        // `?? 0` is unreachable in practice — this branch requires n > 0, so the
        // line above already seeded counts[rule] — but it keeps the read total
        // under noUncheckedIndexedAccess without an assertion.
        counts[rule] = (counts[rule] ?? 0) + (line.match(BARE_FOCUS_OUTLINE) ?? []).length;
      }
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
    // The families the rule originally missed. `bg-accent/10` +
    // `border-accent/40` is the exact pair that rendered SiteSetupBanner and
    // WizardEntryBanner with no chrome at all.
    ['slash-opacity-semantic', 'className="border border-accent/40 bg-accent/10"', 2],
    ['slash-opacity-semantic', 'className="bg-primary/20 text-secondary/70"', 2],
    ['slash-opacity-semantic', 'className="bg-nav-bg-active/50"', 1],
    // Hex ramps: alpha genuinely compiles, so this rule must stay quiet
    // (using them at all is raw-palette's job, not this one's).
    ['slash-opacity-semantic', 'className="bg-blue-500/20 text-gray-700/50"', 0],
    // `ringColor` has its own bare-var groups (focus, error) that live outside
    // the `colors` families above. `ring-focus/20` shipped on four auth submit
    // buttons and emitted ZERO css, so the ring fell back to Tailwind's default
    // color instead of the coral token.
    ['slash-opacity-semantic', 'className="focus-visible:ring-focus/20 ring-error/50"', 2],
    ['slash-opacity-semantic', 'className="focus-visible:ring-focus ring-error"', 0],
    // `focus`/`error` exist ONLY under ringColor, so they must be scoped to the
    // ring prefixes — `text-error/50` is not a class Tailwind ever generates.
    ['slash-opacity-semantic', 'className="text-error/50 bg-focus/20"', 0],
    ['slash-opacity-semantic', 'className="ring-offset-focus/20"', 1],
    // A bare `focus:` ring is keyboard-blind; `focus-visible:` is the correct
    // variant. Variant-prefixed forms (md:, dark:, hover:) must still be caught —
    // anchoring on whitespace alone is what let `md:focus:ring-2` through.
    ['bare-focus-ring', 'className="focus:outline-none focus:ring-2 focus:ring-focus"', 3],
    ['bare-focus-ring', 'className="md:focus:ring-2 dark:focus:ring-2"', 2],
    ['bare-focus-ring', 'className="hover:focus:outline-none focus:shadow-lg"', 2],
    // The correct form, and non-ring `focus:` utilities (Radix menu items key
    // off `focus:bg-*`), must stay quiet.
    ['bare-focus-ring', 'className="focus-visible:outline-none focus-visible:ring-2"', 0],
    ['bare-focus-ring', 'className="focus:bg-surface-hover focus:text-content"', 0],
    // `group-focus:` is a distinct variant, not a bare focus ring.
    ['bare-focus-ring', 'className="group-focus:ring-2"', 0],
    // Tailwind's BARE utilities carry no hyphen. `focus:ring` is a real 3px
    // `:focus`-gated ring and `focus:shadow` a real `:focus` box-shadow, so
    // requiring `ring-`/`shadow-` let the commonest shorthand through.
    ['bare-focus-ring', 'className="focus:ring"', 1],
    ['bare-focus-ring', 'className="focus:shadow"', 1],
    ['bare-focus-ring', 'className="md:focus:ring"', 1],
    ['bare-focus-ring', 'className="focus:ring focus:outline-none"', 2],
    // …but a bare word that merely STARTS with ring/shadow is not a ring.
    ['bare-focus-ring', 'className="focus:ringer"', 0],
    // A lone `focus:outline-none` is the focus-CONTAINER idiom (Radix
    // Dialog.Content) and must not be flagged without a ring on the line.
    ['bare-focus-ring', 'className="outline-none focus:outline-none"', 0],
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
  for (const file of walk(root.dir)) {
    const counts = scanContent(readFileSync(file, 'utf8'), root.only);
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

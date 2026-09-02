#!/usr/bin/env node
/**
 * P3-6 — admin raw-palette → semantic-token codemod.
 *
 * Encodes the raw→semantic mapping table ONCE so batches 1-6 cannot each
 * re-litigate it. Run it over a batch, then review the diff: this is a
 * mechanical first pass, not an oracle. Anything it cannot map safely it leaves
 * alone and reports, so unmapped classes surface rather than being silently
 * approximated.
 *
 * DO NOT run this over test files. It rewrites any matching string, including
 * ASSERTIONS — it silently turned `expect(out).not.toContain('bg-border-default')`
 * into a check for a different, widely-used class, repurposing a deliberate
 * regression guard while keeping it green. Exclude `__tests__` and `*.test.*`.
 *
 *   node scripts/admin-token-codemod.mjs <path...>        # apply
 *   node scripts/admin-token-codemod.mjs --dry <path...>  # report only
 *
 * WHAT IT DOES NOT DO — read this before trusting it:
 *
 * 1. It assumes a LIGHT surface. `text-gray-400` means "disabled text on white"
 *    on a light card and "primary nav label" on a dark one; the mapping below is
 *    only correct for the former. Admin's Sidebar is a dark chrome
 *    (`bg-gray-900`) and the token layer has no dark-surface vocabulary beyond
 *    `surface-inverse{,-subtle}` / `text-inverse` — so the sidebar is excluded
 *    and must be handled by a design decision, not this script.
 *
 * 2. The mapping is NOT pixel-neutral, deliberately. Admin's grays match the
 *    token TEXT primitives exactly, but semantic surfaces and borders route
 *    through the warm `sand` ramp, and `status-info` is teal rather than blue.
 *    Adopting Florida Modern is the point; every batch is an intentional visual
 *    change that needs before/after review, not a silent refactor.
 *
 * 3. `text-gray-700` (89 occurrences repo-wide) has no exact token. It maps to
 *    `text-content-secondary` (gray-600) ALONG WITH `text-gray-600`. Net effect:
 *    the 600s are unchanged and the 700s lighten slightly. Chosen over mapping
 *    700 to `text-content` (gray-900), which would have darkened body copy into
 *    heading weight. Either direction is a contrast change, not a regression.
 */
import fs from 'node:fs';

// Ordered longest-prefix-first so `bg-gray-50` is never matched by a rule for
// `bg-gray-500`. Word boundaries are enforced by the regex builder below.
const RAW_CLASS_ADMIN = /\b(?:bg|text|border|ring|divide|placeholder|from|via|to|fill|stroke|outline|decoration|accent|caret|shadow)-(?:gray|blue|red|green|yellow|amber|purple|violet|emerald|rose|orange|sky|pink|slate|zinc|neutral|stone|lime|teal|cyan|indigo|fuchsia)-\d{2,3}\b/g;

const ADMIN_PALETTE_MAP = {
  // ── Text (light surfaces) ──
  'text-gray-900': 'text-content',
  'text-gray-800': 'text-content',
  'text-gray-700': 'text-content-secondary',
  'text-gray-600': 'text-content-secondary',
  'text-gray-500': 'text-content-tertiary',
  'text-gray-400': 'text-content-disabled',

  // ── Surfaces ──
  'bg-white': 'bg-surface-card',
  'bg-gray-25': 'bg-surface-subtle',
  'bg-gray-50': 'bg-surface-page',
  'bg-gray-100': 'bg-surface-muted',

  // ── Borders / dividers ──
  'border-gray-100': 'border-edge-subtle',
  'border-gray-200': 'border-edge',
  'border-gray-300': 'border-edge-strong',
  'divide-gray-100': 'divide-edge-subtle',
  'divide-gray-200': 'divide-edge',

  // ── Status: success (tokens' green is emerald — intentional shift) ──
  'text-green-800': 'text-status-success',
  'text-green-700': 'text-status-success',
  'text-green-600': 'text-status-success',
  'bg-green-50': 'bg-status-success-bg',
  'bg-green-100': 'bg-status-success-subtle',
  'border-green-200': 'border-status-success-border',

  // ── Status: warning (yellow → amber — intentional shift) ──
  'text-yellow-800': 'text-status-warning',
  'text-yellow-700': 'text-status-warning',
  'text-yellow-600': 'text-status-warning',
  'bg-yellow-50': 'bg-status-warning-bg',
  'bg-yellow-100': 'bg-status-warning-subtle',
  'border-yellow-200': 'border-status-warning-border',
  'text-amber-800': 'text-status-warning',
  'text-amber-700': 'text-status-warning',
  'text-amber-600': 'text-status-warning',
  'bg-amber-50': 'bg-status-warning-bg',
  'bg-amber-100': 'bg-status-warning-subtle',
  'border-amber-200': 'border-status-warning-border',

  // ── Status: danger ──
  'text-red-800': 'text-status-danger',
  'text-red-700': 'text-status-danger',
  'text-red-600': 'text-status-danger',
  'bg-red-50': 'bg-status-danger-bg',
  'bg-red-100': 'bg-status-danger-subtle',
  'border-red-200': 'border-status-danger-border',

  // ── Status: info (blue → TEAL — the largest intentional hue shift) ──
  'text-blue-800': 'text-status-info',
  'text-blue-700': 'text-status-info',
  'text-blue-600': 'text-status-info',
  'bg-blue-50': 'bg-status-info-bg',
  'bg-blue-100': 'bg-status-info-subtle',
  'border-blue-200': 'border-status-info-border',
};

/**
 * apps/web — dead semantic classes → the class that actually exists.
 *
 * These are NOT raw-palette classes. Every key here is a class that emits ZERO
 * CSS: it names a key `apps/web/tailwind.config.ts` does not declare, so
 * Tailwind generates no rule and the element renders with no colour. Two
 * dialects, one mismatch:
 *
 *   - the CSS custom-property name written where a Tailwind key was needed
 *     (`--border-default` is the token, but the class is `border-edge`);
 *   - stock shadcn names, which this config never declared and globals.css
 *     never defined.
 *
 * Deliberately ABSENT because they need a per-call-site decision, not a
 * mapping — do these by hand and read the surrounding markup first:
 *   `bg-surface`            page background vs card background
 *   `bg-surface-secondary`  solid chip vs hover state
 *   `ring-offset-background` drop it, or offset against a real surface
 */
const WEB_SEMANTIC_MAP = {
  // ── Token name used as a class name ──
  'border-border-default': 'border-edge',
  'divide-border-default': 'divide-edge',
  'bg-border-default': 'bg-surface-muted',
  'border-border': 'border-edge',
  'border-default': 'border-edge',
  'divide-default': 'divide-edge',
  'text-content-primary': 'text-content',
  'accent-interactive-primary': 'accent-interactive',
  // `bg-interactive-primary/10` is skipped by the `/` lookahead below and must
  // be fixed by hand to `bg-interactive-subtle` — slash-opacity on a bare
  // var() emits nothing either.
  'bg-interactive-primary-hover': 'bg-interactive-hover',
  'bg-interactive-primary': 'bg-interactive',
  'text-interactive-primary': 'text-interactive',
  'border-interactive-primary': 'border-interactive',
  'ring-interactive-primary': 'ring-focus',
  'text-status-danger-fg': 'text-status-danger',
  'text-status-success-fg': 'text-status-success',
  'text-brand': 'text-content-brand',
  'bg-surface-input': 'bg-surface-card',
  'border-error': 'border-edge-error',
  'text-error': 'text-status-danger',

  // ── No darker status token exists, and no --red-800/--green-800/--amber-800
  //    primitive to build one from. Written `hover:bg-status-danger-hover`, so
  //    the rewrite lands as `hover:opacity-90` and restores hover feedback
  //    without inventing a palette entry.
  'bg-status-danger-hover': 'opacity-90',
  'bg-status-success-hover': 'opacity-90',
  'bg-status-warning-hover': 'opacity-90',

  // ── Stock shadcn vocabulary ──
  'text-muted-foreground': 'text-content-secondary',
  'text-accent-foreground': 'text-content',
  'text-destructive': 'text-status-danger',
  'bg-background': 'bg-surface-card',
  'bg-muted': 'bg-surface-muted',
  'bg-input': 'bg-surface-card',
  'border-input': 'border-edge',
  'border-ring': 'border-edge-focus',
  'ring-ring': 'ring-focus',
};

const MAPS = {
  'admin-palette': { map: ADMIN_PALETTE_MAP, leftovers: RAW_CLASS_ADMIN },
  'web-semantic': { map: WEB_SEMANTIC_MAP, leftovers: null },
};

/**
 * Classes we deliberately DO NOT map, with the reason. Reported per file so a
 * reviewer sees what the codemod declined rather than assuming full coverage.
 */
const UNMAPPED_REASONS = [
  [/\b(bg|text|border)-(gray|blue)-(700|800|900|950)\b/, 'dark-surface usage — no semantic dark vocabulary'],
  [/\b(bg|text|border)-(purple|violet|rose|orange|sky|pink|emerald)-\d+\b/, 'no status role assigned; needs a human call'],
];



const args = process.argv.slice(2);
const dry = args.includes('--dry');
const mapArg = args.find((a) => a.startsWith('--map='));
const mapName = mapArg ? mapArg.slice('--map='.length) : 'admin-palette';
const files = args.filter((a) => !a.startsWith('--'));

if (!MAPS[mapName]) {
  console.error(
    `unknown --map='${mapName}'. Available: ${Object.keys(MAPS).join(', ')}`,
  );
  process.exit(1);
}

if (files.length === 0) {
  console.error(
    'usage: admin-token-codemod.mjs [--dry] [--map=admin-palette|web-semantic] <path...>',
  );
  process.exit(1);
}

const MAP = MAPS[mapName].map;
const RAW_CLASS = MAPS[mapName].leftovers;

// Longest key first: `border-default` must never be matched by a rule for
// `border-border-default`, and `text-gray-500` must win over any shorter prefix.
const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);

let totalChanged = 0;
const leftovers = new Map();

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  for (const key of keys) {
    // Match the class as a whole token, allowing Tailwind variant prefixes
    // (hover:, focus:, sm:, dark:, group-hover: …) to carry through untouched.
    //
    // The `/` in the lookahead is load-bearing, not tidiness. A slash-opacity
    // class like `bg-white/30` must NOT be rewritten: Tailwind's built-in
    // palette is defined with rgb channels so the modifier compiles, but the
    // semantic tokens are bare `var(--x)` with no <alpha-value>, so
    // `bg-surface-card/30` emits ZERO CSS and the element renders with no
    // background at all. Without this guard the codemod silently broke 27
    // translucent placeholder bars in TemplateThumbnail.tsx — caught only
    // because `guard:design-tokens` flags `slash-opacity-semantic`.
    const re = new RegExp(`(?<![\\w-])${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![\\w-/])`, 'g');
    src = src.replace(re, MAP[key]);
  }

  if (src !== before) totalChanged += 1;
  if (!dry && src !== before) fs.writeFileSync(file, src);

  const remaining = RAW_CLASS ? [...(src.match(RAW_CLASS) ?? [])] : [];
  if (remaining.length > 0) {
    leftovers.set(file, remaining);
  }
}

console.log(`${dry ? '[dry] ' : ''}rewrote ${totalChanged}/${files.length} file(s)`);

if (leftovers.size > 0) {
  console.log('\nUNMAPPED — review each by hand:');
  for (const [file, classes] of leftovers) {
    const tally = classes.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map());
    const why = UNMAPPED_REASONS.find(([re]) => [...tally.keys()].some((c) => re.test(c)))?.[1] ?? '';
    console.log(`  ${file}${why ? `  (${why})` : ''}`);
    for (const [c, n] of [...tally].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(n).padStart(3)}  ${c}`);
    }
  }
}

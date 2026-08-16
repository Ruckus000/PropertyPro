#!/usr/bin/env node
/**
 * Assert that every semantic token class referenced in apps/admin/src actually
 * EMITS CSS in the built stylesheet.
 *
 *   pnpm --filter @propertypro/admin build    # must run first
 *   node scripts/verify-admin-semantic-css.cjs
 *
 * WHY THIS EXISTS — it catches a failure mode `guard:design-tokens` structurally
 * cannot. That guard checks that raw palette classes are GONE; it has no opinion
 * on whether the semantic class you replaced them with resolves to anything. A
 * class that Tailwind does not recognise is not an error: it emits no rule, and
 * the element silently renders with no background / inherited colour. Nothing
 * fails, nothing logs, and the drain looks complete.
 *
 * Two real instances during the P3-6 admin migration, both found only here:
 *
 *  1. `bg-status-owner-subtle` / `text-status-owner` on the root-manager role
 *     chip. The tokens exist in tokens.css, but admin's Tailwind config mirrored
 *     apps/web's status family, which omits `owner` and `board` — so the chip
 *     compiled to nothing.
 *  2. `bg-surface-card/30`, produced by a codemod rewriting `bg-white/30`. The
 *     semantic tokens are bare custom properties with no `<alpha-value>`, so
 *     slash-opacity yields zero CSS. (`guard:design-tokens` does flag this one
 *     via `slash-opacity-semantic`, but ONLY in files not already baselined for
 *     that rule.)
 *
 * Not wired into `pnpm lint` because it requires a production build. Run it
 * after any batch that introduces semantic classes, and after any edit to
 * apps/admin/tailwind.config.ts.
 *
 * Exit codes:
 *   0 — every referenced class emits CSS
 *   1 — at least one class emits nothing
 *   2 — this guard COULD NOT CHECK (no built CSS, missing search root, grep
 *       errored, or zero classes found). It refuses to report success from a
 *       tree it cannot search.
 *
 * That last case is not hypothetical. This guard shipped with
 * `grep … || true` and no assertion on the match count, which is the same bug
 * ce0ec269 fixed in verify-css-var-migration.sh: with apps/admin/src absent,
 * grep printed "No such file or directory", `|| true` swallowed the status,
 * `used` was empty, so `missing` was empty and it printed "✅ all emit CSS"
 * and exited 0 — having verified nothing, while the error sat in its own
 * stderr. Reproduced before fixing. Renaming the admin source root would have
 * left this permanently green.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cssDir = path.join(repoRoot, 'apps/admin/.next/static/css');

if (!fs.existsSync(cssDir)) {
  console.error(
    'No built CSS at apps/admin/.next/static/css — run `pnpm --filter @propertypro/admin build` first.',
  );
  process.exit(2);
}

// Recursive: Next emits the stylesheet at static/css/app/layout.css, one level
// down. A non-recursive readdir saw only the `app` directory, matched no *.css,
// and read the empty string — so every class "emitted nothing" and the guard
// failed 39/39 regardless of the code. Vacuously RED is as useless as vacuously
// green: it cannot pass, so it proves nothing either way.
const cssFiles = fs
  .readdirSync(cssDir, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.css'));

if (cssFiles.length === 0) {
  console.error(
    `No *.css under ${path.relative(repoRoot, cssDir)} — the build output moved. ` +
      'Refusing to report every class as missing from a stylesheet that was never read.',
  );
  process.exit(2);
}

const css = cssFiles
  .map((f) => fs.readFileSync(path.join(cssDir, f), 'utf8'))
  .join('\n');

const SEMANTIC_FAMILIES = 'content|surface|edge|interactive|status|nav';
const UTILITY_PREFIXES = 'bg|text|border|ring|divide|placeholder|fill|stroke|from|via|to';

const SRC_REL = 'apps/admin/src';

if (!fs.existsSync(path.join(repoRoot, SRC_REL))) {
  console.error(
    `Search root '${SRC_REL}' does not exist — refusing to report success from a tree this guard cannot search.`,
  );
  process.exit(2);
}

// Branch on grep's real exit status, never on its stdout: 0 = matched,
// 1 = no matches, >=2 = the search itself failed. `|| true` here is what made
// a broken search indistinguishable from a clean one.
let grep = '';
let grepStatus = 0;
try {
  grep = cp.execFileSync(
    'grep',
    ['-rhoE', `(${UTILITY_PREFIXES})-(${SEMANTIC_FAMILIES})(-[a-z0-9]+)*`, SRC_REL],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26 },
  );
} catch (err) {
  grepStatus = typeof err.status === 'number' ? err.status : 2;
  grep = typeof err.stdout === 'string' ? err.stdout : '';
}

if (grepStatus >= 2) {
  console.error(
    `grep exited ${grepStatus} — the search did not complete, so this guard proves nothing.`,
  );
  process.exit(grepStatus);
}

const used = [...new Set(grep.split('\n').filter(Boolean))].sort();

// Zero is not a clean result here: admin is mid-migration and references
// hundreds of semantic classes. Zero means the pattern, the search root or the
// migration's premise moved — every downstream check would pass vacuously.
if (used.length === 0) {
  console.error(
    `No semantic classes found in ${SRC_REL}. Expected hundreds — the pattern or ` +
      'the search root has moved. Refusing to pass a check that examined nothing.',
  );
  process.exit(2);
}

// A class emits if its name appears in a selector position: preceded by `.`
// (plain, `.bg-x{`) or by an escaped `\:` (variant-prefixed,
// `.hover\:bg-x:hover{`), and followed by a selector-terminating character so
// `bg-interactive` does not match inside `bg-interactive-hover`.
const missing = used.filter((cls) => {
  const name = cls.replace(/-/g, '\\-');
  return !new RegExp(`(?:\\.|\\\\:)${name}(?=[{>:,\\s.\\[])`).test(css);
});

console.log(`semantic classes referenced in apps/admin/src: ${used.length}`);

if (missing.length === 0) {
  console.log('✅ all emit CSS');
  process.exit(0);
}

console.error(`\n❌ ${missing.length} semantic class(es) emit NO CSS and render as no style:\n`);
for (const m of missing) console.error(`   ${m}`);
console.error(
  '\nUsual causes: the family/shade is missing from `theme.colors` in ' +
    'apps/admin/tailwind.config.ts, or the class carries slash-opacity ' +
    '(semantic tokens have no <alpha-value> channel).',
);
process.exit(1);

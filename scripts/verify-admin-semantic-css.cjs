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

const css = fs
  .readdirSync(cssDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(cssDir, f), 'utf8'))
  .join('\n');

const SEMANTIC_FAMILIES = 'content|surface|edge|interactive|status|nav';
const UTILITY_PREFIXES = 'bg|text|border|ring|divide|placeholder|fill|stroke|from|via|to';

const grep = cp.execSync(
  `grep -rhoE '(${UTILITY_PREFIXES})-(${SEMANTIC_FAMILIES})(-[a-z0-9]+)*' apps/admin/src || true`,
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26 },
);

const used = [...new Set(grep.split('\n').filter(Boolean))].sort();

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

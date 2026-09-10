#!/usr/bin/env node
/**
 * Assert that every semantic token class referenced in apps/admin/src OR
 * packages/ui/src actually EMITS CSS in the built stylesheet. Both roots:
 * admin's Tailwind `content` globs packages/ui/src too, so a class that
 * resolves to nothing there renders as no style in admin exactly like one
 * written directly in apps/admin/src.
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
 * The apps/web counterpart is scripts/verify-web-class-resolution.ts. It answers
 * the same question WITHOUT a build — it compiles Tailwind from the web app's
 * own config instead of grepping build output — which is what lets it run in
 * `pnpm lint`, where CI never builds. Porting that approach here would let this
 * guard join lint too.
 *
 * KNOWN GAP — runtime-assembled class names. Any extracted match containing
 * `$` (a swallowed `` `bg-status-${variant}` `` interpolation) is dropped
 * from the checked set rather than tested, so a real runtime-constructed
 * class name passes through this guard undetected. This is not a regression
 * from a previous version: the old grep pattern never CAUGHT a dynamic class
 * either — `[a-z0-9]` alone can't see a `${`, so it just stopped at the
 * literal prefix and reported the truncated fragment (`text-status`) as a
 * violation, an accidental false positive rather than a real detection. The
 * gap is genuinely covered elsewhere: scripts/verify-web-class-resolution.ts
 * scans both apps/web/src AND packages/ui/src with a TypeScript-parser-based
 * check that specifically looks for runtime class construction. Porting that
 * check here is the same follow-up as the paragraph above.
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClasses } from './verify-web-class-resolution';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

// Two roots, not one: after Tasks 1-3 lifted seventeen shared components into
// packages/ui, admin renders their classes too, and admin's Tailwind `content`
// already globs `../../packages/ui/src/**/*.{ts,tsx}` (see tailwind.config.ts).
// Scanning apps/admin/src alone would silently stop covering most of what
// admin actually renders.
const SRC_ROOTS = ['apps/admin/src', 'packages/ui/src'];

for (const root of SRC_ROOTS) {
  if (!fs.existsSync(path.join(repoRoot, root))) {
    console.error(
      `Search root '${root}' does not exist — refusing to report success from a tree this guard cannot search.`,
    );
    process.exit(2);
  }
}

// Extraction uses the TypeScript PARSER, via `extractClasses` from
// verify-web-class-resolution.ts — not a regex over raw file text.
//
// This guard shipped with a grep, and the grep produced a false positive twice.
// The first was `text-status` extracted from a comment in
// packages/ui/src/constants/status.ts and patched with another regex
// alternative. The second was `to-nav`, matched inside the ENGLISH PHRASE
// "click-to-navigate" in a docblock — `to` is a gradient utility prefix and
// `nav` is a semantic family, so prose spells a class name by accident. A third
// regex patch would have been the third band-aid on the same wound.
//
// The sibling guard already solved this: a parser can tell a class string from
// a comment, from JSX text, and from a regex literal, which no quote-delimited
// pattern can. Reusing it also means one extraction implementation instead of
// two that drift.
const SEMANTIC_CLASS = new RegExp(`^(${UTILITY_PREFIXES})-(${SEMANTIC_FAMILIES})(-|$)`);

function sourceFilesUnder(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(repoRoot, root), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    const dir = (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path: string }).path;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

const usedSet = new Set<string>();
let filesScanned = 0;

for (const root of SRC_ROOTS) {
  for (const file of sourceFilesUnder(root)) {
    filesScanned += 1;
    const { tokens } = extractClasses(file, fs.readFileSync(file, 'utf8'));
    for (const token of tokens) {
      if (SEMANTIC_CLASS.test(token)) usedSet.add(token);
    }
  }
}

if (filesScanned === 0) {
  console.error(
    `No .ts/.tsx files under ${SRC_ROOTS.join(' or ')} — refusing to report success ` +
      'from a tree this guard did not actually read.',
  );
  process.exit(2);
}

const used = [...usedSet].sort();

// Zero is not a clean result here: admin is mid-migration and references dozens
// of DISTINCT semantic classes (69 across both roots on 2026-09-08 — the count
// is de-duplicated, which is why it is dozens and not the thousands of raw
// call sites). Zero means the pattern, the search roots or the migration's
// premise moved — every downstream check would pass vacuously.
if (used.length === 0) {
  console.error(
    `No semantic classes found in ${SRC_ROOTS.join(' or ')}. Expected dozens of distinct ` +
      'classes (69 on 2026-09-08) — the pattern or the search roots have moved. ' +
      'Refusing to pass a check that examined nothing.',
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

console.log(`semantic classes referenced in ${SRC_ROOTS.join(' + ')}: ${used.length}`);

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

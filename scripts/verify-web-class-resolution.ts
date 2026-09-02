#!/usr/bin/env tsx
/**
 * Assert that every colour utility class referenced in apps/web/src actually
 * EMITS CSS under apps/web's Tailwind config.
 *
 *   pnpm guard:class-resolution
 *
 * WHY THIS EXISTS
 * ---------------
 * Tailwind does not error on a class it does not recognise. It emits no rule,
 * and the element renders with no background / no ring / an inherited colour.
 * Nothing fails, nothing logs, nothing appears in a diff review. The class name
 * *looks* semantic, so it survives code review indefinitely.
 *
 * `guard:design-tokens` structurally cannot catch this: it checks that RAW
 * palette values are gone (`bg-blue-500`, `#fff`), and has no opinion on whether
 * the semantic-looking class you replaced them with resolves to anything.
 * `guard:token-coverage` checks the other half of the chain — that every
 * `var(--x)` referenced is defined — but a class name never reaches a CSS var
 * if Tailwind drops it first.
 *
 * Two distinct failure shapes, both found in apps/web when this guard was
 * written (2026-09-02), together spanning 84 files:
 *
 *  1. **shadcn orphans.** `components/ui/switch.tsx` was imported from upstream
 *     shadcn, which assumes a `background` / `input` / `ring` colour vocabulary
 *     backed by CSS vars this repo never defined. The Switch therefore rendered
 *     as a solid coral capsule with no visible thumb when ON, and an invisible
 *     pill when OFF — only `data-[state=checked]:bg-primary` resolved. Same
 *     shape in `text-muted-foreground` (64 uses), `border-input`, `ring-ring`,
 *     `ring-offset-background`, `bg-muted`, `text-destructive`.
 *
 *  2. **Semantic near-misses.** The CSS variable is `--interactive-primary`, but
 *     the Tailwind *class* is `bg-interactive` (the family's DEFAULT). Writing
 *     the var name as the class — `bg-interactive-primary`, `text-content-primary`,
 *     `border-default`, `text-danger`, `bg-surface` — produces a plausible name
 *     that emits nothing. 28 such classes were live.
 *
 * WHAT IT DOES NOT COVER
 * ----------------------
 * Slash-opacity on a semantic token (`bg-interactive/10`) also emits zero CSS,
 * because these tokens are bare `var(--x)` with no `<alpha-value>` channel. That
 * is `guard:design-tokens`' `slash-opacity-semantic` rule and is deliberately
 * left there, so a violation is reported once rather than twice. This guard
 * strips a trailing `/N` and checks only whether the FAMILY resolves — so
 * `bg-success/10` (no `success` family at all) is still caught here.
 *
 * Dynamic class construction (`` `bg-${tone}-500` ``) is invisible to this guard,
 * exactly as it is to Tailwind's own extractor.
 *
 * Exit codes:
 *   0 — every referenced colour utility emits CSS
 *   1 — at least one emits nothing
 *   2 — COULD NOT CHECK (missing search root, no candidates found, compile
 *       failed). It refuses to report success from a tree it did not search.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_REL = 'apps/web/src';
const srcRoot = path.join(repoRoot, SRC_REL);

/** Utility prefixes whose value is a colour from `theme.colors`. */
const COLOUR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset',
  'divide', 'placeholder', 'fill', 'stroke',
  'outline', 'caret', 'decoration', 'accent',
] as const;

/**
 * A bare utility with no variant prefix, e.g. `bg-surface-card`. Variants are
 * stripped before this is applied: `data-[state=checked]:bg-interactive` fails
 * only if `bg-interactive` fails, so checking bases avoids reimplementing
 * Tailwind's selector escaping (which is where an earlier draft produced false
 * positives on `bg-stone-950`).
 */
const BASE_UTILITY = new RegExp(
  `^(?:${COLOUR_PREFIXES.join('|')})-[a-z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$`,
);

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

if (!fs.existsSync(srcRoot)) {
  fail(
    `Search root '${SRC_REL}' does not exist — refusing to report success from a tree this guard cannot search.`,
  );
}

/** Recursively collect .ts/.tsx under a root. */
function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test files are excluded deliberately: they legitimately contain broken
      // class names as fixtures and negative assertions (e.g. help/__tests__/
      // step-by-step.test.tsx asserts `not.toContain('bg-border-default')`),
      // and they render no production UI.
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      collectSources(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const sources = collectSources(srcRoot);
if (sources.length === 0) {
  fail(`No .ts/.tsx files under ${SRC_REL} — the source layout moved.`);
}

/** Strip leading Tailwind variant prefixes (`hover:`, `data-[x=y]:`, `[&>svg]:`). */
function stripVariants(token: string): string {
  let prev: string;
  let out = token;
  do {
    prev = out;
    out = out.replace(/^(?:\[[^\]]*\]|[a-z0-9_&>[\]=.-]+(?:\[[^\]]*\])?)?:/, '');
  } while (out !== prev);
  return out.replace(/^[!-]/, '');
}

// candidate base utility -> files referencing it
const candidates = new Map<string, Set<string>>();
const STRING_LITERAL = /(["'`])((?:[^"'`\\\n]|\\.)*)\1/g;

for (const file of sources) {
  const src = fs.readFileSync(file, 'utf8');
  for (const match of src.matchAll(STRING_LITERAL)) {
    const body = match[2];
    if (!/[a-z]-[a-z]/.test(body)) continue;
    for (const raw of body.split(/\s+/)) {
      // Drop slash-opacity: that failure mode belongs to guard:design-tokens.
      // Checking the family alone still catches an undefined family.
      const token = stripVariants(raw).replace(/\/\d+$/, '');
      if (!BASE_UTILITY.test(token)) continue;
      let set = candidates.get(token);
      if (!set) candidates.set(token, (set = new Set()));
      set.add(path.relative(repoRoot, file));
    }
  }
}

const referenced = [...candidates.keys()].sort();

// Zero is never a clean result: apps/web references ~180 colour utilities.
// Zero means the extractor, the source root, or the class conventions moved,
// and every downstream check would pass vacuously.
const MIN_EXPECTED = 100;
if (referenced.length < MIN_EXPECTED) {
  fail(
    `Only ${referenced.length} colour utilities found in ${SRC_REL} (expected >= ${MIN_EXPECTED}).\n` +
      'The extractor or the source root has moved. Refusing to pass a check that examined almost nothing.',
  );
}

const run = async () => {
  // Compile Tailwind directly rather than reading a Next build. This keeps the
  // guard runnable in `pnpm lint` (no `next build` prerequisite) and pins the
  // content to exactly the candidates, so JIT emits a rule iff the class resolves.
  // tailwindcss/postcss are dependencies of apps/web, not of the repo root, and
  // pnpm's isolated store means a root-level bare import cannot see them.
  // Resolve them from apps/web explicitly instead of adding root devDependencies.
  const webDir = path.join(repoRoot, 'apps/web');
  const requireFromWeb = createRequire(path.join(webDir, 'package.json'));
  const resolveFromWeb = (id: string) => pathToFileURL(requireFromWeb.resolve(id)).href;

  let postcss: typeof import('postcss').default;
  let tailwind: (cfg: unknown) => unknown;
  try {
    postcss = (await import(resolveFromWeb('postcss'))).default;
    tailwind = (await import(resolveFromWeb('tailwindcss'))).default;
  } catch (err) {
    fail(
      'Could not load tailwindcss/postcss from apps/web — run `pnpm install` first.\n' +
        `Refusing to report success without compiling. (${(err as Error).message})`,
    );
  }
  const { default: userConfig } = await import('../apps/web/tailwind.config');

  const { css } = await postcss([
    tailwind({ ...userConfig, content: [{ raw: referenced.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });

  if (!css || css.length === 0) {
    fail('Tailwind produced an empty stylesheet — the compile failed, so this guard proves nothing.');
  }

  const emits = (cls: string) =>
    new RegExp(`\\.${cls.replace(/-/g, '\\-')}(?=[{>:,\\s.\\[])`).test(css);

  // Anti-vacuity: a stylesheet that resolves NOTHING would mark every class
  // missing and look like a catastrophic failure of the code under test.
  const resolved = referenced.filter(emits);
  if (resolved.length === 0) {
    fail(
      'No referenced class resolved at all — the compile or the selector match is broken, ' +
        'not the source. Refusing to report every class as a violation.',
    );
  }

  const missing = referenced.filter((c) => !emits(c));

  console.log(`colour utilities referenced in ${SRC_REL}: ${referenced.length} (resolved: ${resolved.length})`);

  if (missing.length === 0) {
    console.log('✅ all emit CSS');
    return;
  }

  console.error(`\n❌ ${missing.length} class(es) emit NO CSS and render as no style:\n`);
  for (const cls of missing) {
    const where = [...candidates.get(cls)!].slice(0, 3).join(', ');
    const more = candidates.get(cls)!.size > 3 ? ` (+${candidates.get(cls)!.size - 3} more)` : '';
    console.error(`   ${cls}\n      ${where}${more}`);
  }
  console.error(
    '\nUsual causes:\n' +
      "  • the family/shade is missing from `theme.extend.colors` in apps/web/tailwind.config.ts\n" +
      '  • the CSS VAR name was used as the class name — the var is `--interactive-primary`,\n' +
      '    but the class is `bg-interactive` (the family DEFAULT)\n' +
      '  • an upstream shadcn class assuming a `background`/`input`/`ring` vocabulary\n' +
      '    this repo does not define\n',
  );
  process.exit(1);
};

run().catch((err) => {
  fail(`Guard could not complete: ${err?.stack ?? err}`);
});

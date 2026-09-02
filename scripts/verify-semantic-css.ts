#!/usr/bin/env tsx
/**
 * Assert that every colour utility class referenced in an app's source actually
 * EMITS CSS in that app's built stylesheet.
 *
 *   pnpm --filter @propertypro/web build     # must run first
 *   pnpm guard:semantic-css:web              # or :admin
 *
 * WHY THIS EXISTS — it catches a failure mode `guard:design-tokens` structurally
 * cannot. That guard checks that raw palette classes are GONE; it has no opinion
 * on whether the semantic class you replaced them with resolves to anything. A
 * class Tailwind does not recognise is not an error: it emits no rule, and the
 * element silently renders with no background / inherited colour. Nothing fails,
 * nothing logs, and the drain looks complete.
 *
 * Two real instances during the P3-6 admin migration, both found only here:
 *
 *  1. `bg-status-owner-subtle` / `text-status-owner` on the root-manager role
 *     chip. The tokens exist in tokens.css, but admin's Tailwind config mirrored
 *     apps/web's status family, which omitted `owner` and `board` — so the chip
 *     compiled to nothing.
 *  2. `bg-surface-card/30`, produced by a codemod rewriting `bg-white/30`. The
 *     semantic tokens are bare custom properties with no `<alpha-value>`, so
 *     slash-opacity yields zero CSS. This guard catches that too: the slash
 *     modifier is part of the candidate, so `ring-focus/20` is checked against
 *     the selector `.ring-focus\/20`, which Tailwind never emitted. That found
 *     10 invisible focus rings on the password-reset forms which
 *     `guard:design-tokens` does NOT flag — its own family list omits `focus`.
 *
 * THE VOCABULARY IS DERIVED, NOT HARDCODED. An earlier version enumerated six
 * family names (`content|surface|edge|interactive|status|nav`) and could only
 * see classes that BEGIN with one. That structurally missed the largest real
 * category — 252 dead references in apps/web — because the dominant mistake is
 * writing the CSS custom-property name, or the stock shadcn name, where a
 * Tailwind key was needed (`--border-default` → the class is `border-edge`, but
 * authors wrote `border-default`, 45 times). A hardcoded list always lags the
 * next invented name; three derived sources cannot:
 *
 *   (a) colour keys declared in the app's own tailwind.config.ts, across every
 *       colour-bearing scale — `ringColor` is how `error` enters the vocabulary,
 *       which is what catches `text-error` and `border-error`;
 *   (b) custom-property roots parsed from the token layer, PLUS the prefix fold
 *       (below), which is what makes `border-default` visible at all;
 *   (c) the stock shadcn vocabulary, which nothing in-repo can derive —
 *       apps/web/components.json records style and aliases, never token names.
 *
 * `resolveConfig` is deliberately NOT used: for an app using `extend` it merges
 * Tailwind's entire default palette in, inflating the denominator with ~20 ramp
 * names that are all valid and catch nothing.
 *
 * Exit codes:
 *   0 — every referenced class emits CSS
 *   1 — at least one class emits nothing
 *   2 — this guard COULD NOT CHECK (missing build, search root, config, token
 *       stylesheet, a failed search, a suspiciously small vocabulary, or a
 *       missing sentinel). It refuses to report success from a tree it cannot
 *       search.
 *
 * That last case is not hypothetical. This guard shipped with `grep … || true`
 * and no assertion on the match count, which is the same bug ce0ec269 fixed in
 * verify-css-var-migration.sh: with the source root absent, grep printed "No
 * such file or directory", `|| true` swallowed the status, and it printed
 * "✅ all emit CSS" having verified nothing. A DERIVED vocabulary adds a second
 * way to fail silently — it can SHRINK — so `assertSentinels` below is the most
 * important safety line in the file.
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface AppConfig {
  pkg: string;
  cssDir: string;
  tailwindConfig: string;
  srcRoots: string[];
  /** Floor on the referenced-class count. A scan that examined almost nothing must not pass. */
  minExpected: number;
}

const APPS: Record<string, AppConfig> = {
  admin: {
    pkg: '@propertypro/admin',
    cssDir: 'apps/admin/.next/static/css',
    tailwindConfig: 'apps/admin/tailwind.config.ts',
    // Deliberately just apps/admin/src — widening admin's search root is a
    // separate change with its own baseline to establish.
    srcRoots: ['apps/admin/src'],
    minExpected: 40,
  },
  web: {
    pkg: '@propertypro/web',
    cssDir: 'apps/web/.next/static/css',
    tailwindConfig: 'apps/web/tailwind.config.ts',
    // packages/ui/src is in apps/web's Tailwind `content` globs and renders in
    // the web app, so a class referenced there must emit in web's stylesheet.
    srcRoots: ['apps/web/src', 'packages/ui/src'],
    minExpected: 90,
  },
};

/**
 * Multi-segment prefixes first so `ring-offset-background` is read as
 * `ring-offset` + `background` rather than `ring` + `offset-background`.
 * `accent` and `decoration` are not decoration: `accent-interactive-primary` is
 * a live defect found only because `accent` is on this list.
 */
const UTILITY_PREFIXES = [
  'ring-offset',
  'bg',
  'text',
  'border',
  'ring',
  'divide',
  'placeholder',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'outline',
  'caret',
  'accent',
  'decoration',
];

/** Every theme scale that can name a colour. Read `theme[scale]` AND `theme.extend[scale]`. */
const COLOR_SCALES = [
  'colors',
  'ringColor',
  'textColor',
  'backgroundColor',
  'borderColor',
  'divideColor',
  'placeholderColor',
  'fill',
  'stroke',
  'gradientColorStops',
  'accentColor',
  'caretColor',
  'outlineColor',
  'ringOffsetColor',
  'textDecorationColor',
];

/**
 * Stock shadcn/ui vocabulary. This is the one source that cannot be derived —
 * it is upstream's, and changes only when shadcn does. apps/web/components.json
 * sets `"cssVariables": true` but globals.css defines none of these, so every
 * one of them is dead here.
 */
const SHADCN = [
  'background', 'foreground', 'card', 'card-foreground', 'popover',
  'popover-foreground', 'primary', 'primary-foreground', 'secondary',
  'secondary-foreground', 'muted', 'muted-foreground', 'accent',
  'accent-foreground', 'destructive', 'destructive-foreground', 'border',
  'input', 'ring', 'sidebar', 'sidebar-foreground', 'sidebar-primary',
  'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring', 'chart-1', 'chart-2', 'chart-3', 'chart-4',
  'chart-5',
];

const TOKEN_CSS_FILES = [
  'packages/ui/src/styles/tokens.css',
  'packages/tokens/src/generated/tokens.css',
];

/** Members that MUST survive derivation. Absence means a source has gone quiet. */
const SENTINELS = [
  // (a) the families the old hardcoded list enumerated
  'content', 'surface', 'edge', 'interactive', 'status', 'nav',
  // (b) token-layer roots, and the prefix fold that makes `border-default` visible
  'border-default', 'text-primary', 'default', 'primary',
  // (c) shadcn
  'muted-foreground', 'background', 'ring', 'input',
];

const MIN_TOKEN_ROOTS = 100;

function refuse(message: string): never {
  console.error(message);
  process.exit(2);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Concatenated built CSS, or a refusal. */
function readBuiltCss(app: AppConfig): string {
  const cssDir = path.join(repoRoot, app.cssDir);

  if (!fs.existsSync(cssDir)) {
    refuse(`No built CSS at ${app.cssDir} — run \`pnpm --filter ${app.pkg} build\` first.`);
  }

  // Recursive because Next has emitted the stylesheet one level down
  // (static/css/app/layout.css) in the past; today both apps emit flat hashed
  // files. A non-recursive readdir once saw only the `app` directory, matched no
  // *.css, and read the empty string — so every class "emitted nothing" and the
  // guard failed 39/39 regardless of the code. Vacuously RED is as useless as
  // vacuously green. Keep the recursion even though today's layout is flat.
  const cssFiles = fs
    .readdirSync(cssDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.css'));

  if (cssFiles.length === 0) {
    refuse(
      `No *.css under ${app.cssDir} — the build output moved. ` +
        'Refusing to report every class as missing from a stylesheet that was never read.',
    );
  }

  return cssFiles.map((f) => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n');
}

async function importTailwindConfig(rel: string): Promise<Record<string, any>> {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    refuse(`Tailwind config ${rel} not found — cannot derive the vocabulary.`);
  }
  try {
    const mod = await import(pathToFileURL(abs).href);
    return (mod.default ?? mod) as Record<string, any>;
  } catch (err) {
    refuse(`Tailwind config ${rel} failed to import (${(err as Error).message}) — cannot derive the vocabulary.`);
  }
}

/** (a) Colour family names the app itself declares. */
function colourFamilies(cfg: Record<string, any>): Set<string> {
  const theme = cfg.theme ?? {};
  const out = new Set<string>();
  for (const scale of COLOR_SCALES) {
    for (const source of [theme[scale], theme.extend?.[scale]]) {
      if (!source || typeof source !== 'object') continue;
      for (const key of Object.keys(source)) {
        if (key !== 'DEFAULT') out.add(key);
      }
    }
  }
  return out;
}

/** (b) Custom-property roots from the token layer. */
function tokenRoots(): Set<string> {
  const out = new Set<string>();
  let found = false;

  for (const rel of TOKEN_CSS_FILES) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    found = true;
    const text = fs.readFileSync(abs, 'utf8');
    // Requires a `:` after the name, so `var(--x)` REFERENCES are excluded —
    // only declarations count.
    for (const m of text.matchAll(/(?:^|[;{\s])--([a-zA-Z0-9-]+)\s*:/g)) {
      out.add(m[1]);
    }
  }

  if (!found) {
    refuse(
      `No token stylesheet found (looked for ${TOKEN_CSS_FILES.join(', ')}) — ` +
        'cannot derive the vocabulary.',
    );
  }
  if (out.size < MIN_TOKEN_ROOTS) {
    refuse(
      `Only ${out.size} custom properties parsed from the token layer (expected ` +
        `${MIN_TOKEN_ROOTS}+). The generator's output format has moved; refusing to ` +
        'check against a vocabulary that quietly shrank.',
    );
  }
  return out;
}

function assertSentinels(vocab: Set<string>): void {
  const absent = SENTINELS.filter((s) => !vocab.has(s));
  if (absent.length > 0) {
    refuse(
      `Derived vocabulary is missing ${absent.join(', ')} — a derivation source has gone ` +
        'quiet. Refusing to check against a vocabulary that quietly shrank.',
    );
  }
}

/** File extensions Tailwind actually scans, so we never flag a class it never saw. */
function scannedExtensions(cfg: Record<string, any>): string[] {
  const globs: string[] = Array.isArray(cfg.content)
    ? cfg.content.filter((c: unknown): c is string => typeof c === 'string')
    : [];
  const exts = new Set<string>();
  for (const g of globs) {
    const braces = g.match(/\{([a-zA-Z0-9,]+)\}\s*$/);
    if (braces) {
      for (const e of braces[1].split(',')) exts.add(e);
      continue;
    }
    const single = g.match(/\.([a-zA-Z0-9]+)$/);
    if (single) exts.add(single[1]);
  }
  return exts.size > 0 ? [...exts].sort() : ['ts', 'tsx'];
}

interface Vocabulary {
  vocab: Set<string>;
  families: Set<string>;
  roots: Set<string>;
  exts: string[];
}

async function buildVocabulary(app: AppConfig): Promise<Vocabulary> {
  const cfg = await importTailwindConfig(app.tailwindConfig);

  const families = colourFamilies(cfg);
  if (families.size === 0) {
    refuse(
      `${app.tailwindConfig} declares no colour families — cannot derive the vocabulary.`,
    );
  }

  const roots = tokenRoots();
  const vocab = new Set<string>([...families, ...roots, ...SHADCN]);

  // THE PREFIX FOLD. A token root whose first segment is itself a utility prefix
  // must also contribute its remainder, or the commonest mistake stays invisible:
  // `--border-default` has to catch BOTH `border-border-default` (prefix `border`
  // + name `border-default`) AND `border-default` (prefix `border` + name
  // `default`). Without this the 45 `border-default` refs are undetectable.
  for (const root of roots) {
    for (const p of UTILITY_PREFIXES) {
      if (root.startsWith(`${p}-`)) vocab.add(root.slice(p.length + 1));
    }
  }

  assertSentinels(vocab);

  return { vocab, families, roots, exts: scannedExtensions(cfg) };
}

/** Which derivation source named this class — tells the author what the fix is. */
function provenanceOf(cls: string, v: Vocabulary): string {
  // Strip the slash modifier first: `ring-focus/20` resolves as `ring-focus`.
  const bare = cls.replace(/\/[0-9]+$/, '');
  const prefix = UTILITY_PREFIXES.filter((p) => bare.startsWith(`${p}-`)).sort(
    (a, b) => b.length - a.length,
  )[0];
  if (!prefix) return 'unknown source';
  const rest = bare.slice(prefix.length + 1);

  // Longest vocabulary name this class actually starts with.
  let name = '';
  for (const candidate of v.vocab) {
    if ((rest === candidate || rest.startsWith(`${candidate}-`)) && candidate.length > name.length) {
      name = candidate;
    }
  }
  if (!name) return 'unknown source';

  const slashed = cls !== bare;
  const note = slashed ? ' — slash-opacity on a bare var() emits nothing' : '';
  if (SHADCN.includes(name)) return `stock shadcn name${note}`;
  if (v.roots.has(name)) return `token-layer custom property --${name}${note}`;
  if (v.roots.has(`${prefix}-${name}`)) return `token-layer custom property --${prefix}-${name}${note}`;
  if (v.families.has(name)) {
    return rest === name
      ? `declared family \`${name}\`${note}`
      : `declared family \`${name}\`, undeclared shade${note}`;
  }
  // Names that exist only because of the prefix fold: `default` comes from
  // `--border-default`. Report the root it folded from, not "derived", or the
  // author has no idea where the name came from.
  const foldedFrom = [...v.roots].find((r) => r.endsWith(`-${name}`));
  if (foldedFrom) return `token-layer custom property --${foldedFrom} (prefix fold)${note}`;
  return 'derived vocabulary';
}

export async function verifySemanticCss(appName: string): Promise<never> {
  const app = APPS[appName];
  if (!app) {
    refuse(
      `Unknown app '${appName}'. Usage: tsx scripts/verify-semantic-css.ts [${Object.keys(APPS).join('|')}]`,
    );
  }

  const css = readBuiltCss(app);

  for (const root of app.srcRoots) {
    if (!fs.existsSync(path.join(repoRoot, root))) {
      refuse(
        `Search root '${root}' does not exist — refusing to report success from a tree this guard cannot search.`,
      );
    }
  }

  const v = await buildVocabulary(app);

  // Longest-first so `border-default` wins over `default` when both could match.
  const names = [...v.vocab].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const prefixes = UTILITY_PREFIXES.map(escapeRe).join('|');
  const pattern = `(${prefixes})-(${names})(-[a-z0-9]+)*`;

  // Branch on grep's real exit status, never on its stdout: 0 = matched,
  // 1 = no matches, >=2 = the search itself failed. `|| true` here is what made
  // a broken search indistinguishable from a clean one.
  //
  // -a, and LINES not -o matches. Two separate traps:
  //   -a: without it grep prints "Binary file X matches" to STDOUT for a file it
  //   heuristically judges binary, and that sentence is then parsed as a class
  //   name. -I would silently SKIP the file, hiding the classes it references.
  //   -o has no left word boundary and POSIX ERE cannot express one, so it
  //   matched INSIDE ordinary words: the prose "auto-navigate" yielded the
  //   phantom class `to-nav`. Grep whole lines and extract below with a JS
  //   regex, which does support lookbehind.
  // Tailwind does scan test files (they sit under `src/**/*.tsx`), but a class
  // NAMED IN AN ASSERTION is not a rendered class. Without this exclusion, a
  // test written to guard against a dead class — `expect(out).not.toContain(
  // 'bg-border-default')` — reports that very class as a violation, so the
  // regression test and the guard cannot both exist. Test fixtures do not ship;
  // this guard is about what renders.
  const includeArgs = [
    ...v.exts.map((e) => `--include=*.${e}`),
    '--exclude-dir=__tests__',
    '--exclude-dir=e2e',
    '--exclude=*.test.ts',
    '--exclude=*.test.tsx',
  ];
  let grep = '';
  let grepStatus = 0;
  try {
    grep = cp.execFileSync('grep', ['-rahE', ...includeArgs, pattern, ...app.srcRoots], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1 << 27,
    });
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    grepStatus = typeof e.status === 'number' ? e.status : 2;
    grep = typeof e.stdout === 'string' ? e.stdout : '';
  }

  if (grepStatus >= 2) {
    // Normalise: the documented contract is three values, so do not leak grep's
    // raw status as a fourth.
    refuse(`grep exited ${grepStatus} — the search did not complete, so this guard proves nothing.`);
  }

  // Both edges anchored: `bg-interactive` must not match inside
  // `bg-interactive-hover` (right, handled by the greedy tail) nor inside
  // `auto-navigate` (left, the reason -o was abandoned above).
  //
  // The trailing `(?:\/[0-9]+)?` captures the slash-opacity modifier as PART of
  // the candidate, and it is load-bearing. Tailwind emits `bg-black/50` as the
  // selector `.bg-black\/50` — there is no bare `.bg-black` rule at all when
  // that is the only use. Extracting the bare name and looking for `.bg-black`
  // therefore reported four perfectly good admin classes as emitting nothing.
  // Checking the class exactly as written is both correct here and stricter: a
  // slash modifier on a SEMANTIC token (`bg-interactive/10`) emits nothing,
  // because those tokens are bare `var(--x)` with no <alpha-value> channel, and
  // this now catches that too.
  const CLASS_RE = new RegExp(
    `(?<![a-zA-Z0-9-])(?:${prefixes})-(?:${names})(?:-[a-z0-9]+)*(?:\/[0-9]+)?(?![a-zA-Z0-9-])`,
    'g',
  );

  const used = [
    ...new Set(grep.split('\n').flatMap((line) => line.match(CLASS_RE) ?? [])),
  ].sort();

  const srcRel = app.srcRoots.join(', ');

  if (used.length === 0) {
    refuse(
      `No colour utility classes found in ${srcRel}. Expected hundreds — the pattern or ` +
        'the search root has moved. Refusing to pass a check that examined nothing.',
    );
  }
  if (used.length < app.minExpected) {
    refuse(
      `Only ${used.length} colour utility classes found in ${srcRel}, below the floor of ` +
        `${app.minExpected}. The search or the vocabulary shrank; refusing to pass.`,
    );
  }

  // A class emits if its name appears in a selector position: preceded by `.`
  // (plain, `.bg-x{`) or by an escaped `\:` (variant-prefixed,
  // `.hover\:bg-x:hover{`), and followed by a selector-terminating character so
  // `bg-interactive` does not match inside `bg-interactive-hover`.
  const missing = used.filter((cls) => {
    // `-` is escaped for the regex; `/` must match the LITERAL backslash-slash
    // Tailwind writes into the selector (`.bg-black\/50`).
    const name = cls.replace(/-/g, '\\-').replace(/\//g, '\\\\/');
    return !new RegExp(`(?:\\.|\\\\:)${name}(?=[{>:,\\s.\\[])`).test(css);
  });

  console.log(
    `vocabulary: ${v.families.size} tailwind families + ${v.roots.size} token roots + ` +
      `${SHADCN.length} shadcn names → ${v.vocab.size} names`,
  );
  console.log(`colour utility classes referenced in ${srcRel}: ${used.length}`);

  if (missing.length === 0) {
    console.log('✅ all emit CSS');
    process.exit(0);
  }

  console.error(`\n❌ ${missing.length} class(es) emit NO CSS and render as no style:\n`);
  const width = Math.max(...missing.map((m) => m.length));
  for (const m of missing) {
    console.error(`   ${m.padEnd(width)}  ← ${provenanceOf(m, v)}`);
  }
  console.error(
    `\nUsual causes: you wrote the CSS custom-property name or the stock shadcn name where a ` +
      `Tailwind key was needed (\`border-default\` → \`border-edge\`, \`text-muted-foreground\` → ` +
      `\`text-content-secondary\`); the family/shade is missing from \`theme.colors\` in ` +
      `${app.tailwindConfig}; or the class carries slash-opacity (semantic tokens have no ` +
      `<alpha-value> channel).`,
  );
  process.exit(1);
}

// Run only when invoked directly (not when imported by tests).
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void verifySemanticCss(process.argv[2] || 'admin').catch((err) => {
    console.error(err);
    process.exit(2);
  });
}

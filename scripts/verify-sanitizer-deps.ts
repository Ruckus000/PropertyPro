#!/usr/bin/env tsx
/**
 * Guard: the HTML-sanitizer dependency graph must never contain `@exodus/bytes`.
 *
 * WHY THIS EXISTS — Sentry PROPERTY-PRO-7 (prod outage, 2026-06-03 → 2026-06-04)
 * ---------------------------------------------------------------------------
 * Every server-rendered page that sanitizes HTML 500'd on Vercel with:
 *
 *   require() of ES Module .../@exodus/bytes/encoding-lite.js
 *   from html-encoding-sniffer@6.0.0/... not supported
 *
 * Chain: isomorphic-dompurify → jsdom@28 → (html-encoding-sniffer@6 | whatwg-url@16
 * | jsdom's own lib/api.js) → require('@exodus/bytes'), which is ESM-only. Because
 * `jsdom` and `isomorphic-dompurify` are listed in `serverExternalPackages`
 * (apps/web/next.config.ts — required, since jsdom reads its own stylesheet off
 * disk at module load), Node performs a REAL require() at runtime, so this is a
 * runtime failure, not a bundling one. It reproduced only on Vercel's Node 24;
 * local `.nvmrc` is Node 20, whose loader tolerated those subpaths.
 *
 * Blast radius was large because the import is STATIC: the public tenant site
 * (public-site/page → block registry → html-sanitizer), announcements, violations,
 * document drafts and the help-article API all failed at route-module evaluation.
 *
 * THE FIX is a single pnpm override in the root package.json:
 *   "pnpm": { "overrides": { "isomorphic-dompurify>jsdom": "25.0.1" } }
 * jsdom@25 is the last major BEFORE jsdom adopted `@exodus/bytes` (it uses
 * html-encoding-sniffer@4 + whatwg-url@14, both CJS-safe).
 *
 * DEAD END (do not retry): overriding `html-encoding-sniffer` alone is NOT enough
 * — `@exodus/bytes` is reachable via three separate edges, so pinning one just
 * relocates the crash. The whole package must be absent from the graph.
 *
 * WHY A GUARD: that override is invisible to anyone bumping `isomorphic-dompurify`
 * in apps/web/package.json. A routine dependency bump silently reintroduces a
 * production outage that cannot be reproduced locally. This guard asserts the
 * RESOLVED graph (not just the override text), so it fails in CI instead of prod.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WEB_PKG = path.join(ROOT, 'apps/web/package.json');

/** jsdom majors >= 26 pull in the ESM-only @exodus/bytes. */
const MAX_SAFE_JSDOM_MAJOR = 25;
const BANNED = '@exodus/bytes';

function fail(message: string): never {
  console.error(`❌ sanitizer-deps guard FAILED\n\n${message}\n`);
  console.error(
    'This guard protects against Sentry PROPERTY-PRO-7: an ESM-only @exodus/bytes in the\n' +
      'jsdom graph makes every HTML-sanitizing route (public tenant sites, announcements,\n' +
      'violations, document drafts, help API) 500 on Vercel Node 24. It cannot be reproduced\n' +
      'locally on Node 20. See the header of scripts/verify-sanitizer-deps.ts.',
  );
  process.exit(1);
}

/** Resolve a dependency's package.json dir, tolerating packages whose exports map hides it. */
function resolvePackageDir(fromFile: string, name: string): string | null {
  const req = createRequire(fromFile);
  try {
    return path.dirname(req.resolve(`${name}/package.json`));
  } catch {
    // exports map may block ./package.json — resolve the entry and walk up.
    let dir: string;
    try {
      dir = path.dirname(req.resolve(name));
    } catch {
      return null;
    }
    for (let i = 0; i < 8; i += 1) {
      const candidate = path.join(dir, 'package.json');
      if (existsSync(candidate)) {
        try {
          if (JSON.parse(readFileSync(candidate, 'utf8')).name === name) return dir;
        } catch {
          /* keep walking */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }
}

function readVersion(pkgDir: string): string {
  return JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version as string;
}

// ── 1. The override must still be declared ────────────────────────────────────
const rootPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const override: unknown = rootPkg?.pnpm?.overrides?.['isomorphic-dompurify>jsdom'];
if (typeof override !== 'string' || override.length === 0) {
  fail(
    'The pnpm override "isomorphic-dompurify>jsdom" is MISSING from the root package.json.\n' +
      `Restore it (pin a jsdom ${MAX_SAFE_JSDOM_MAJOR}.x, e.g. "25.0.1") — without it, jsdom@28+\n` +
      `drags in ${BANNED} and every HTML-sanitizing route 500s in production.`,
  );
}
const overrideMajor = Number.parseInt(String(override).replace(/^[^\d]*/, ''), 10);
if (!Number.isFinite(overrideMajor) || overrideMajor > MAX_SAFE_JSDOM_MAJOR) {
  fail(
    `The pnpm override pins jsdom to "${override}" (major ${overrideMajor}), but only\n` +
      `major <= ${MAX_SAFE_JSDOM_MAJOR} is free of ${BANNED}.`,
  );
}

// ── 2. The RESOLVED jsdom under isomorphic-dompurify must match ───────────────
if (!existsSync(WEB_PKG)) fail(`Could not find ${WEB_PKG}.`);
const idpDir = resolvePackageDir(WEB_PKG, 'isomorphic-dompurify');
if (!idpDir) {
  fail(
    'Could not resolve "isomorphic-dompurify" from apps/web. Run `pnpm install` first.\n' +
      '(If the sanitizer was intentionally swapped off isomorphic-dompurify, update or delete this guard.)',
  );
}
const jsdomDir = resolvePackageDir(path.join(idpDir, 'package.json'), 'jsdom');
if (!jsdomDir) fail(`Could not resolve "jsdom" from ${idpDir}. Run \`pnpm install\` first.`);

const jsdomVersion = readVersion(jsdomDir);
const jsdomMajor = Number.parseInt(jsdomVersion.split('.')[0] ?? '', 10);
if (!Number.isFinite(jsdomMajor) || jsdomMajor > MAX_SAFE_JSDOM_MAJOR) {
  fail(
    `isomorphic-dompurify resolves to jsdom@${jsdomVersion}, but only major <= ${MAX_SAFE_JSDOM_MAJOR}\n` +
      `is free of ${BANNED}. The override says "${override}" — the lockfile disagrees with it,\n` +
      'so re-run `pnpm install` or fix the override.',
  );
}

// ── 3. The banned package must be absent from the sanitizer's PRODUCTION graph ─
//
// NB: we walk the DECLARED `dependencies` closure, resolving each dep from its
// own parent's directory (which, under pnpm's isolated store, yields exactly the
// version that parent gets). We deliberately do NOT use a bare
// require.resolve(BANNED) from jsdom: Node's resolution walks UP the directory
// tree into pnpm's flat `.pnpm` store, where `@exodus/bytes` legitimately exists
// for jsdom@28 pulled in by `vitest-axe` (a DEV dependency). That produced a
// false positive — on-disk presence is not the same as being in the prod graph.
function findBannedInDependencyClosure(rootDir: string): string[] | null {
  const seen = new Set<string>();
  // queue holds [packageDir, pathOfNamesToHere]
  const queue: Array<[string, string[]]> = [[rootDir, []]];

  while (queue.length > 0) {
    const [dir, trail] = queue.shift()!;
    let pkg: { name?: string; version?: string; dependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const name = pkg.name ?? '(unknown)';
    const key = `${name}@${pkg.version ?? '?'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 2000) break; // safety valve

    const here = [...trail, key];
    if (name === BANNED) return here;

    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      const depDir = resolvePackageDir(path.join(dir, 'package.json'), dep);
      if (depDir) queue.push([depDir, here]);
    }
  }
  return null;
}

for (const [label, fromDir] of [
  ['jsdom', jsdomDir],
  ['isomorphic-dompurify', idpDir],
] as const) {
  const trail = findBannedInDependencyClosure(fromDir);
  if (trail) {
    fail(
      `${BANNED} is in the PRODUCTION dependency closure of ${label}.\n` +
        `  ${trail.join('\n    → ')}\n\n` +
        'It is ESM-only and is require()d at runtime by the externalized sanitizer packages,\n' +
        'which 500s every HTML-sanitizing route on Vercel Node 24.\n' +
        'NOTE: pinning html-encoding-sniffer alone does NOT fix this — three separate edges\n' +
        'reach @exodus/bytes. The package must be absent from the graph entirely.',
    );
  }
}

console.log(
  `PASS: sanitizer dependency graph is clean — isomorphic-dompurify → jsdom@${jsdomVersion} ` +
    `(override "${override}"), no ${BANNED} reachable.`,
);

#!/usr/bin/env tsx
/**
 * CI guard: verify every feature-registry href either routes through
 * lib/operations/routes.ts (for operations-family entries) or resolves
 * to a real authenticated page route on disk (for everything else).
 *
 * Fails the lint pipeline on drift. Hand-written registry entries that
 * branch on `cid` are rejected — the guard asserts deterministic output
 * at cid=1 and cid=999.
 *
 * Called from pnpm lint via `guard:operations-routes`.
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

export type ViolationCode = 'OPS001' | 'OPS002' | 'OPS003';
export interface Violation {
  entryId: string;
  code: ViolationCode;
  message: string;
}

type RegistryEntry = {
  id: string;
  href: string | ((cid: number) => string);
};

const OPERATIONS_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/maintenance\//,
  /^\/work-orders(\?|$)/,
  /^\/amenities(\?|$)/,
  /^\/communities\/\d+\/operations/,
];

/**
 * Non-operations paths that are allowlisted without requiring a matching
 * page.tsx on disk. These are either:
 *   (a) shared/static routes outside (authenticated) that the manifest walker
 *       doesn't scan (e.g. /auth/login), or
 *   (b) feature-gated pages that are planned but not yet implemented —
 *       flagged here so they're checked when the page ships.
 *
 * Keeping this list explicit documents which entries need a page.tsx before
 * launch and prevents silent drift.
 */
const NON_OPS_ALLOWLIST = new Set<string>([
  // Core nav shortcuts
  '/settings',
  '/settings/export',
  '/help',
  '/help/contact',
  '/auth/login',
  '/dashboard',

  // Fully implemented pages that the walker reaches via /dashboard/* sub-paths
  '/dashboard/packages',
  '/dashboard/visitors',
  '/dashboard/leases',
  '/dashboard/move-in-out',
  '/dashboard/residents',

  // Implemented: top-level pages that the walker reaches
  '/audit-trail',
  '/violations',
  '/violations/inbox',
  '/violations/report',
  '/esign',
  '/esign/templates/new',
  '/esign/submissions/new',
  '/contracts',

  // Action shortcut pages (exist on disk but map through alternate paths)
  '/announcements',
  '/emergency/new',
  '/polls/new',

  // Feature-gated pages planned but not yet implemented — allowlisted to
  // prevent false positives until the page ships; remove when page.tsx lands.
  '/community-board',
  '/calendar',
  '/polls',
  '/arc',
  '/settings/community',
  '/settings/roles',
]);

/**
 * Non-operations community-scoped paths allowlisted by normalized form
 * (with /communities/[id]/ rather than a concrete integer).
 * These are pages that HAVE page.tsx files but whose normalized path the
 * manifest walker may not produce identically (e.g. extra query params, or
 * paths that exist but test coverage needs).
 */
const NON_OPS_COMMUNITY_ALLOWLIST = new Set<string>([
  // Feature-gated community pages not yet implemented
  '/communities/[id]/voting',
  '/communities/[id]/public-notices',
]);

function isOperationsFamily(href: string): boolean {
  const noQuery = href.split('?')[0]!;
  return OPERATIONS_ROUTE_PATTERNS.some((p) => p.test(noQuery)) ||
    /\/communities\/\d+\/operations/.test(href);
}

function normalizeForManifest(href: string): string {
  // Strip query string; replace dynamic community id segment.
  // `String.split` always yields at least one element, so the head is present.
  const [path] = href.split('?');
  return path!.replace(/\/communities\/\d+\//, '/communities/[id]/');
}

function buildPageManifest(): Set<string> {
  const pagesRoot = join(repoRoot, 'apps', 'web', 'src', 'app', '(authenticated)');
  const manifest = new Set<string>();

  function walk(dir: string, logicalPrefix = '') {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // Strip route groups like (authenticated) from logical path.
        let seg: string;
        if (entry.startsWith('(') && entry.endsWith(')')) {
          seg = '';
        } else {
          seg = `/${entry}`;
        }
        walk(full, logicalPrefix + seg);
      } else if (entry === 'page.tsx' || entry === 'page.ts') {
        manifest.add(logicalPrefix || '/');
      }
    }
  }

  walk(pagesRoot);
  return manifest;
}

function evalHref(entry: RegistryEntry, cid: number): string {
  return typeof entry.href === 'function' ? entry.href(cid) : entry.href;
}

export function verifyRoutes(
  registry: readonly RegistryEntry[],
  manifest?: Set<string>,
): Violation[] {
  const pageManifest = manifest ?? buildPageManifest();
  const violations: Violation[] = [];

  for (const entry of registry) {
    let href1: string;
    let href999: string;
    try {
      href1 = evalHref(entry, 1);
      href999 = evalHref(entry, 999);
    } catch (err) {
      violations.push({
        entryId: entry.id,
        code: 'OPS003',
        message: `href evaluation threw: ${(err as Error).message}`,
      });
      continue;
    }

    // Rule 4: deterministic shape — cid=1 vs cid=999 must differ only in the cid substitution.
    const norm1 = href1.replace(/\b1\b/g, '__CID__').replace(/=1\b/g, '=__CID__');
    const norm999 = href999.replace(/\b999\b/g, '__CID__').replace(/=999\b/g, '=__CID__');
    if (norm1 !== norm999) {
      violations.push({
        entryId: entry.id,
        code: 'OPS003',
        message: `href differs for cid=1 vs cid=999 beyond the id substitution — deterministic paths required`,
      });
      continue;
    }

    if (isOperationsFamily(href1)) {
      // Rule 2: must contain communityId= or /communities/<n>/
      if (!href1.includes('communityId=') && !/\/communities\/\d+\//.test(href1)) {
        violations.push({
          entryId: entry.id,
          code: 'OPS001',
          message: `operations-family href lacks communityId or /communities/[id]/ segment: ${href1}`,
        });
      }
      continue;
    }

    // Rule 3: non-ops must resolve to manifest, allowlist, or community allowlist.
    const path = href1.split('?')[0]!;
    if (NON_OPS_ALLOWLIST.has(path)) continue;

    const normalized = normalizeForManifest(href1);
    const normalizedPath = normalized.split('?')[0]!;

    if (NON_OPS_COMMUNITY_ALLOWLIST.has(normalizedPath)) continue;

    if (pageManifest.has(normalizedPath)) continue;

    violations.push({
      entryId: entry.id,
      code: 'OPS002',
      message: `href does not resolve to an authenticated page or allowlisted path: ${href1}`,
    });
  }

  return violations;
}

async function main() {
  // Dynamic import so the script can be imported as a library (for tests) without side effects.
  const mod = await import('../apps/web/src/lib/constants/feature-registry');
  // The `?? mod.default` link that used to sit in this chain was already dead:
  // feature-registry has no default export, so it evaluated to `undefined` and
  // `a ?? undefined ?? []` is exactly `a ?? []`. Dropping it is behaviour-
  // identical and lets the module's real shape be type-checked. The empty-array
  // fallback is kept — the emptiness check below is the guard's actual defence
  // against the registry export going missing.
  const registry = (mod.FEATURE_REGISTRY ?? []) as RegistryEntry[];

  if (!Array.isArray(registry) || registry.length === 0) {
    console.error('Operations route guard: FEATURE_REGISTRY is empty or missing');
    process.exit(1);
  }

  const violations = verifyRoutes(registry);
  if (violations.length > 0) {
    console.error(`Operations route guard failed (${violations.length} violation${violations.length === 1 ? '' : 's'}):`);
    for (const v of violations) {
      console.error(`  [${v.code}] ${v.entryId}: ${v.message}`);
    }
    process.exit(1);
  }
  console.log(`Operations route guard: 0 violations across ${registry.length} registry entries.`);
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

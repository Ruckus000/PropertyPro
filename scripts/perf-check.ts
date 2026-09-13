#!/usr/bin/env tsx
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type AppBuildManifest = {
  pages?: Record<string, string[]>;
};

/**
 * Budget baselines — derived from Phase 2 production build (2026-02-21):
 *
 * Phase 2 representative routes measured 120-180 KiB JS each.
 * TARGET is ~110% of the Phase 2 upper bound to catch regressions early.
 * HARD allows feature growth while still catching catastrophic bloat.
 * AGGREGATE HARD is ~2x the single-route hard budget (shared chunks overlap).
 *
 * NOTE: These budgets cover JavaScript bundles only (static/chunks/*.js).
 * CSS and font payloads are not measured.
 */
const TARGET_ROUTE_BUDGET_BYTES = 200 * 1024;
// Ratcheted from 900 KiB after the framer-motion removal + mobile mockup
// code-split (nav-perf PR 4), when the worst measured route was the mobile home.
//
// That is no longer true and the ceiling is no longer "measured + ~10%".
// Re-measured 2026-09-13 on a clean production build: mobile home is 411.1 KiB
// and the worst BUDGETED route is site-editor at 663.1 KiB, with the PM
// portfolio next at 679.1 KiB — only ~21 KiB of headroom, and the one route
// still carrying `@tanstack/react-table`.
//
// Two routes remain OVER this ceiling without failing, because they are in no
// group: `/auth/accept-invite` (720.2) and `/auth/reset-password` (701.4).
// `reportUnbudgetedRoutes` below surfaces them; enforcing them is a separate
// decision. Do not ratchet this down until they are dealt with.
const HARD_ROUTE_BUDGET_BYTES = Number(process.env.PERF_BUDGET_HARD_BYTES ?? 700 * 1024);
const HARD_TOTAL_BUDGET_BYTES = Number(process.env.PERF_BUDGET_TOTAL_HARD_BYTES ?? 1300 * 1024);

interface AppSpec {
  app: string;
  nextRoot: string;
  groups: Record<string, readonly string[]>;
  /** Enforce an aggregate unique-JS ceiling across the app's selected routes. */
  aggregateBudgetBytes: number | null;
}

const APPS: readonly AppSpec[] = [
  {
    app: 'web',
    nextRoot: join(process.cwd(), 'apps', 'web', '.next'),
    groups: {
      // The PM portfolio. Measured 2026-09-13: neither of the two forms this
      // group used to list exists in the manifest — the route lives under
      // `(authenticated)`, so `resolveRoute` fell through to the THIRD entry,
      // `/(authenticated)/dashboard/page`, and this group silently reported the
      // resident dashboard while the PM route was enforced by nothing. That
      // unrelated fallback is deleted rather than kept: a fallback to a
      // different screen is worse than no measurement, because it looks like one.
      pm: [
        '/(authenticated)/pm/dashboard/communities/page',
        '/(pm)/dashboard/communities/page',
        '/pm/dashboard/communities/page',
      ],
      maintenance: [
        '/(authenticated)/maintenance/inbox/page',
        '/(authenticated)/maintenance/submit/page',
        '/(authenticated)/dashboard/apartment/page',
        '/(authenticated)/dashboard/page',
      ],
      mobile: [
        '/mobile/page',
        '/(mobile)/page',
        '/(authenticated)/dashboard/page',
      ],
      // PR #1b: public site render path (server component, layout-registry
      // dispatch via Tidewater for condo_718). Budgets the JS payload — this
      // is a Florida statutory-transparency entry point so the slug-subdomain
      // page must stay light.
      site: [
        '/(public)/[subdomain]/page',
        '/public-site/page',
      ],
      // The apex marketing page. Unbudgeted until 2026-08 despite being the
      // highest-traffic route in the product — it is mostly static, so the
      // ceiling exists to catch scripts accreting onto it over time rather
      // than to police what is there now. NOTE this measures JS only (see the
      // header): the page's largest payload is photography, which no budget
      // here covers.
      marketing: [
        '/(marketing)/page',
      ],
      // Website editor v3 (docs/redesign/website-page/). Budgeted from Phase 0,
      // before the canvas exists, so bundle growth shows up as it lands rather
      // than as a single 700 KiB surprise at Phase 2b. The canvas pulls in the
      // public-site block views, so this is the route most at risk in the
      // program — block views are dynamically imported through the registry to
      // keep only the rendered types in the initial payload.
      'site-editor': [
        '/(site-editor)/pm/website-editor/page',
        '/pm/website-editor/page',
      ],
    },
    aggregateBudgetBytes: HARD_TOTAL_BUDGET_BYTES,
  },
  {
    app: 'admin',
    nextRoot: join(process.cwd(), 'apps', 'admin', '.next'),
    // Each group lists the `(console)` route-group form FIRST and the bare form
    // as a fallback, the same shape the web spec above uses. Admin's pages moved
    // into `app/(console)/` when the shell layout landed; a route group does not
    // change the URL but it DOES change the manifest key, so the bare paths alone
    // matched nothing and the check failed with "could not resolve any
    // representative routes" — which is the honest failure, but only because
    // `perf-check` refuses to pass on an empty match. Keep both forms so moving a
    // page in or out of the group degrades to a fallback instead of a hard failure.
    groups: {
      dashboard: ['/(console)/dashboard/page', '/dashboard/page'],
      communities: [
        '/(console)/clients/page',
        '/(console)/communities/page',
        '/clients/page',
        '/communities/page',
      ],
      'deletion-requests': ['/(console)/deletion-requests/page', '/deletion-requests/page'],
    },
    // Admin is server-first; per-route budgets are the signal we need today.
    aggregateBudgetBytes: null,
  },
];

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function readManifest(nextRoot: string): AppBuildManifest {
  const manifestPath = join(nextRoot, 'app-build-manifest.json');
  const raw = readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw) as AppBuildManifest;
}

function resolveRoute(pages: Record<string, string[]>, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (candidate in pages) {
      return candidate;
    }
  }
  return null;
}

function routeJsFiles(chunks: readonly string[]): string[] {
  return chunks.filter((chunk) => chunk.endsWith('.js') && chunk.startsWith('static/chunks/'));
}

function fileSizeOrZero(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

function bytesForRoute(nextRoot: string, chunks: readonly string[]): { totalBytes: number; files: string[] } {
  const files = routeJsFiles(chunks);
  const totalBytes = files.reduce((sum, file) => sum + fileSizeOrZero(join(nextRoot, file)), 0);
  return { totalBytes, files };
}

/**
 * Report-only sweep over every page route, not just the budgeted groups.
 *
 * `groups` is six hand-picked web routes and three admin ones, so a route
 * outside them can sit over the hard budget indefinitely without failing
 * anything. When this pass was added, seven unbudgeted web pages already did —
 * the largest `/(authenticated)/communities/[id]/documents` at 757.5 KiB. Two
 * remain as of 2026-09-13 (`/auth/accept-invite`, `/auth/reset-password`);
 * documents is now 634.8 KiB. This pass exists so they stop being invisible.
 *
 * This appends to `warnings` and never to `failures`, without exception. Turning
 * pre-existing breaches red is a separate decision from being able to see them,
 * and making it here would fail every push until seven unrelated routes were
 * fixed.
 *
 * It deliberately carries no "examined nothing, so refuse to pass" branch of its
 * own. `checkApp` already returns before calling this when no group resolved,
 * and every resolved key ends in `/page` — so a sweep that reaches this function
 * always has at least one page to look at. An earlier version failed on an empty
 * candidate list; that could only mean "every page is budgeted", which is benign,
 * and the branch meant to catch a broken scan was unreachable. A guard that
 * cannot fire is worse than none: it reads as coverage that is not there.
 *
 * Only `/page` keys are counted. A `/layout` entry in the manifest is the
 * layout's own RSC entrypoint, not additional first-load payload — its chunks
 * are already accounted for in the pages beneath it. Summing it looks alarming
 * and means nothing: `/(authenticated)/layout` reads as 924.8 KiB while Next's
 * own First Load JS for the dashboard under it is 196 kB.
 */
function reportUnbudgetedRoutes(
  spec: AppSpec,
  pages: Record<string, string[]>,
  warnings: string[],
): void {
  // Every DECLARED candidate, not just the resolved one. A group lists fallbacks
  // (see `groups` above), and a fallback that did not win is still a route the
  // spec knows about — reporting it as "unbudgeted" would be a false positive.
  const budgeted = new Set(Object.values(spec.groups).flat());
  const pageKeys = Object.keys(pages).filter((key) => key.endsWith('/page'));
  const candidates = pageKeys.filter((key) => !budgeted.has(key));

  const over = candidates
    .map((key) => ({ key, totalBytes: bytesForRoute(spec.nextRoot, pages[key] ?? []).totalBytes }))
    .filter((route) => route.totalBytes > HARD_ROUTE_BUDGET_BYTES)
    .sort((a, b) => b.totalBytes - a.totalBytes);

  console.log(
    `[${spec.app}] unbudgeted page routes scanned: ${candidates.length}; over hard budget: ${over.length}`,
  );

  for (const route of over) {
    warnings.push(
      `${spec.app} UNBUDGETED route ${route.key} exceeds the hard budget ` +
        `(${formatKiB(route.totalBytes)} > ${formatKiB(HARD_ROUTE_BUDGET_BYTES)}) — reported, not enforced`,
    );
  }
}

function checkApp(spec: AppSpec, warnings: string[], failures: string[]): boolean {
  if (!existsSync(join(spec.nextRoot, 'app-build-manifest.json'))) {
    // Local partial builds (e.g. web-only) should stay usable; CI's
    // `pnpm build` builds every app, so nothing is skipped there.
    console.log(`[${spec.app}] SKIPPED — no build manifest at ${spec.nextRoot} (run \`pnpm build\`)`);
    return false;
  }

  const pages = readManifest(spec.nextRoot).pages ?? {};
  const selected = new Map<string, string>();
  for (const [group, candidates] of Object.entries(spec.groups)) {
    const resolved = resolveRoute(pages, candidates);
    if (resolved) {
      selected.set(group, resolved);
      // Falling through to a fallback is not an error — the lists exist so a page
      // moving in or out of a route group degrades instead of hard-failing — but
      // it must not be SILENT. The `pm` group fell through to an unrelated screen
      // and reported its size as the PM portfolio's for as long as anyone can
      // tell; nothing in the output said so.
      if (resolved !== candidates[0]) {
        warnings.push(
          `${spec.app}: group "${group}" fell back to ${resolved} — its first candidate ` +
            `${candidates[0]} is not in the manifest. Confirm this is still the right route.`,
        );
      }
    } else {
      warnings.push(`${spec.app}: no manifest route matched group "${group}" (${candidates.join(', ')})`);
    }
  }

  if (selected.size === 0) {
    failures.push(`${spec.app}: could not resolve any representative routes from app-build-manifest.`);
    return false;
  }

  const uniqueFiles = new Set<string>();

  for (const [group, routeKey] of selected) {
    const chunks = pages[routeKey] ?? [];
    const { totalBytes, files } = bytesForRoute(spec.nextRoot, chunks);
    files.forEach((file) => uniqueFiles.add(file));

    console.log(`[${spec.app}:${group}] ${routeKey} -> ${formatKiB(totalBytes)}`);

    if (totalBytes > HARD_ROUTE_BUDGET_BYTES) {
      failures.push(
        `${spec.app} ${group} route ${routeKey} exceeds hard budget (${formatKiB(totalBytes)} > ${formatKiB(HARD_ROUTE_BUDGET_BYTES)})`,
      );
    } else if (totalBytes > TARGET_ROUTE_BUDGET_BYTES) {
      warnings.push(
        `${spec.app} ${group} route ${routeKey} is above target (${formatKiB(totalBytes)} > ${formatKiB(TARGET_ROUTE_BUDGET_BYTES)})`,
      );
    }
  }

  reportUnbudgetedRoutes(spec, pages, warnings);

  if (spec.aggregateBudgetBytes !== null) {
    const totalUniqueBytes = [...uniqueFiles].reduce(
      (sum, file) => sum + fileSizeOrZero(join(spec.nextRoot, file)),
      0,
    );
    console.log(`[${spec.app}] aggregate unique JS across selected routes: ${formatKiB(totalUniqueBytes)}`);

    if (totalUniqueBytes > spec.aggregateBudgetBytes) {
      failures.push(
        `${spec.app} aggregate unique JS exceeds hard budget (${formatKiB(totalUniqueBytes)} > ${formatKiB(spec.aggregateBudgetBytes)})`,
      );
    }
  }

  return true;
}

function main(): void {
  const warnings: string[] = [];
  const failures: string[] = [];

  console.log('Performance budget check (JavaScript route payloads)');
  console.log(`- Target per-route budget: ${formatKiB(TARGET_ROUTE_BUDGET_BYTES)}`);
  console.log(`- Hard per-route budget: ${formatKiB(HARD_ROUTE_BUDGET_BYTES)}`);
  console.log(`- Hard aggregate budget (web): ${formatKiB(HARD_TOTAL_BUDGET_BYTES)}`);
  console.log('');

  let anyChecked = false;
  for (const spec of APPS) {
    anyChecked = checkApp(spec, warnings, failures) || anyChecked;
  }

  if (!anyChecked) {
    throw new Error('No app build manifests found. Run `pnpm build` first.');
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nPerformance budget check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nPerformance budget check passed.');
}

main();

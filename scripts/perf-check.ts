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
 * AGGREGATE HARD sits close to the per-route ceiling, not a multiple of it: every
 * route's first load includes the same root and shell chunks, counted once here.
 *
 * NOTE: These budgets cover JavaScript bundles only (static/chunks/*.js).
 * CSS and font payloads are not measured.
 */
const TARGET_ROUTE_BUDGET_BYTES = 200 * 1024;
// Re-based 2026-09-13 from 700 KiB, because the NUMBER changed, not the payload.
// Until then a route was measured as its manifest `/page` key alone, which omits
// every ancestor layout/loading/error chunk the browser loads with it (see
// `firstLoadChunks`). The 700 ceiling was calibrated against that under-reading:
// on the same build, the PM portfolio read 680.7 KiB and actually loads 1190.6.
//
// Measured 2026-09-13 on a clean production build (web:build a cache miss), after
// the root error boundary stopped statically importing the Supabase client:
// worst BUDGETED route is the PM portfolio at 1189.1 KiB, so 1220 is ~31 KiB of
// headroom — the ratchet margin this file already uses. Everything under the
// `(authenticated)` shell sits at 1000-1200 KiB, because the shell itself (root
// + `(authenticated)` layout, loading and error chunks) is 1017.2 KiB before any
// page adds a byte; that is the lever for a future ratchet, not any one page.
//
// The aggregate is re-based the same way: 1453.4 KiB measured, 1490 ceiling.
const HARD_ROUTE_BUDGET_BYTES = Number(process.env.PERF_BUDGET_HARD_BYTES ?? 1220 * 1024);
const HARD_TOTAL_BUDGET_BYTES = Number(process.env.PERF_BUDGET_TOTAL_HARD_BYTES ?? 1490 * 1024);

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

/**
 * The route-segment files whose client chunks the browser loads alongside a page.
 *
 * A manifest `/page` entry lists only the page's OWN chunks. Every ancestor
 * segment's layout, loading, error and not-found boundary ships in the same
 * initial payload (Next's `create-component-tree` puts each into the seed data),
 * and each has its own manifest key with chunks the page entry does not repeat —
 * `/(authenticated)/dashboard/page` listed 12 of its layout's 24. Summing the page
 * key alone under-read that route by ~450 KiB.
 *
 * Probed 2026-09-13 against `next start`, comparing `performance` resource entries
 * with this union: `/auth/login` and `/` each differed by one sub-1.4 KiB file
 * (a root `not-found` stub one loads and the other does not; a font-only
 * `(marketing)/layout` stub). `loading` is from Next's source, not a probe —
 * every route under one needs authentication.
 */
const SEGMENT_FILES = ['layout', 'loading', 'error', 'not-found', 'global-error'] as const;

/** A page's own chunks plus every ancestor segment file's, each file once. */
function firstLoadChunks(pages: Record<string, string[]>, pageKey: string): string[] {
  const segments = pageKey.slice(0, -'/page'.length).split('/');
  const chunks = new Set(pages[pageKey] ?? []);
  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('/');
    for (const file of SEGMENT_FILES) {
      for (const chunk of pages[`${prefix}/${file}`] ?? []) chunks.add(chunk);
    }
  }
  return [...chunks];
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
 * anything. This pass exists so they stop being invisible.
 *
 * This appends to `warnings` and never to `failures`. Enforcement is a ratchet
 * you install after making room, not to force the room to be made: flipping it
 * with no margin fails first on work unrelated to performance, and the
 * predictable response — raising the ceiling — leaves the guard weaker than
 * report-only.
 *
 * Promote it when the largest unbudgeted route clears the ceiling by ~30 KiB,
 * the ratchet margin used above. Measured 2026-09-13 on the first-load measure
 * it does not: `/(authenticated)/settings/page` is 1201.1 KiB against 1220, an
 * 18.9 KiB margin, with `pm/onboarding/website` (1175.3) next. Every one of them
 * carries the 1017.2 KiB `(authenticated)` shell, so the room comes from the
 * shell, not from any one page.
 *
 * (An earlier version of this docblock, dated 2026-09-14, named
 * `settings/account` at 693.8 KiB and its 176.4 KiB Supabase chunk as the thing
 * to drain. Both came from the page-only measure: that chunk is also loaded by
 * the `(authenticated)` layout for every signed-in route, so removing it from the
 * page would have moved the number and saved no bytes. Where it WAS avoidable —
 * the root error boundary, loaded on every route — it is gone.)
 *
 * It deliberately carries no "examined nothing, so refuse to pass" branch of its
 * own. `checkApp` already returns before calling this when no group resolved,
 * and every resolved key ends in `/page` — so a sweep that reaches this function
 * always has at least one page to look at. An earlier version failed on an empty
 * candidate list; that could only mean "every page is budgeted", which is benign,
 * and the branch meant to catch a broken scan was unreachable. A guard that
 * cannot fire is worse than none: it reads as coverage that is not there.
 *
 * Only `/page` keys are candidates: a layout is not a route. Its chunks are NOT
 * already in the pages beneath it, though — an earlier version of this docblock
 * said so, checked against Next's First Load JS column, which omits layouts too.
 * `firstLoadChunks` adds them to each page instead.
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

  const measured = candidates
    .map((key) => ({ key, totalBytes: bytesForRoute(spec.nextRoot, firstLoadChunks(pages, key)).totalBytes }))
    .sort((a, b) => b.totalBytes - a.totalBytes);
  const over = measured.filter((route) => route.totalBytes > HARD_ROUTE_BUDGET_BYTES);

  console.log(
    `[${spec.app}] unbudgeted page routes scanned: ${candidates.length}; over hard budget: ${over.length}`,
  );

  // `over: 0` on its own reads as "all clear", and on 2026-09-14 it meant a
  // route with 6.2 KiB of headroom. Naming the largest one costs a line and is
  // the difference between a clean scan and a scan that found nothing to say.
  const largest = measured[0];
  if (largest) {
    const headroom = HARD_ROUTE_BUDGET_BYTES - largest.totalBytes;
    console.log(
      `[${spec.app}] largest unbudgeted route: ${largest.key} at ${formatKiB(largest.totalBytes)} ` +
        `(${headroom >= 0 ? `${formatKiB(headroom)} below` : `${formatKiB(-headroom)} OVER`} the hard budget)`,
    );
  }

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
    const { totalBytes, files } = bytesForRoute(spec.nextRoot, firstLoadChunks(pages, routeKey));
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

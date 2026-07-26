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
// code-split (nav-perf PR 4): worst measured route is the mobile home;
// this ceiling is measured + ~10% headroom.
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
      pm: [
        '/(pm)/dashboard/communities/page',
        '/pm/dashboard/communities/page',
        '/(authenticated)/dashboard/page',
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
    groups: {
      dashboard: ['/dashboard/page'],
      communities: ['/communities/page', '/clients/page'],
      'deletion-requests': ['/deletion-requests/page'],
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

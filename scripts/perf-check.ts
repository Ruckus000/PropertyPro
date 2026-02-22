#!/usr/bin/env tsx
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type AppBuildManifest = {
  pages?: Record<string, string[]>;
};

type RouteGroup = 'pm' | 'maintenance' | 'mobile';

const APP_BUILD_MANIFEST = join(process.cwd(), 'apps', 'web', '.next', 'app-build-manifest.json');
const NEXT_OUTPUT_ROOT = join(process.cwd(), 'apps', 'web', '.next');

/**
 * Budget baselines — derived from Phase 2 production build (2026-02-21):
 *
 * Phase 2 representative routes measured 120-180 KiB JS each.
 * TARGET is ~110% of the Phase 2 upper bound to catch regressions early.
 * HARD is set at ~4x Phase 2 average to allow Phase 3 feature growth
 * (PM dashboard, mobile shell) while still catching catastrophic bloat.
 * AGGREGATE HARD is ~2x the single-route hard budget (shared chunks overlap).
 *
 * NOTE: These budgets cover JavaScript bundles only (static/chunks/*.js).
 * CSS and font payloads are not measured. Recalibrate after Phase 3 routes ship.
 */
const TARGET_ROUTE_BUDGET_BYTES = 200 * 1024;
const HARD_ROUTE_BUDGET_BYTES = Number(process.env.PERF_BUDGET_HARD_BYTES ?? 700 * 1024);
const HARD_TOTAL_BUDGET_BYTES = Number(process.env.PERF_BUDGET_TOTAL_HARD_BYTES ?? 1300 * 1024);

const ROUTE_GROUP_CANDIDATES: Record<RouteGroup, readonly string[]> = {
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
};

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function readManifest(): AppBuildManifest {
  if (!existsSync(APP_BUILD_MANIFEST)) {
    throw new Error(
      `Missing Next.js app build manifest at ${APP_BUILD_MANIFEST}. Run \`pnpm build\` first.`,
    );
  }

  const raw = readFileSync(APP_BUILD_MANIFEST, 'utf8');
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

function bytesForRoute(chunks: readonly string[]): { totalBytes: number; files: string[] } {
  const files = routeJsFiles(chunks);
  const totalBytes = files.reduce((sum, file) => sum + fileSizeOrZero(join(NEXT_OUTPUT_ROOT, file)), 0);
  return { totalBytes, files };
}

function main(): void {
  const manifest = readManifest();
  const pages = manifest.pages ?? {};
  const warnings: string[] = [];
  const failures: string[] = [];

  const selectedByGroup = new Map<RouteGroup, string>();
  for (const group of Object.keys(ROUTE_GROUP_CANDIDATES) as RouteGroup[]) {
    const resolved = resolveRoute(pages, ROUTE_GROUP_CANDIDATES[group]);
    if (resolved) {
      selectedByGroup.set(group, resolved);
    }
  }

  if (selectedByGroup.size === 0) {
    throw new Error('Could not resolve any representative routes from app-build-manifest.');
  }

  const uniqueFiles = new Set<string>();

  console.log('Performance budget check (JavaScript route payloads)');
  console.log(`- Target per-route budget: ${formatKiB(TARGET_ROUTE_BUDGET_BYTES)}`);
  console.log(`- Hard per-route budget: ${formatKiB(HARD_ROUTE_BUDGET_BYTES)}`);
  console.log(`- Hard aggregate budget: ${formatKiB(HARD_TOTAL_BUDGET_BYTES)}`);
  console.log('');

  for (const [group, routeKey] of selectedByGroup) {
    const chunks = pages[routeKey] ?? [];
    const { totalBytes, files } = bytesForRoute(chunks);
    files.forEach((file) => uniqueFiles.add(file));

    console.log(`[${group}] ${routeKey} -> ${formatKiB(totalBytes)}`);

    if (totalBytes > HARD_ROUTE_BUDGET_BYTES) {
      failures.push(
        `${group} route ${routeKey} exceeds hard budget (${formatKiB(totalBytes)} > ${formatKiB(HARD_ROUTE_BUDGET_BYTES)})`,
      );
    } else if (totalBytes > TARGET_ROUTE_BUDGET_BYTES) {
      warnings.push(
        `${group} route ${routeKey} is above target (${formatKiB(totalBytes)} > ${formatKiB(TARGET_ROUTE_BUDGET_BYTES)})`,
      );
    }
  }

  const totalUniqueBytes = [...uniqueFiles].reduce(
    (sum, file) => sum + fileSizeOrZero(join(NEXT_OUTPUT_ROOT, file)),
    0,
  );
  console.log(`\nAggregate unique JS across selected routes: ${formatKiB(totalUniqueBytes)}`);

  if (totalUniqueBytes > HARD_TOTAL_BUDGET_BYTES) {
    failures.push(
      `aggregate unique JS exceeds hard budget (${formatKiB(totalUniqueBytes)} > ${formatKiB(HARD_TOTAL_BUDGET_BYTES)})`,
    );
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

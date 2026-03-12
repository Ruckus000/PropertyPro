#!/usr/bin/env tsx
/**
 * Phase 5 Security Gate Verifier (WS72)
 *
 * Enforces the final hardening invariants for WS66-WS71 surfaces:
 * 1) Every Phase 5 route handler export is wrapped with withErrorHandler
 * 2) Phase 5 route inventory is complete and rate-limit classification is covered
 * 3) Gate inventories include all Phase 5 RBAC resources and DB tables
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRoute } from '../apps/web/src/lib/middleware/rate-limit-config';
import { RBAC_RESOURCES } from '../packages/shared/src/rbac-matrix';
import { RLS_TENANT_TABLE_NAMES } from '../packages/db/src/schema/rls-config';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

type ExpectedRateLimitCategory = 'read' | 'write';

interface Phase5RouteScope {
  dir: string;
  resources: readonly string[];
  tables: readonly string[];
}

interface Problem {
  severity: 'error' | 'warning';
  message: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const phase5ApiRoot = join(repoRoot, 'apps', 'web', 'src', 'app', 'api', 'v1');
const schemaIndexPath = join(repoRoot, 'packages', 'db', 'src', 'schema', 'index.ts');
const migrationsDir = join(repoRoot, 'packages', 'db', 'migrations');

const LEGACY_RBAC_RESOURCES = new Set([
  'documents',
  'meetings',
  'announcements',
  'residents',
  'settings',
  'audit',
  'compliance',
  'maintenance',
  'contracts',
]);

const PHASE5_RESOURCE_INVENTORY = [
  'finances',
  'violations',
  'arc_submissions',
  'polls',
  'work_orders',
  'amenities',
  'packages',
  'visitors',
  'calendar_sync',
  'accounting',
] as const;

const PHASE5_TABLE_INVENTORY = [
  'ledger_entries',
  'assessments',
  'assessment_line_items',
  'stripe_connected_accounts',
  'finance_stripe_webhook_events',
  'violations',
  'violation_fines',
  'arc_submissions',
  'polls',
  'poll_votes',
  'forum_threads',
  'forum_replies',
  'vendors',
  'work_orders',
  'amenities',
  'amenity_reservations',
  'calendar_sync_tokens',
  'accounting_connections',
  'package_log',
  'visitor_log',
] as const;

const PHASE5_TABLE_SCHEMA_EXPORTS: Record<(typeof PHASE5_TABLE_INVENTORY)[number], string> = {
  ledger_entries: 'ledger-entries',
  assessments: 'assessments',
  assessment_line_items: 'assessment-line-items',
  stripe_connected_accounts: 'stripe-connected-accounts',
  finance_stripe_webhook_events: 'finance-stripe-webhook-events',
  violations: 'violations',
  violation_fines: 'violation-fines',
  arc_submissions: 'arc-submissions',
  polls: 'polls',
  poll_votes: 'poll-votes',
  forum_threads: 'forum-threads',
  forum_replies: 'forum-replies',
  vendors: 'vendors',
  work_orders: 'work-orders',
  amenities: 'amenities',
  amenity_reservations: 'amenity-reservations',
  calendar_sync_tokens: 'calendar-sync-tokens',
  accounting_connections: 'accounting-connections',
  package_log: 'package-log',
  visitor_log: 'visitor-log',
};

const PHASE5_ROUTE_SCOPES: readonly Phase5RouteScope[] = [
  {
    dir: 'assessments',
    resources: ['finances'],
    tables: ['assessments', 'assessment_line_items', 'ledger_entries'],
  },
  {
    dir: 'delinquency',
    resources: ['finances'],
    tables: ['assessment_line_items', 'ledger_entries'],
  },
  {
    dir: 'payments',
    resources: ['finances'],
    tables: ['assessment_line_items', 'ledger_entries'],
  },
  {
    dir: 'ledger',
    resources: ['finances'],
    tables: ['ledger_entries', 'assessment_line_items'],
  },
  {
    dir: 'finance',
    resources: ['finances'],
    tables: ['ledger_entries', 'assessment_line_items'],
  },
  {
    dir: 'stripe',
    resources: ['finances'],
    tables: ['stripe_connected_accounts', 'finance_stripe_webhook_events'],
  },
  {
    dir: 'violations',
    resources: ['violations'],
    tables: ['violations', 'violation_fines', 'assessment_line_items', 'ledger_entries'],
  },
  {
    dir: 'arc',
    resources: ['arc_submissions'],
    tables: ['arc_submissions'],
  },
  {
    dir: 'polls',
    resources: ['polls'],
    tables: ['polls', 'poll_votes'],
  },
  {
    dir: 'forum',
    resources: ['polls'],
    tables: ['forum_threads', 'forum_replies'],
  },
  {
    dir: 'vendors',
    resources: ['work_orders'],
    tables: ['vendors'],
  },
  {
    dir: 'work-orders',
    resources: ['work_orders'],
    tables: ['work_orders', 'vendors'],
  },
  {
    dir: 'amenities',
    resources: ['amenities'],
    tables: ['amenities', 'amenity_reservations'],
  },
  {
    dir: 'reservations',
    resources: ['amenities'],
    tables: ['amenity_reservations'],
  },
  {
    dir: 'calendar',
    resources: ['calendar_sync'],
    tables: ['calendar_sync_tokens'],
  },
  {
    dir: 'accounting',
    resources: ['accounting'],
    tables: ['accounting_connections', 'ledger_entries'],
  },
  {
    dir: 'packages',
    resources: ['packages'],
    tables: ['package_log'],
  },
  {
    dir: 'visitors',
    resources: ['visitors'],
    tables: ['visitor_log'],
  },
] as const;

const HTTP_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

function collectRouteFiles(rootDir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry);
      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
      } catch {
        continue;
      }

      if (entry === 'route.ts') {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

function parseExportedMethods(content: string): HttpMethod[] {
  const methods = new Set<HttpMethod>();
  const methodRegex = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;

  for (const match of content.matchAll(methodRegex)) {
    const method = match[1];
    if (method && HTTP_METHODS.has(method as HttpMethod)) {
      methods.add(method as HttpMethod);
    }
  }

  return [...methods];
}

function expectedRateLimitCategory(method: HttpMethod): ExpectedRateLimitCategory {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return 'read';
  }
  return 'write';
}

function toRoutePath(filePath: string): string {
  const relativePath = relative(phase5ApiRoot, filePath).replaceAll('\\', '/');
  const parts = relativePath.split('/');
  parts.pop(); // route.ts
  return `/api/v1/${parts.join('/')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCreatedTablesFromPhase5Migrations(): Set<string> {
  const tables = new Set<string>();
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const match = file.match(/^(\d{4})_/);
    if (!match) {
      continue;
    }

    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 37 || number > 86) {
      continue;
    }

    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z0-9_]+)/gi;

    for (const createMatch of content.matchAll(createTableRegex)) {
      const tableName = createMatch[1];
      if (tableName) {
        tables.add(tableName);
      }
    }
  }

  return tables;
}

function checkWithErrorHandlerCoverage(
  filePath: string,
  methods: readonly HttpMethod[],
): Problem[] {
  const content = readFileSync(filePath, 'utf-8');
  const problems: Problem[] = [];

  if (!content.includes('withErrorHandler')) {
    problems.push({
      severity: 'error',
      message: `Missing withErrorHandler import/usage: ${relative(repoRoot, filePath)}`,
    });
    return problems;
  }

  for (const method of methods) {
    const methodWrapperPattern = new RegExp(
      `export\\s+const\\s+${method}\\s*=\\s*withErrorHandler\\s*\\(`,
      'm',
    );
    if (!methodWrapperPattern.test(content)) {
      problems.push({
        severity: 'error',
        message: `Route export ${method} is not wrapped with withErrorHandler: ${relative(repoRoot, filePath)}`,
      });
    }
  }

  return problems;
}

function compareSets(label: string, expected: Set<string>, actual: Set<string>): Problem[] {
  const problems: Problem[] = [];

  for (const value of expected) {
    if (!actual.has(value)) {
      problems.push({
        severity: 'error',
        message: `${label} missing expected entry: ${value}`,
      });
    }
  }

  for (const value of actual) {
    if (!expected.has(value)) {
      problems.push({
        severity: 'warning',
        message: `${label} has extra entry (review for drift): ${value}`,
      });
    }
  }

  return problems;
}

function main(): void {
  console.log('🔍 Phase 5 Security Gate Verifier (WS72)');
  console.log('='.repeat(72));

  const problems: Problem[] = [];

  const discoveredFiles = new Set<string>();
  const scopeResources = new Set<string>();
  const scopeTables = new Set<string>();
  let totalMethods = 0;

  for (const scope of PHASE5_ROUTE_SCOPES) {
    const absoluteDir = join(phase5ApiRoot, scope.dir);
    const routeFiles = collectRouteFiles(absoluteDir);

    if (routeFiles.length === 0) {
      problems.push({
        severity: 'error',
        message: `No route files discovered for scope directory: apps/web/src/app/api/v1/${scope.dir}`,
      });
      continue;
    }

    for (const resource of scope.resources) {
      scopeResources.add(resource);
    }
    for (const table of scope.tables) {
      scopeTables.add(table);
    }

    for (const filePath of routeFiles) {
      discoveredFiles.add(filePath);

      const content = readFileSync(filePath, 'utf-8');
      const methods = parseExportedMethods(content);
      if (methods.length === 0) {
        problems.push({
          severity: 'error',
          message: `No HTTP method exports found in ${relative(repoRoot, filePath)}`,
        });
        continue;
      }

      totalMethods += methods.length;

      const routePath = toRoutePath(filePath);
      for (const method of methods) {
        const expectedCategory = expectedRateLimitCategory(method);
        const actualCategory = classifyRoute(routePath, method);

        if (actualCategory !== expectedCategory) {
          problems.push({
            severity: 'error',
            message: `Rate-limit mismatch for ${method} ${routePath}: expected ${expectedCategory}, got ${actualCategory}`,
          });
        }

        if (!['read', 'write', 'public', 'auth', 'webhook'].includes(actualCategory)) {
          problems.push({
            severity: 'error',
            message: `Invalid rate-limit category for ${method} ${routePath}: ${String(actualCategory)}`,
          });
        }
      }

      problems.push(...checkWithErrorHandlerCoverage(filePath, methods));
    }
  }

  const phase5ResourcesFromSource = new Set(
    RBAC_RESOURCES.filter((resource) => !LEGACY_RBAC_RESOURCES.has(resource)),
  );
  const phase5ResourcesInventorySet = new Set(PHASE5_RESOURCE_INVENTORY);
  problems.push(
    ...compareSets('Phase 5 RBAC resource inventory', phase5ResourcesFromSource, phase5ResourcesInventorySet),
  );
  problems.push(
    ...compareSets('Phase 5 route-scope resource coverage', phase5ResourcesInventorySet, scopeResources),
  );

  const phase5TablesInventorySet = new Set<string>(PHASE5_TABLE_INVENTORY);
  const rlsTablesSet = new Set<string>(RLS_TENANT_TABLE_NAMES);
  for (const tableName of phase5TablesInventorySet) {
    if (!rlsTablesSet.has(tableName)) {
      problems.push({
        severity: 'error',
        message: `Phase 5 table missing from RLS tenant table config: ${tableName}`,
      });
    }
  }

  const migrationCreatedTables = parseCreatedTablesFromPhase5Migrations();
  problems.push(
    ...compareSets('Phase 5 table inventory vs migrations 0037-0086', migrationCreatedTables, phase5TablesInventorySet),
  );
  problems.push(
    ...compareSets('Phase 5 route-scope table coverage', phase5TablesInventorySet, scopeTables),
  );

  const schemaIndex = readFileSync(schemaIndexPath, 'utf-8');
  for (const [tableName, schemaExport] of Object.entries(PHASE5_TABLE_SCHEMA_EXPORTS)) {
    const exportPattern = new RegExp(`export \\* from '\\./${escapeRegExp(schemaExport)}';`);
    if (!exportPattern.test(schemaIndex)) {
      problems.push({
        severity: 'error',
        message: `Schema barrel missing export for ${tableName} (expected ./${schemaExport})`,
      });
    }
  }

  for (const tableName of PHASE5_TABLE_INVENTORY) {
    if (!Object.prototype.hasOwnProperty.call(PHASE5_TABLE_SCHEMA_EXPORTS, tableName)) {
      problems.push({
        severity: 'error',
        message: `Schema export mapping missing for Phase 5 table inventory entry: ${tableName}`,
      });
    }
  }

  const errorCount = problems.filter((problem) => problem.severity === 'error').length;
  const warningCount = problems.filter((problem) => problem.severity === 'warning').length;

  console.log(`Scanned route files: ${discoveredFiles.size}`);
  console.log(`Scanned route methods: ${totalMethods}`);
  console.log(`Resource inventory entries: ${PHASE5_RESOURCE_INVENTORY.length}`);
  console.log(`Table inventory entries: ${PHASE5_TABLE_INVENTORY.length}`);

  if (problems.length > 0) {
    console.log('\nFindings:');
    for (const problem of problems) {
      const icon = problem.severity === 'error' ? '❌' : '⚠️';
      console.log(`  ${icon} ${problem.message}`);
    }
  }

  console.log('\n' + '='.repeat(72));

  if (errorCount > 0) {
    console.log(`❌ ${errorCount} error(s), ${warningCount} warning(s)`);
    process.exit(1);
  }

  if (warningCount > 0) {
    console.log(`⚠️  0 errors, ${warningCount} warning(s)`);
  }

  console.log('✅ Phase 5 security gate verification passed.');
  process.exit(0);
}

main();

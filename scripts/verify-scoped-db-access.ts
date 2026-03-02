import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type RuleCode = 'DB001' | 'DB002' | 'DB003' | 'DB004' | 'DB005';
type GuardMode = 'scoped' | 'admin';

interface Violation {
  file: string;
  line: number;
  column: number;
  code: RuleCode;
  message: string;
}

interface AppGuardConfig {
  appDir: string;
  mode: GuardMode;
  unsafeAllowlist: Set<string>;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const migrationsRoot = join(repoRoot, 'packages', 'db', 'migrations');

const ALLOWED_DB_SUBPATHS = new Set<string>([
  '@propertypro/db/supabase/client',
  '@propertypro/db/supabase/server',
  '@propertypro/db/supabase/admin',
  '@propertypro/db/supabase/middleware',
  '@propertypro/db/filters',
  '@propertypro/db/unsafe',
]);

const WEB_UNSAFE_IMPORT_ALLOWLIST = new Set<string>([
  resolve(repoRoot, 'apps/web/src/lib/tenant/community-resolution.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/notification-digest-processor.ts'),
  resolve(repoRoot, 'apps/web/src/lib/auth/signup.ts'),
  // P2-34: Stripe integration — pre-tenant context, no communityId available
  resolve(repoRoot, 'apps/web/src/lib/services/stripe-service.ts'),
  resolve(repoRoot, 'apps/web/src/lib/actions/checkout.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/webhooks/stripe/route.ts'),
  // P2-34a: Payment reminders + subscription guard — cross-community cron + mutation guard
  resolve(repoRoot, 'apps/web/src/lib/services/payment-alert-scheduler.ts'),
  resolve(repoRoot, 'apps/web/src/lib/middleware/subscription-guard.ts'),
  resolve(repoRoot, 'apps/web/src/app/(authenticated)/billing/portal/route.ts'),
  // P3-PRE-03: PM portfolio cross-community read boundary
  resolve(repoRoot, 'apps/web/src/lib/api/pm-communities.ts'),
  // P3-PRE-03: PM role gate (isPmAdminInAnyCommunity) at route layer
  resolve(repoRoot, 'apps/web/src/app/api/v1/pm/communities/route.ts'),
  // P2-35: Provisioning pipeline — cross-tenant bootstrap, no communityId at start
  resolve(repoRoot, 'apps/web/src/lib/services/provisioning-service.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/internal/provision/route.ts'),
  // P3-47: White-label branding — communities is the root tenant table (no communityId column);
  // getBrandingForCommunity must query by primary key directly.
  resolve(repoRoot, 'apps/web/src/lib/api/branding.ts'),
  // P4-64: Community data export — residents export joins users table (no community_id column)
  resolve(repoRoot, 'apps/web/src/lib/services/community-export.ts'),
  // Community picker — cross-community user membership query for post-login routing
  resolve(repoRoot, 'apps/web/src/lib/api/user-communities.ts'),
]);

const APP_CONFIGS: AppGuardConfig[] = [
  {
    appDir: join(repoRoot, 'apps', 'web', 'src'),
    mode: 'scoped',
    unsafeAllowlist: WEB_UNSAFE_IMPORT_ALLOWLIST,
  },
  {
    appDir: join(repoRoot, 'apps', 'admin', 'src'),
    mode: 'admin',
    unsafeAllowlist: new Set<string>(),
  },
];

const NO_RLS_ALLOWLIST = new Set<string>([
  // Core tenant tables were created before migration-level RLS enforcement and are covered by later hardening migrations.
  'communities',
  'users',
  'user_roles',
  'units',
  'document_categories',
  'documents',
  'notification_preferences',
  'announcements',
  'compliance_audit_log',
  'compliance_checklist_items',
  'invitations',
  'meetings',
  'meeting_documents',
  'announcement_delivery_log',
  'demo_seed_registry',
  'leases',
  'notification_digest_queue',
  'pending_signups',
  'stripe_webhook_events',
  'provisioning_jobs',
  'maintenance_requests',
  'onboarding_wizard_state',
  'contracts',
  'contract_bids',
  'maintenance_comments',
]);

function listRuntimeSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeSourceFiles(absolute));
      continue;
    }

    if (entry.isFile() && (absolute.endsWith('.ts') || absolute.endsWith('.tsx'))) {
      files.push(absolute);
    }
  }

  return files;
}

function lineCol(sourceFile: ts.SourceFile, position: number): { line: number; column: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function validateSpecifier(
  specifier: string,
  file: string,
  config: AppGuardConfig,
  sourceFile: ts.SourceFile,
  position: number,
  violations: Violation[],
): void {
  const lc = lineCol(sourceFile, position);

  if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB001',
      message: `Direct drizzle import is forbidden in runtime code: "${specifier}".`,
    });
    return;
  }

  if (
    specifier.startsWith('@propertypro/db/src/') ||
    specifier.startsWith('packages/db/src/') ||
    specifier.includes('/packages/db/src/') ||
    specifier.startsWith('../packages/db/src/') ||
    specifier.startsWith('../../packages/db/src/') ||
    specifier.startsWith('../../../packages/db/src/') ||
    specifier.startsWith('../../../../packages/db/src/')
  ) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB002',
      message: `Direct db source import is forbidden: "${specifier}".`,
    });
    return;
  }

  if (!specifier.startsWith('@propertypro/db/')) {
    return;
  }

  if (!ALLOWED_DB_SUBPATHS.has(specifier)) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB003',
      message: `Unsupported @propertypro/db subpath import: "${specifier}".`,
    });
    return;
  }

  if (
    specifier === '@propertypro/db/unsafe' &&
    config.mode === 'scoped' &&
    !config.unsafeAllowlist.has(file)
  ) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB004',
      message: `Unsafe db import is not allowlisted in this file: "${specifier}".`,
    });
  }
}

function collectViolationsForFile(file: string, config: AppGuardConfig): Violation[] {
  const content = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      validateSpecifier(
        node.moduleSpecifier.text,
        file,
        config,
        sourceFile,
        node.moduleSpecifier.getStart(sourceFile),
        violations,
      );
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      const arg = node.arguments[0]!;
      validateSpecifier(
        arg.text,
        file,
        config,
        sourceFile,
        arg.getStart(sourceFile),
        violations,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function lineColForText(content: string, position: number): { line: number; column: number } {
  const prefix = content.slice(0, position);
  const lines = prefix.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return { line: lines.length, column: lastLine.length + 1 };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasTableRlsEnable(sql: string, tableName: string): boolean {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:\"?[\\w]+\"?\\.)?\"?${escapedTableName}\"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return pattern.test(sql);
}

function stripSqlComments(sql: string): string {
  // Replace block comments /* ... */ with equivalent whitespace (preserves newlines for accurate line reporting)
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
  // Replace line comments -- ... with equivalent whitespace
  s = s.replace(/--[^\r\n]*/g, (match) => ' '.repeat(match.length));
  return s;
}

function runAppGuard(config: AppGuardConfig): number {
  if (!isDirectory(config.appDir)) {
    // eslint-disable-next-line no-console
    console.log(`SKIP: DB access guard skipped for ${config.appDir} (${config.mode} mode, directory not found).`);
    return 0;
  }

  const files = listRuntimeSourceFiles(config.appDir);
  const violations = files.flatMap((file) => collectViolationsForFile(file, config));

  if (violations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `PASS: DB access guard is clean for ${files.length} runtime files in ${config.appDir} (${config.mode} mode).`,
    );
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error(
    `FAIL: ${violations.length} DB access violation(s) found in ${config.appDir} (${config.mode} mode).`,
  );
  return 1;
}

function runRlsPolicyCheck(): number {
  if (!isDirectory(migrationsRoot)) {
    // eslint-disable-next-line no-console
    console.error(`Migrations directory not found: ${migrationsRoot}`);
    return 1;
  }

  const migrationFiles = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(migrationsRoot, entry.name))
    .sort();
  const violations: Violation[] = [];

  for (const migrationFile of migrationFiles) {
    const sql = readFileSync(migrationFile, 'utf8');
    const cleanedSql = stripSqlComments(sql);
    const createTablePattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?\w+"?\.)?\"?(\w+)\"?/gi;
    const seenTables = new Set<string>();
    let match: RegExpExecArray | null = createTablePattern.exec(cleanedSql);

    while (match !== null) {
      const tableName = (match[1] ?? '').toLowerCase();
      if (tableName.length > 0 && !seenTables.has(tableName)) {
        seenTables.add(tableName);
        if (!NO_RLS_ALLOWLIST.has(tableName) && !hasTableRlsEnable(cleanedSql, tableName)) {
          const lc = lineColForText(cleanedSql, match.index);
          violations.push({
            file: migrationFile,
            line: lc.line,
            column: lc.column,
            code: 'DB005',
            message: `Migration creates table "${tableName}" without enabling row level security in the same file.`,
          });
        }
      }
      match = createTablePattern.exec(cleanedSql);
    }
  }

  if (violations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`PASS: RLS policy check is clean for ${migrationFiles.length} migration files.`);
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${violations.length} RLS policy violation(s) found.`);
  return 1;
}

function main(): number {
  let exitCode = 0;

  for (const config of APP_CONFIGS) {
    const code = runAppGuard(config);
    if (code !== 0) {
      exitCode = code;
    }
  }

  const rlsCode = runRlsPolicyCheck();
  if (rlsCode !== 0) {
    exitCode = rlsCode;
  }

  return exitCode;
}

process.exit(main());

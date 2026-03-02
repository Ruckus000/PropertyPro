import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type RuleCode = 'DB001' | 'DB002' | 'DB003' | 'DB004';

interface Violation {
  file: string;
  line: number;
  column: number;
  code: RuleCode;
  message: string;
}

interface AppGuardConfig {
  /** Absolute path to the app's src directory */
  appDir: string;
  /**
   * 'scoped'  — normal rules, @propertypro/db/unsafe must be explicitly allowlisted.
   * 'admin'   — @propertypro/db/unsafe is allowed everywhere (admin queries all tenants),
   *             but direct drizzle-orm imports are still forbidden.
   */
  mode: 'scoped' | 'admin';
  /** Absolute paths of files that may import @propertypro/db/unsafe (scoped mode only) */
  unsafeAllowlist: Set<string>;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const ALLOWED_DB_SUBPATHS = new Set<string>([
  '@propertypro/db/supabase/client',
  '@propertypro/db/supabase/server',
  '@propertypro/db/supabase/admin',
  '@propertypro/db/supabase/middleware',
  '@propertypro/db/filters',
  '@propertypro/db/unsafe',
  '@propertypro/db/seed/seed-community',
]);

const WEB_UNSAFE_ALLOWLIST = new Set<string>([
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
  // Demo auto-auth — needs service role to create Supabase sessions
  resolve(repoRoot, 'apps/web/src/app/api/v1/auth/demo-login/route.ts'),
]);

/** Apps to scan and their access policies */
const APP_CONFIGS: AppGuardConfig[] = [
  {
    appDir: join(repoRoot, 'apps', 'web', 'src'),
    mode: 'scoped',
    unsafeAllowlist: WEB_UNSAFE_ALLOWLIST,
  },
  // apps/admin is intentionally in 'admin' mode: it queries across all tenants
  // using createAdminClient() and legitimately needs unrestricted DB access.
  // Direct drizzle-orm imports are still forbidden.
  {
    appDir: join(repoRoot, 'apps', 'admin', 'src'),
    mode: 'admin',
    unsafeAllowlist: new Set(),
  },
];

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
  sourceFile: ts.SourceFile,
  position: number,
  violations: Violation[],
  config: AppGuardConfig,
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

  // For admin mode: unsafe imports are allowed from any file
  if (specifier === '@propertypro/db/unsafe' && config.mode === 'scoped') {
    if (!config.unsafeAllowlist.has(file)) {
      violations.push({
        file,
        line: lc.line,
        column: lc.column,
        code: 'DB004',
        message: `Unsafe db import is not allowlisted in this file: "${specifier}".`,
      });
    }
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
        sourceFile,
        node.moduleSpecifier.getStart(sourceFile),
        violations,
        config,
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
        sourceFile,
        arg.getStart(sourceFile),
        violations,
        config,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

/**
 * Tables that intentionally have no RLS (system tables managed via migrations only).
 * Must be documented with a one-line reason.
 */
const NO_RLS_TABLE_ALLOWLIST = new Set<string>([
  // Drizzle migrations metadata — not accessible via anon/authenticated keys
  '__drizzle_migrations',
]);

/**
 * Scan migration files and verify every CREATE TABLE has ENABLE ROW LEVEL SECURITY.
 */
function checkRlsPolicies(): { passed: boolean; errors: string[] } {
  const migrationsDir = join(repoRoot, 'packages', 'db', 'migrations');
  if (!existsSync(migrationsDir)) {
    return { passed: true, errors: [] };
  }

  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(migrationsDir, f));

  const errors: string[] = [];

  for (const sqlFile of sqlFiles) {
    const content = readFileSync(sqlFile, 'utf8');

    // Find all CREATE TABLE statements
    const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/gi;
    let match: RegExpExecArray | null;

    while ((match = createTableRe.exec(content)) !== null) {
      const tableName = match[1]!.toLowerCase();

      if (NO_RLS_TABLE_ALLOWLIST.has(tableName)) {
        continue;
      }

      // Check if ENABLE ROW LEVEL SECURITY appears in the same file for this table
      const rlsPattern = new RegExp(
        `ALTER\\s+TABLE\\s+${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );

      if (!rlsPattern.test(content)) {
        const relPath = sqlFile.replace(repoRoot + '/', '');
        errors.push(
          `${relPath}: CREATE TABLE "${tableName}" has no ENABLE ROW LEVEL SECURITY in the same migration file.`,
        );
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

function main(): number {
  let totalFiles = 0;
  const allViolations: Violation[] = [];

  // Scan each configured app
  for (const config of APP_CONFIGS) {
    if (!existsSync(config.appDir)) {
      // App doesn't exist yet (e.g., apps/admin during Phase 0) — skip silently
      continue;
    }

    if (!statSync(config.appDir).isDirectory()) {
      // eslint-disable-next-line no-console
      console.error(`Runtime directory not found: ${config.appDir}`);
      continue;
    }

    const files = listRuntimeSourceFiles(config.appDir);
    totalFiles += files.length;

    const violations = files.flatMap((file) => collectViolationsForFile(file, config));
    allViolations.push(...violations);
  }

  // RLS policy check
  const rlsResult = checkRlsPolicies();

  const hasViolations = allViolations.length > 0 || !rlsResult.passed;

  if (allViolations.length === 0 && rlsResult.passed) {
    // eslint-disable-next-line no-console
    console.log(`PASS: scoped DB access guard is clean for ${totalFiles} runtime files.`);
    // eslint-disable-next-line no-console
    console.log('PASS: RLS policy check — all CREATE TABLE statements have RLS enabled.');
    return 0;
  }

  for (const violation of allViolations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }

  if (!rlsResult.passed) {
    for (const err of rlsResult.errors) {
      // eslint-disable-next-line no-console
      console.error(`[RLS] ${err}`);
    }
  }

  if (hasViolations) {
    // eslint-disable-next-line no-console
    console.error(
      `FAIL: ${allViolations.length} DB access violation(s) + ${rlsResult.errors.length} RLS policy issue(s).`,
    );
  }

  return 1;
}

process.exit(main());

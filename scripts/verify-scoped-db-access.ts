import { readdirSync, readFileSync, statSync } from 'node:fs';
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const runtimeRoot = join(repoRoot, 'apps', 'web', 'src');

const ALLOWED_DB_SUBPATHS = new Set<string>([
  '@propertypro/db/supabase/client',
  '@propertypro/db/supabase/server',
  '@propertypro/db/supabase/admin',
  '@propertypro/db/supabase/middleware',
  '@propertypro/db/filters',
  '@propertypro/db/unsafe',
]);

const UNSAFE_IMPORT_ALLOWLIST = new Set<string>([
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

  if (specifier === '@propertypro/db/unsafe' && !UNSAFE_IMPORT_ALLOWLIST.has(file)) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB004',
      message: `Unsafe db import is not allowlisted in this file: "${specifier}".`,
    });
  }
}

function collectViolationsForFile(file: string): Violation[] {
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
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function main(): number {
  if (!statSync(runtimeRoot).isDirectory()) {
    // eslint-disable-next-line no-console
    console.error(`Runtime directory not found: ${runtimeRoot}`);
    return 1;
  }

  const files = listRuntimeSourceFiles(runtimeRoot);
  const violations = files.flatMap((file) => collectViolationsForFile(file));

  if (violations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`PASS: scoped DB access guard is clean for ${files.length} runtime files.`);
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${violations.length} scoped DB access violation(s) found.`);
  return 1;
}

process.exit(main());

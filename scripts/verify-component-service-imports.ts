#!/usr/bin/env tsx
/**
 * Component → Service Boundary Guard (ADR-003)
 *
 * Enforces the second of three layering guards from ADR-003:
 *   "Components never import from `lib/<domain>/services/` — they go through hooks."
 *
 * Why: components run in the client bundle. A direct value-import of a server-side
 * service module either (a) drags server code into the client bundle and breaks the
 * build, or (b) compiles only because the service module is incidentally
 * client-safe — at which point it's not really a "service" by ADR-003's
 * definition. Either way the layering invariant gets blurred and future
 * refactors cannot rely on it.
 *
 * `import type` from a service module is allowed: types are erased at build,
 * the runtime bundle is unaffected, and the alternative (duplicating the type
 * shape in a separate types file) is busywork. Value imports — destructured
 * functions, default exports, mixed `import { fn, type T }` blocks — fail.
 *
 * Companion guards:
 *   - `guard:component-api-calls` — components cannot call `fetch('/api/v1/*')`
 *     directly; only hooks can. (Plan A3 guard 1 of 3, shipped #198.)
 *   - `guard:db-access` — runtime code cannot import drizzle ops directly.
 *     (Pre-A3, but reinforces the bottom of the layering rule.)
 *
 * The third planned A3 guard — "routes can only import from lib/<domain>/ +
 * lib/api/", forbidding direct table imports from `@propertypro/db` in route
 * handlers — is NOT in this PR. That's a real migration (~227 routes)
 * tracked separately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// Only scan files that ship in the client bundle. Server components
// (app/(authenticated)/.../page.tsx, etc.) and route handlers are NOT in
// scope — they may legitimately call services directly.
const SCAN_ROOTS: readonly string[] = ['apps/web/src/components'];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.vercel',
  '__tests__',
]);

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Match `from '@/lib/services/...'` or `from '@/lib/<domain>/...service[s]?...'`.
// We use a deliberately wide path-match so renames don't silently weaken the
// guard. The check is on the *form* of the import line, not the path alone.
const SERVICE_IMPORT_PATH_RE =
  /from\s+['"]@\/lib\/(?:services\/[a-z0-9-]+|[a-z0-9-]+\/(?:services\/[a-z0-9-]+|[a-z0-9-]+-service))['"]/;

interface Violation {
  file: string;
  line: number;
  excerpt: string;
}

/**
 * Returns the import-statement block ending at `endIdx` (in `lines`). The
 * block may span multiple lines (e.g., `import { A, B,\n  C } from '...'`),
 * so we walk backwards until we find the line beginning with `import`.
 */
function captureImportStatement(lines: string[], endIdx: number): { text: string; startLine: number } {
  let start = endIdx;
  while (start > 0 && !/^\s*import\b/.test(lines[start]!)) {
    start--;
  }
  return {
    text: lines.slice(start, endIdx + 1).join('\n'),
    startLine: start,
  };
}

/**
 * `import type {...}` — entire statement is type-erased, safe to import from
 * a service module. Anything else (default imports, value imports, mixed
 * `import { foo, type T }` blocks where any non-type identifier appears) is a
 * value import.
 */
function isTypeOnlyImport(stmt: string): boolean {
  // Form 1: `import type { ... } from '...'`  → entire block is types
  if (/^\s*import\s+type\s/.test(stmt)) return true;

  // Form 2: `import { type A, type B } from '...'` — every named binding
  // marked `type`. We extract the brace-block and verify each member is
  // explicitly type-prefixed.
  const braceMatch = stmt.match(/import\s*\{([\s\S]*?)\}\s*from/);
  if (!braceMatch) return false;
  const members = braceMatch[1]!
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (members.length === 0) return false;
  return members.every((m) => /^type\s+\S/.test(m));
}

function findViolations(content: string, filePath: string): Violation[] {
  const lines = content.split('\n');
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!SERVICE_IMPORT_PATH_RE.test(line)) continue;
    const { text: stmt, startLine } = captureImportStatement(lines, i);
    if (isTypeOnlyImport(stmt)) continue;
    violations.push({
      file: filePath,
      line: startLine + 1,
      excerpt: stmt.replace(/\s+/g, ' ').trim().slice(0, 200),
    });
  }
  return violations;
}

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(abs));
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0) continue;
    if (!FILE_EXTENSIONS.has(entry.name.slice(dot))) continue;
    files.push(abs);
  }
  return files;
}

function main(): void {
  console.log('🔍 Component → Service Boundary Guard (ADR-003)');
  console.log('============================================================');

  const allFiles = SCAN_ROOTS.flatMap((rel) => {
    const abs = resolve(repoRoot, rel);
    try {
      return statSync(abs).isDirectory() ? listSourceFiles(abs) : [];
    } catch {
      return [];
    }
  });

  const violations: Violation[] = [];
  for (const file of allFiles) {
    const text = readFileSync(file, 'utf8');
    if (!SERVICE_IMPORT_PATH_RE.test(text)) continue;
    violations.push(...findViolations(text, file));
  }

  console.log(`\nScanned ${allFiles.length} component files.`);

  if (violations.length === 0) {
    console.log(
      `\n✅ No value imports of \`lib/<domain>/services/*\` from components. ` +
        `Type-only imports are allowed.`,
    );
    return;
  }

  console.error(`\n❌ ${violations.length} component file(s) value-import a service module:\n`);
  for (const v of violations) {
    const rel = relative(repoRoot, v.file);
    console.error(`  ${rel}:${v.line}`);
    console.error(`    ${v.excerpt}\n`);
  }
  console.error(
    'Components must access service-layer functionality through hooks ' +
      '(apps/web/src/hooks/) — not by importing from `lib/<domain>/services/` directly. ' +
      'If you only need the type, use `import type { ... }` to erase at build time.',
  );
  process.exit(1);
}

main();

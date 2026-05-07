#!/usr/bin/env tsx
/**
 * AUTHZ Comment Guard
 *
 * Every import from `@propertypro/db/unsafe` MUST be preceded by an
 *   `// AUTHZ: <reason>`
 * comment on the line directly above the import statement.
 *
 * Why: `@propertypro/db/unsafe` bypasses RLS and the scoped-client tenant
 * boundary. Each call site is gated by the scoped-db-access guard's
 * allowlist, but reviewer attention degrades as the count grows. Forcing a
 * one-line written authorization rationale next to each import keeps the
 * "why is this safe?" question answered at the source, not buried in PR
 * archaeology.
 *
 * Reason text must be at least 10 characters and not the literal string
 * "TODO" / "FIXME" — the comment is supposed to *justify* the import, not
 * defer the justification.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const SCAN_ROOTS = [
  join(repoRoot, 'apps'),
  join(repoRoot, 'packages'),
  join(repoRoot, 'scripts'),
];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
]);

const UNSAFE_IMPORT_RE = /from\s+['"]@propertypro\/db\/unsafe['"]/;
// Allow the AUTHZ comment to span more than one line for long rationales —
// require the *first* preceding non-blank line to start with `// AUTHZ:`.
const AUTHZ_LINE_RE = /^\s*\/\/\s*AUTHZ:\s*(.+?)\s*$/;
const FORBIDDEN_REASONS = new Set(['TODO', 'FIXME', 'XXX', '???']);
const MIN_REASON_LENGTH = 10;

interface Violation {
  file: string;
  line: number;
  message: string;
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
    if (entry.isFile() && (abs.endsWith('.ts') || abs.endsWith('.tsx'))) {
      files.push(abs);
    }
  }
  return files;
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const text = readFileSync(filePath, 'utf8');
  if (!UNSAFE_IMPORT_RE.test(text)) return violations;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!UNSAFE_IMPORT_RE.test(lines[i]!)) continue;

    // Find the start of the import statement: walk back over continuation
    // lines (multi-line imports) until we find the line beginning with
    // `import` (or hit start of file).
    let importStart = i;
    while (importStart > 0 && !/^\s*import\b/.test(lines[importStart]!)) {
      importStart--;
    }

    // Find the first preceding non-blank line.
    let prev = importStart - 1;
    while (prev >= 0 && lines[prev]!.trim() === '') prev--;

    if (prev < 0) {
      violations.push({
        file: filePath,
        line: i + 1,
        message:
          'Import from @propertypro/db/unsafe must have an `// AUTHZ: <reason>` comment immediately above it.',
      });
      continue;
    }

    const match = AUTHZ_LINE_RE.exec(lines[prev]!);
    if (!match) {
      violations.push({
        file: filePath,
        line: i + 1,
        message:
          'Import from @propertypro/db/unsafe must have an `// AUTHZ: <reason>` comment on the line directly above. ' +
          `Got: "${lines[prev]!.trim().slice(0, 80)}"`,
      });
      continue;
    }

    const reason = match[1]!.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      violations.push({
        file: filePath,
        line: prev + 1,
        message:
          `AUTHZ reason too short (${reason.length} chars; need >= ${MIN_REASON_LENGTH}). ` +
          'Explain why the unsafe import is justified.',
      });
      continue;
    }

    if (FORBIDDEN_REASONS.has(reason.toUpperCase())) {
      violations.push({
        file: filePath,
        line: prev + 1,
        message:
          `AUTHZ comment cannot be a placeholder ("${reason}"). ` +
          'Provide a real authorization rationale.',
      });
      continue;
    }
  }

  return violations;
}

function main(): void {
  console.log('🔍 AUTHZ Comment Guard for @propertypro/db/unsafe imports');
  console.log('============================================================');

  const allFiles = SCAN_ROOTS.flatMap((root) => {
    try {
      return listSourceFiles(root);
    } catch {
      return [];
    }
  });

  const violations: Violation[] = [];
  let importCount = 0;
  for (const file of allFiles) {
    const text = readFileSync(file, 'utf8');
    if (!UNSAFE_IMPORT_RE.test(text)) continue;
    importCount += text.match(new RegExp(UNSAFE_IMPORT_RE, 'g'))?.length ?? 0;
    violations.push(...checkFile(file));
  }

  console.log(
    `\nScanned ${allFiles.length} files. Found ${importCount} imports of @propertypro/db/unsafe.`,
  );

  if (violations.length === 0) {
    console.log(
      `\n✅ All @propertypro/db/unsafe imports are documented with an // AUTHZ: comment.`,
    );
    return;
  }

  console.error(`\n❌ ${violations.length} import(s) missing or invalid AUTHZ comment:\n`);
  for (const v of violations) {
    const rel = relative(repoRoot, v.file);
    console.error(`  ${rel}:${v.line}`);
    console.error(`    ${v.message}\n`);
  }
  console.error(
    'Add `// AUTHZ: <reason>` on the line immediately above each ' +
      '@propertypro/db/unsafe import explaining why bypassing the scoped client is safe.',
  );
  process.exit(1);
}

main();

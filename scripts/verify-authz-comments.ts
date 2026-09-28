#!/usr/bin/env tsx
/**
 * AUTHZ Comment Guard (`pnpm guard:authz-comments`)
 *
 * Every import of a PRIVILEGED database module MUST be preceded by an
 *   `// AUTHZ: <reason>`
 * comment on the line directly above the import statement. Two modules:
 *
 * - `@propertypro/db/unsafe` — bypasses RLS and the scoped-client tenant
 *   boundary. Everywhere.
 * - `@propertypro/db/supabase/admin` — the Supabase SERVICE-ROLE client:
 *   bypasses RLS on every table and bucket, and holds the GoTrue admin API.
 *   Strictly more powerful than `/unsafe`, and until roadmap 2.5 (DBB-03) it
 *   needed no rationale at all. Everywhere EXCEPT `apps/admin/`: service role is
 *   how the platform-admin console normally reaches the database (73 files),
 *   every admin API verb is refused to non-platform-admins by
 *   guard:route-gates, and a rationale on each would be one sentence repeated.
 *   Trigger to revisit: admin gains a non-platform-admin user class or a
 *   tenant-reachable surface.
 *
 * Why: each call site is also gated elsewhere, but reviewer attention degrades
 * as the count grows. A one-line written rationale next to each import keeps
 * "why is this safe?" answered at the source, not buried in PR archaeology.
 *
 * Both static imports and DYNAMIC `import('<module>')` count — a lazy import
 * reaches the same client (`demo-grace-guard.ts` did so unannotated, invisible
 * to the static-only version of this guard). `typeof import(...)` is a type
 * and does not. For a dynamic import the comment goes on the line above the
 * line containing the call.
 *
 * Reason text must be at least 10 characters and not a placeholder
 * ("TODO" / "FIXME") — the comment must *justify* the import, not defer it.
 *
 * Known limit: line-based, so a re-export (`export … from '<module>'`) is not
 * recognised. There are none today; add AST parsing when one appears.
 *
 * Exit codes are tri-state, per `.claude/rules/verification.md`:
 *   0  clean
 *   1  violations found
 *   2  could not check (missing scan root, or zero privileged imports found)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isMainModule } from './lib/is-main-module';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '..');

const SCAN_ROOTS = ['apps', 'packages', 'scripts'];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
]);

export interface PrivilegedModule {
  specifier: string;
  /** Repo-relative path prefixes (forward slashes) where the rule does not apply. */
  exemptPrefixes: readonly string[];
}

export const PRIVILEGED_MODULES: readonly PrivilegedModule[] = [
  { specifier: '@propertypro/db/unsafe', exemptPrefixes: [] },
  { specifier: '@propertypro/db/supabase/admin', exemptPrefixes: ['apps/admin/'] },
];

// Allow the AUTHZ comment to span more than one line for long rationales —
// require the *first* preceding non-blank line to start with `// AUTHZ:`.
const AUTHZ_LINE_RE = /^\s*\/\/\s*AUTHZ:\s*(.+?)\s*$/;
const FORBIDDEN_REASONS = new Set(['TODO', 'FIXME', 'XXX', '???']);
const MIN_REASON_LENGTH = 10;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matchersFor(specifier: string) {
  const quoted = `['"]${escapeRe(specifier)}['"]`;
  return {
    static: new RegExp(`from\\s+${quoted}`),
    // `import(` not preceded by `typeof ` — a type query reaches no client.
    dynamic: new RegExp(`(?<!typeof\\s+)\\bimport\\(\\s*${quoted}\\s*\\)`),
  };
}

export interface Violation {
  file: string;
  line: number;
  message: string;
}

export interface FileResult {
  imports: number;
  violations: Violation[];
}

const toPosix = (p: string) => p.split(sep).join('/');

/**
 * Check one file. `relPath` is repo-relative; it decides exemptions and is
 * echoed in violations.
 */
export function checkFile(
  relPath: string,
  text: string,
  modules: readonly PrivilegedModule[] = PRIVILEGED_MODULES,
): FileResult {
  const posixPath = toPosix(relPath);
  const result: FileResult = { imports: 0, violations: [] };
  const lines = text.split('\n');

  for (const mod of modules) {
    if (mod.exemptPrefixes.some((p) => posixPath.startsWith(p))) continue;
    const re = matchersFor(mod.specifier);
    if (!re.static.test(text) && !re.dynamic.test(text)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const isStatic = re.static.test(line);
      if (!isStatic && !re.dynamic.test(line)) continue;
      result.imports += 1;

      // Static: walk back over continuation lines of a multi-line import to the
      // line that begins `import`. Dynamic: the call's own line.
      let statementStart = i;
      if (isStatic) {
        while (statementStart > 0 && !/^\s*import\b/.test(lines[statementStart]!)) statementStart--;
      }

      let prev = statementStart - 1;
      while (prev >= 0 && lines[prev]!.trim() === '') prev--;

      const need = `Import of ${mod.specifier} must have an \`// AUTHZ: <reason>\` comment on the line directly above`;
      if (prev < 0) {
        result.violations.push({ file: relPath, line: i + 1, message: `${need}.` });
        continue;
      }

      const match = AUTHZ_LINE_RE.exec(lines[prev]!);
      if (!match) {
        result.violations.push({
          file: relPath,
          line: i + 1,
          message: `${need}. Got: "${lines[prev]!.trim().slice(0, 80)}"`,
        });
        continue;
      }

      const reason = match[1]!.trim();
      if (reason.length < MIN_REASON_LENGTH) {
        result.violations.push({
          file: relPath,
          line: prev + 1,
          message:
            `AUTHZ reason too short (${reason.length} chars; need >= ${MIN_REASON_LENGTH}). ` +
            `Explain why the ${mod.specifier} import is justified.`,
        });
        continue;
      }

      if (FORBIDDEN_REASONS.has(reason.toUpperCase())) {
        result.violations.push({
          file: relPath,
          line: prev + 1,
          message: `AUTHZ comment cannot be a placeholder ("${reason}"). Provide a real authorization rationale.`,
        });
      }
    }
  }

  return result;
}

function listSourceFiles(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const abs = join(root, entry.name);
    if (entry.isDirectory()) listSourceFiles(abs, out);
    else if (entry.isFile() && (abs.endsWith('.ts') || abs.endsWith('.tsx'))) out.push(abs);
  }
}

export function checkAuthzComments(repoRoot: string = defaultRepoRoot): 0 | 1 | 2 {
  console.log('🔍 AUTHZ Comment Guard for privileged DB imports');
  console.log('================================================');

  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root);
    try {
      if (!statSync(abs).isDirectory()) throw new Error('not a directory');
      listSourceFiles(abs, files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Cannot check: scan root ${root} is unreadable (${message}).`);
      return 2;
    }
  }

  const violations: Violation[] = [];
  let imports = 0;
  for (const file of files) {
    const result = checkFile(relative(repoRoot, file), readFileSync(file, 'utf8'));
    imports += result.imports;
    violations.push(...result.violations);
  }

  console.log(`\nScanned ${files.length} files. Found ${imports} privileged imports.`);

  if (imports === 0) {
    console.error('❌ Cannot check: found 0 privileged imports — the scan examined nothing.');
    return 2;
  }

  if (violations.length === 0) {
    console.log('\n✅ Every privileged DB import is documented with an // AUTHZ: comment.');
    return 0;
  }

  console.error(`\n❌ ${violations.length} import(s) missing or invalid AUTHZ comment:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.message}\n`);
  }
  console.error(
    'Add `// AUTHZ: <reason>` on the line immediately above each import, explaining why ' +
      'bypassing the scoped client (or RLS, for the service-role client) is safe there.',
  );
  return 1;
}

if (isMainModule(import.meta.url)) {
  process.exit(checkAuthzComments());
}

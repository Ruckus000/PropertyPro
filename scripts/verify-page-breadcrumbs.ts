// scripts/verify-page-breadcrumbs.ts
//
// CI guard: every in-scope page.tsx under apps/web/src/app/(authenticated)/
// must contain <PageHeader ... breadcrumb=…> OR a // breadcrumbs:exempt comment.
//
// In-scope glob (matched by findInScopePages below):
//   **/[<param>]/page.tsx      (parent dir bracketed → entity detail)
//   **/new/page.tsx            (parent dir is `new`)
//   **/[<param>]/edit/page.tsx (parent dir `edit`, grandparent bracketed)
//
// Known false-negative classes (see spec §CI Guard):
//   1. `breadcrumb={someExpression}` that evaluates to `null` at runtime.
//   2. `<PageHeader>` rendered conditionally where one branch passes breadcrumb
//      and another doesn't (regex matches the source, not the runtime).
//   3. A delegated component that itself delegates further (two-hop only).
//   4. Prop ordering: `<PageHeader>` with a JSX-valued prop containing `>`
//      (e.g., `actions={<Button>Cancel</Button>}`) placed BEFORE `breadcrumb=`.
//      The [^>]* halts at the first `>` inside the nested JSX. Mitigation:
//      .claude/rules/design.md requires `breadcrumb=` before any JSX-valued
//      prop on <PageHeader>.
//
// These are documented limitations; a grep guard is not a type checker.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const AUTH_ROOT = resolve(repoRoot, 'apps/web/src/app/(authenticated)');

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

// See false-negative class 4 above — `[^>]*` halts at the first `>`.
// Every migrated <PageHeader> must place `breadcrumb=` before `actions=`
// or any other JSX-valued prop.
const PAGE_HEADER_BREADCRUMB_RE = /<PageHeader\b[^>]*\sbreadcrumb=/s;
const EXEMPT_RE = /^\s*\/\/\s*breadcrumbs:exempt(.*)$/m;
const DELEGATED_RE = /delegated\s+to\s+(\S+)/;

export function verifyFile(absolutePath: string): VerifyResult {
  if (!existsSync(absolutePath)) {
    return { ok: false, reason: `file not found: ${absolutePath}` };
  }
  const content = readFileSync(absolutePath, 'utf8');

  const exemptMatch = content.match(EXEMPT_RE);
  if (exemptMatch) {
    const reason = exemptMatch[1] ?? '';
    const delegatedMatch = reason.match(DELEGATED_RE);
    if (delegatedMatch) {
      const targetRel = delegatedMatch[1];
      const targetAbs = resolve(repoRoot, targetRel);
      if (!existsSync(targetAbs)) {
        return { ok: false, reason: `delegated target not found: ${targetRel}` };
      }
      const targetContent = readFileSync(targetAbs, 'utf8');
      if (!PAGE_HEADER_BREADCRUMB_RE.test(targetContent)) {
        return { ok: false, reason: `delegated target ${targetRel} has no <PageHeader breadcrumb=...>` };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  if (!PAGE_HEADER_BREADCRUMB_RE.test(content)) {
    return { ok: false, reason: 'no breadcrumb: file has no <PageHeader ... breadcrumb=...> and no exemption comment' };
  }

  return { ok: true };
}

/**
 * Walks AUTH_ROOT recursively. Returns absolute paths of `page.tsx` files
 * whose immediate parent directory is `[<param>]`, `new`, or whose grandparent
 * is `[<param>]` and parent is `edit`.
 */
function findInScopePages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findInScopePages(full, out);
      continue;
    }
    if (entry !== 'page.tsx') continue;
    const parent = basename(dir);
    const grandparent = basename(dirname(dir));
    const inScope =
      /^\[.+\]$/.test(parent) ||
      parent === 'new' ||
      (parent === 'edit' && /^\[.+\]$/.test(grandparent));
    if (inScope) out.push(full);
  }
  return out;
}

function main(): void {
  const files = findInScopePages(AUTH_ROOT);
  const failures: Array<{ file: string; reason: string }> = [];
  for (const file of files) {
    const result = verifyFile(file);
    if (!result.ok) {
      failures.push({ file: relative(repoRoot, file), reason: result.reason ?? 'unknown' });
    }
  }
  if (failures.length > 0) {
    console.error('Breadcrumb guard failed:');
    for (const f of failures) {
      console.error(`  ${f.file}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log(`Breadcrumb guard passed: ${files.length} in-scope pages verified.`);
}

// ESM main-detection (POSIX only — fine for the dev team's Mac/Linux setup).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

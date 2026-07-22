// scripts/verify-page-breadcrumbs.ts
//
// CI guard: every in-scope page.tsx under apps/web/src/app/(authenticated)/
// must render a page-title <h1> so the global breadcrumb trail can resolve a
// real leaf label for the route.
//
// Background: breadcrumbs are no longer authored per-page. A single global
// trail is rendered by the app shell (components/layout/shell-breadcrumbs.tsx),
// derived from the URL plus the page's <h1> (which the design system already
// requires each page to render). This guard therefore checks that in-scope
// pages provide that <h1> — via `<PageHeader title=...>` (the canonical page
// header, which renders the h1) or a literal `<h1>` — OR opt out with a
// `// breadcrumbs:exempt` comment.
//
// A page whose chrome is rendered by a delegated client component uses
// `// breadcrumbs:exempt — delegated to <path>`; the delegated target is then
// checked for the title h1 instead.
//
// In-scope glob (matched by findInScopePages below):
//   **/[<param>]/page.tsx      (parent dir bracketed → entity detail)
//   **/new/page.tsx            (parent dir is `new`)
//   **/[<param>]/edit/page.tsx (parent dir `edit`, grandparent bracketed)
//
// Known limitation: a grep guard is not a type checker — it verifies the title
// is authored in source, not that it renders under every runtime branch.

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

// A <PageHeader> with a `title=` prop (PageHeader renders the page <h1>), or a
// literal <h1> element for pages/components with a custom header.
const PAGE_HEADER_TITLE_RE = /<PageHeader\b[\s\S]*?\btitle=/;
const H1_RE = /<h1[\s>]/;
const EXEMPT_RE = /^\s*\/\/\s*breadcrumbs:exempt(.*)$/m;
const DELEGATED_RE = /delegated\s+to\s+(\S+)/;

/** True when the source renders a page-title h1 (via PageHeader or literal). */
function hasPageTitle(content: string): boolean {
  return PAGE_HEADER_TITLE_RE.test(content) || H1_RE.test(content);
}

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
      if (!hasPageTitle(targetContent)) {
        return {
          ok: false,
          reason: `delegated target ${targetRel} renders no page-title <h1> (need <PageHeader title=...> or an <h1>)`,
        };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  if (!hasPageTitle(content)) {
    return {
      ok: false,
      reason:
        'no page title: file renders no <PageHeader title=...> or <h1>, and has no // breadcrumbs:exempt comment',
    };
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
    console.error('Page-title (breadcrumb) guard failed:');
    for (const f of failures) {
      console.error(`  ${f.file}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log(`Page-title (breadcrumb) guard passed: ${files.length} in-scope pages verified.`);
}

// ESM main-detection (POSIX only — fine for the dev team's Mac/Linux setup).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

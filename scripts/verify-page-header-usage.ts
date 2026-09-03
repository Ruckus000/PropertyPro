// scripts/verify-page-header-usage.ts
//
// CI guard: in the authenticated app, PageHeader owns the page <h1>. No page,
// and no page-shell component, renders its own <h1>.
//
// Background: PageHeader stopped painting its title and description (the
// page-title decision in .claude/rules/design.md — the rail says which page you
// are on; the <h1> is rendered sr-only for the breadcrumb leaf and assistive
// tech). A page that still authors a literal <h1> paints a title the rest of
// the app no longer has, so it is a second convention, not a variant. This
// guard fails on it.
//
// Scope:
//   apps/web/src/app/(authenticated)/**/*.tsx     every page and colocated client
//   PAGE_SHELL_COMPONENTS                          components under src/components
//                                                  that render an authenticated
//                                                  page's chrome
// Out of scope by construction: marketing, public sites, mobile, auth/signup,
// help MDX bodies, the site editor — none of those are under the rail.
//
// Escape hatch: a `// page-header:exempt — <reason>` line anywhere in the
// file. Reserved for pages whose <h1> IS the content (an outcome headline) or
// that render outside the shell (an orientation page with no rail).
//
// Comments are stripped before matching, so a docblock that merely mentions
// <h1> does not count. A JSX `{/* … */}` comment is stripped too.
//
// Exit codes (tri-state): 0 clean · 1 violations · 2 could not check (scope
// root missing, or zero files scanned — a scan that examined nothing must not
// pass).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const AUTH_ROOT = resolve(repoRoot, 'apps/web/src/app/(authenticated)');

/** Components under src/components that render an authenticated page's chrome. */
const PAGE_SHELL_COMPONENTS = [
  'apps/web/src/components/residents/residents-page-client.tsx',
  'apps/web/src/components/units/units-page-client.tsx',
  'apps/web/src/components/esign/esign-page-shell.tsx',
  'apps/web/src/components/meetings/meetings-page-shell.tsx',
  'apps/web/src/components/documents/document-library.tsx',
  'apps/web/src/components/board/board-chrome.tsx',
  'apps/web/src/components/settings/billing-page-client.tsx',
  'apps/web/src/components/settings/account-settings-client.tsx',
  'apps/web/src/components/dashboard/dashboard-welcome.tsx',
];

// `<h1` unless a word character follows: catches `<h1>`, `<h1 …`, and a bare
// `<h1` that ends its line with the attributes on the next; leaves `<h10` alone.
const H1_RE = /<h1(?![\w-])/;
const EXEMPT_RE = /^\s*\/\/\s*page-header:exempt(.*)$/m;

/** Remove block comments, whole-line line comments, and JSX comment blocks. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');
}

export interface Violation {
  file: string;
  line: number;
  text: string;
}

export function verifyFile(absolutePath: string): Violation[] {
  const raw = readFileSync(absolutePath, 'utf8');
  if (EXEMPT_RE.test(raw)) return [];
  const source = stripComments(raw);
  const violations: Violation[] = [];
  source.split('\n').forEach((line, i) => {
    if (H1_RE.test(line)) {
      violations.push({ file: relative(repoRoot, absolutePath), line: i + 1, text: line.trim() });
    }
  });
  return violations;
}

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTsx(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  if (!existsSync(AUTH_ROOT)) {
    console.error(`page-header guard: could not check — scope root missing: ${AUTH_ROOT}`);
    process.exit(2);
  }
  const files = [
    ...walkTsx(AUTH_ROOT),
    ...PAGE_SHELL_COMPONENTS.map((p) => resolve(repoRoot, p)),
  ];
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    console.error('page-header guard: could not check — listed shell component(s) missing:');
    for (const m of missing) console.error(`  ${relative(repoRoot, m)}`);
    process.exit(2);
  }
  if (files.length === 0) {
    console.error('page-header guard: could not check — zero files in scope');
    process.exit(2);
  }

  const violations = files.flatMap(verifyFile);
  const exempt = files.filter((f) => EXEMPT_RE.test(readFileSync(f, 'utf8'))).length;

  if (violations.length > 0) {
    const byFile = new Map<string, Violation[]>();
    for (const v of violations) byFile.set(v.file, [...(byFile.get(v.file) ?? []), v]);
    console.error(
      `page-header guard failed: ${violations.length} literal <h1> in ${byFile.size} file(s) ` +
        `(files scanned: ${files.length}, exempt: ${exempt}). PageHeader owns the page <h1>:`,
    );
    for (const [file, vs] of byFile) {
      for (const v of vs) console.error(`  ${file}:${v.line}  ${v.text}`);
    }
    process.exit(1);
  }
  console.log(`page-header guard passed: ${files.length} files scanned, 0 literal <h1> (exempt: ${exempt}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

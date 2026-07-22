// scripts/verify-page-padding.ts
//
// CI guard: authenticated pages must NOT re-introduce the page gutter.
//
// Background: the single page gutter — horizontal padding, vertical padding, and
// the centred max-width — is owned by ONE place, `PageContainer`, rendered by the
// app shell (apps/web/src/components/layout/app-shell.tsx) around every
// authenticated route. Tuning app-wide page padding is therefore a one-line change
// there. Two anti-patterns break that contract and are what this guard catches:
//
//   1. A page that adds its OWN horizontal padding (px-/pl-/pr-/p-<n>, including
//      responsive variants like `sm:px-8`) on its root returned element —
//      double-padding on top of the shell gutter (the "text is inconsistently
//      inset" class of bug).
//   2. A page that renders its OWN <main> — nesting a second `<main>` landmark
//      inside the shell's `<main id="main-content">` (an a11y defect; historically
//      also duplicated the id).
//
// Pages that need a narrower reading column use `<PageBody width="prose|form|...">`
// (centred max-width, NO horizontal padding) instead of hand-writing
// `mx-auto max-w-* px-*`.
//
// Scope: apps/web/src/app/(authenticated)/**/page.tsx. Delegated client shells and
// genuinely shared components (e.g. a component rendered on both an authenticated
// route AND a public/standalone route) are intentionally out of scope — their
// gutter ownership differs.
//
// Escape hatch: `// page-padding:exempt — <reason>` anywhere in the file.
//
// Pre-existing violations are frozen in scripts/page-padding-baseline.json
// (shrink-only, per-file ceilings): a baselined file may keep AT MOST its recorded
// count, and new/changed files must be clean. Drain a file, then lower its ceiling.
//
// Known limitation: this is a source grep, not an AST/type checker. It inspects the
// first opening tag after each `return (`, which covers the root wrappers in
// practice but is not a full render analysis.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const AUTH_ROOT = resolve(repoRoot, 'apps/web/src/app/(authenticated)');
const BASELINE_PATH = resolve(scriptDir, 'page-padding-baseline.json');

const EXEMPT_RE = /\/\/\s*page-padding:exempt\b/;

// First opening element after each `return (`, restricted to STRUCTURAL container
// elements (div/main/section/article) — the only things used as a page root. This
// deliberately ignores leaf/interactive returns from `.map()` callbacks and helper
// components (`<Link>`, `<a>`, `<button>`, `<span>`, …), whose padding is component-
// internal, not the page gutter. `[^>]*?` spans newlines (negated class includes
// \n) so multi-line opening tags are handled; fragments (`<>`) carry no className.
const RETURN_ROOT_RE = /return\s*\(\s*(<(?:div|main|section|article)\b[^>]*?>)/g;

// Horizontal padding utilities (bare or responsive/state-prefixed): px-, pl-, pr-,
// or the p-<n> shorthand (which also sets horizontal padding). Value is a digit or
// an arbitrary `[` bracket.
const H_PADDING_RE = /(?:^|[\s"'`{:])(?:px|pl|pr|p)-(?:\d|\[)/;

// Any page-authored <main>. The shell owns the only <main>.
const NESTED_MAIN_RE = /<main[\s>]/;

export interface Violation {
  rule: 'root-horizontal-padding' | 'nested-main';
  detail: string;
}

export function findViolations(content: string): Violation[] {
  if (EXEMPT_RE.test(content)) return [];
  const violations: Violation[] = [];

  if (NESTED_MAIN_RE.test(content)) {
    violations.push({
      rule: 'nested-main',
      detail: 'page renders its own <main>; the shell owns the only <main id="main-content">',
    });
  }

  for (const match of content.matchAll(RETURN_ROOT_RE)) {
    const openingTag = match[1] ?? '';
    if (H_PADDING_RE.test(openingTag)) {
      const compact = openingTag.replace(/\s+/g, ' ').slice(0, 120);
      violations.push({
        rule: 'root-horizontal-padding',
        detail: `root element has horizontal padding (the shell gutter owns it): ${compact}`,
      });
    }
  }

  return violations;
}

function findAuthenticatedPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findAuthenticatedPages(full, out);
      continue;
    }
    if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

function loadBaseline(): Record<string, number> {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function main(): void {
  const baseline = loadBaseline();
  const files = findAuthenticatedPages(AUTH_ROOT);
  const failures: Array<{ file: string; count: number; allowed: number; violations: Violation[] }> = [];

  for (const file of files) {
    const rel = relative(repoRoot, file);
    const violations = findViolations(readFileSync(file, 'utf8'));
    const allowed = baseline[rel] ?? 0;
    if (violations.length > allowed) {
      failures.push({ file: rel, count: violations.length, allowed, violations });
    }
  }

  if (failures.length > 0) {
    console.error('Page-padding guard failed — pages must not re-introduce the shell gutter:');
    for (const f of failures) {
      console.error(`\n  ${f.file} (${f.count} violation(s), baseline allows ${f.allowed}):`);
      for (const v of f.violations) {
        console.error(`    [${v.rule}] ${v.detail}`);
      }
    }
    console.error(
      '\nFix: remove the root px-*/py-* and any nested <main>; let the shell gutter (PageContainer)' +
        ' own it, and use <PageBody width="..."> for a narrower column. If truly intentional, add' +
        ' `// page-padding:exempt — <reason>`.',
    );
    process.exit(1);
  }

  console.log(`Page-padding guard passed: ${files.length} authenticated pages verified.`);
}

// ESM main-detection (POSIX).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

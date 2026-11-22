// scripts/verify-page-template.ts
//
// CI guard: every signed-in page is built on PageLayout, or says why not.
//
// ponytail: proves a page HAS a PageLayout view, not that customers are served it
// (a pilot page still renders its old view to everyone off the allow-list).
// Trigger: Task 19 removes the gate; delete this note then.
//
// A `page.tsx` under the scanned route groups passes when it:
//   1. contains a JSX `<PageLayout>` element; or
//   2. carries a leading `// page-template: delegated to <path>[, <path>…]`
//      comment and EVERY named file exists and contains a JSX `<PageLayout>`
//      (paths are relative to the repo root, or to `--root`); or
//   3. calls `redirect(` / `permanentRedirect(` and renders no JSX; or
//   4. carries a leading `// page-template:exempt — <reason>` comment.
// Every other page must be listed in scripts/page-template-baseline.json
// (shrink-only). A baselined page that now passes is STALE and fails, as is a
// baselined path that no longer exists.
//
// "Leading comment" means the comment block before the file's first statement,
// so it can sit beside another guard's marker (e.g. `breadcrumbs:exempt`).
//
// Exit codes: 0 clean · 1 violations · 2 could not check (no scan root, zero
// pages, a parse failure, or a broken parser self-test).
//
// `--write-baseline` rewrites the baseline from the current failures. It may
// shrink freely; GROWING it needs `--force`, as guard:service-dead-exports does.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isMainModule } from './lib/is-main-module';
import { parseRootArg, RootArgError } from './lib/root-arg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const APP_REL = 'apps/web/src/app';
const BASELINE_PATH = resolve(scriptDir, 'page-template-baseline.json');

export const SCANNED_GROUPS = [
  '(authenticated)',
  '(help)',
  'auth',
  '(auth)',
  'sign',
  '(print)',
  '(site-editor)',
  'public-transparency',
  'demo',
] as const;
export const EXCLUDED_REASON = 'mobile: phone app is a separate programme';

const DELEGATED_RE = /^\s*\/\/\s*page-template:\s*delegated to\s+(.+?)\s*$/;
const EXEMPT_RE = /^\s*\/\/\s*page-template:exempt\b/;

export interface Result {
  status: 0 | 1 | 2;
  pages: number;
  compliant: number;
  redirectOnly: number;
  baselined: number;
  exempt: number;
  /** Failing pages that are not baselined, with the reason. */
  violations: Array<{ file: string; reason: string }>;
  /** Baselined paths that now pass or no longer exist. */
  stale: string[];
  /** Pages that fail and are not exempt/redirect — what `--write-baseline` records. */
  failing: string[];
  /** Why status is 2. */
  error?: string;
}

interface Analysis {
  hasPageLayout: boolean;
  hasJsx: boolean;
  hasRedirectCall: boolean;
  leadingComments: string[];
}

class ParseError extends Error {}

function parse(file: string, text: string): ts.SourceFile {
  const { diagnostics } = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
  });
  if (diagnostics && diagnostics.length > 0) {
    throw new ParseError(`${file}: ${ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, ' ')}`);
  }
  return ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
}

function analyze(file: string, text: string): Analysis {
  const sf = parse(file, text);
  let hasPageLayout = false;
  let hasJsx = false;
  let hasRedirectCall = false;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      hasJsx = true;
      if (node.tagName.getText(sf) === 'PageLayout') hasPageLayout = true;
    } else if (ts.isJsxFragment(node)) {
      hasJsx = true;
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'redirect' || node.expression.text === 'permanentRedirect')
    ) {
      hasRedirectCall = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const leadingComments = (ts.getLeadingCommentRanges(text, 0) ?? []).map((r) =>
    text.slice(r.pos, r.end),
  );
  return { hasPageLayout, hasJsx, hasRedirectCall, leadingComments };
}

/** A broken parser must not read as "no PageLayout anywhere": prove it can both fail and find. */
function parserSelfTest(): boolean {
  try {
    parse('t.tsx', 'const = <');
    return false;
  } catch (e) {
    if (!(e instanceof ParseError)) return false;
  }
  try {
    const a = analyze('t.tsx', '// c\nexport default () => <PageLayout title="x" />;');
    return a.hasPageLayout && a.leadingComments.length === 1;
  } catch {
    return false;
  }
}

function listPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listPages(full, out);
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

function loadBaseline(root: string): string[] {
  const path = root === repoRoot ? BASELINE_PATH : resolve(root, 'scripts/page-template-baseline.json');
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed) || parsed.some((p) => typeof p !== 'string')) {
    throw new ParseError(`${path}: baseline must be a JSON array of paths`);
  }
  return parsed as string[];
}

/** Returns a reason when the page is not on PageLayout via delegation, or null when it is. */
function delegationFailure(root: string, comments: string[]): string | null {
  for (const c of comments) {
    for (const line of c.split('\n')) {
      const m = DELEGATED_RE.exec(line);
      if (!m) continue;
      const paths = m[1]!.split(',').map((p) => p.trim()).filter(Boolean);
      const bad: string[] = [];
      for (const p of paths) {
        const target = resolve(root, p);
        if (!existsSync(target) || !statSync(target).isFile()) {
          bad.push(`${p} (does not exist)`);
        } else if (!analyze(target, readFileSync(target, 'utf8')).hasPageLayout) {
          bad.push(`${p} (no <PageLayout>)`);
        }
      }
      return bad.length === 0 ? null : `delegated view fails: ${bad.join(', ')}`;
    }
  }
  return 'no <PageLayout>, no delegation, not redirect-only, not exempt';
}

export function scan(root: string, baseline?: string[]): Result {
  const result: Result = {
    status: 0,
    pages: 0,
    compliant: 0,
    redirectOnly: 0,
    baselined: 0,
    exempt: 0,
    violations: [],
    stale: [],
    failing: [],
  };
  const refuse = (error: string): Result => ({ ...result, status: 2, error });

  if (!parserSelfTest()) return refuse('TypeScript parser self-test failed');

  const appRoot = resolve(root, APP_REL);
  if (!existsSync(appRoot)) return refuse(`scan root missing: ${APP_REL}`);

  const files: string[] = [];
  for (const group of SCANNED_GROUPS) {
    const dir = join(appRoot, group);
    if (existsSync(dir) && statSync(dir).isDirectory()) listPages(dir, files);
  }
  if (files.length === 0) return refuse(`no page.tsx under the scanned route groups in ${APP_REL}`);

  let listed: string[];
  try {
    listed = baseline ?? loadBaseline(root);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const baselineSet = new Set(listed);
  const seen = new Set<string>();

  for (const file of files.sort()) {
    const rel = relative(root, file);
    seen.add(rel);
    result.pages += 1;
    let a: Analysis;
    try {
      a = analyze(file, readFileSync(file, 'utf8'));
    } catch (e) {
      return refuse(e instanceof Error ? e.message : String(e));
    }

    let failure: string | null;
    let kind: 'compliant' | 'redirect' | 'exempt' | null = null;
    if (a.hasPageLayout) kind = 'compliant';
    else if (a.leadingComments.some((c) => c.split('\n').some((l) => EXEMPT_RE.test(l)))) kind = 'exempt';
    else if (a.leadingComments.some((c) => c.split('\n').some((l) => DELEGATED_RE.test(l)))) {
      failure = delegationFailure(root, a.leadingComments);
      if (failure === null) kind = 'compliant';
      else {
        record(rel, failure);
        continue;
      }
    } else if (a.hasRedirectCall && !a.hasJsx) kind = 'redirect';

    if (kind === 'compliant') result.compliant += 1;
    else if (kind === 'exempt') result.exempt += 1;
    else if (kind === 'redirect') result.redirectOnly += 1;
    else {
      record(rel, delegationFailure(root, a.leadingComments) ?? '');
      continue;
    }
    if (baselineSet.has(rel)) result.stale.push(rel);
  }

  function record(rel: string, reason: string): void {
    result.failing.push(rel);
    if (baselineSet.has(rel)) result.baselined += 1;
    else result.violations.push({ file: rel, reason });
  }

  for (const entry of listed) if (!seen.has(entry)) result.stale.push(entry);

  result.status = result.violations.length > 0 || result.stale.length > 0 ? 1 : 0;
  return result;
}

function report(root: string, r: Result): void {
  if (r.status === 2) {
    console.error(`Page-template guard could not check — ${r.error}`);
    return;
  }
  console.log(`Page-template guard (${EXCLUDED_REASON} — excluded)`);
  console.log(
    `  pages scanned: ${r.pages} · compliant: ${r.compliant} · redirect-only: ${r.redirectOnly}` +
      ` · baselined: ${r.baselined} · exempt: ${r.exempt}`,
  );
  if (r.violations.length > 0) {
    console.error('\nPages not on PageLayout:');
    for (const v of r.violations) console.error(`  ${v.file}\n    ${v.reason}`);
    console.error(
      '\nFix: build the page on PageLayout, or add `// page-template: delegated to <view file>[, <view file>]`' +
        ' (every named file must exist and render <PageLayout>), or `// page-template:exempt — <reason>`.' +
        ' New pages cannot be added to the baseline.',
    );
  }
  if (r.stale.length > 0) {
    console.error('\nStale baseline entries (now compliant, or the file is gone) — remove them:');
    for (const s of r.stale) console.error(`  ${s}`);
    console.error('  Run: pnpm exec tsx scripts/verify-page-template.ts --write-baseline');
  }
  void root;
}

function main(): number {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write-baseline');
  const force = argv.includes('--force');
  const rest = argv.filter((a) => a !== '--write-baseline' && a !== '--force');
  let root: string;
  try {
    root = parseRootArg(rest) ?? repoRoot;
  } catch (e) {
    if (e instanceof RootArgError) {
      console.error(`Page-template guard could not check — ${e.message}`);
      return 2;
    }
    throw e;
  }

  if (write) {
    const current = existsSync(root === repoRoot ? BASELINE_PATH : resolve(root, 'scripts/page-template-baseline.json'))
      ? loadBaseline(root)
      : null;
    const r = scan(root, []);
    if (r.status === 2) {
      report(root, r);
      return 2;
    }
    const next = [...r.failing].sort();
    const added = next.filter((p) => !(current ?? []).includes(p));
    if (added.length > 0 && current !== null && !force) {
      console.error('--write-baseline would GROW the baseline:');
      for (const a of added) console.error(`  ${a}`);
      console.error('Build the page on PageLayout instead. If deliberate, re-run with --force and justify it.');
      return 1;
    }
    const target = root === repoRoot ? BASELINE_PATH : resolve(root, 'scripts/page-template-baseline.json');
    writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Baseline written: ${next.length} page(s) (+${added.length}).`);
    return 0;
  }

  const r = scan(root);
  report(root, r);
  return r.status;
}

if (isMainModule(import.meta.url)) {
  process.exit(main());
}

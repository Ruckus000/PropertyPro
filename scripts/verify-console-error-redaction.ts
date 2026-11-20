#!/usr/bin/env tsx
/**
 * Guard: server-side `console.error` / `console.warn` must not pass raw error
 * values — the Vercel function-log channel of #951/#1092.
 *
 * ## What this catches
 *
 * `scrubServerEvent` scrubs the Sentry EVENT in `beforeSend`; it cannot reach
 * the console write itself, which is what Vercel function logs capture.
 * Drizzle's `DrizzleQueryError` embeds the full SQL AND its bound parameter
 * values (tenant emails, plaintext invite tokens, row contents) in
 * `error.message` after a `params: ` marker, so `console.error('x', error)` or
 * ``console.error(`x: ${error.message}`)`` ships all of it to the logs.
 * Measurement + fix history: docs/audits/sentry-request-body-capture-2026-09-08.md.
 *
 * The fix at each site is `formatErrorForLog(err)` (redacted message, stack
 * frames kept) or `redactParams(str)` from `@propertypro/shared/observability`.
 * The two central handlers (`apps/web/src/lib/api/error-handler.ts`,
 * `apps/admin/src/lib/api/with-error-handler.ts`) already do this and cover
 * every unhandled route error; this guard keeps the satellite sites from
 * regrowing and ratchets the frozen baseline down.
 *
 * ## Relationship to `verify-admin-error-leakage.ts`
 *
 * That guard governs error text in RESPONSE BODIES and explicitly ALLOWS
 * `console.error(..., err.message)` — server logging is the right place for
 * detail. This guard governs the LOG channel and requires that detail to be
 * redacted first. Different doors; neither contradicts the other.
 *
 * ## Scope
 *
 * - Roots: `apps/web/src` + `apps/admin/src` (server + shared code).
 * - `'use client'` files are skipped. Precisely: client modules DO run on the
 *   server during SSR (their console writes reach function stdout), but the
 *   drizzle-`params:` leak class cannot occur in them — no database client,
 *   and browser events have their own scrubber. See the scanner lib's note.
 * - `console.log`/`console.info` are not scanned: the leak class is caught
 *   error text, which by convention goes through error/warn.
 * - Escape hatch: `// log-redact:exempt — <reason>` — placement matters: on
 *   the call's FIRST line or on a violating argument's own line. A comment on
 *   the line ABOVE the call does NOT exempt it (same on-line convention as
 *   `design-tokens:exempt` / `admin-error-leak:exempt`), and a fixture pins
 *   that semantics.
 *
 * ## Known misses (heuristic-inherent; none has an instance in the roots today)
 *
 * Name-based detection cannot see: pre-materialized aliases (`const m =
 * err.message; console.error('x', m)`), destructuring (`const { message } =
 * err`), error-PREFIXED names (`errorBody.message`), computed access
 * (`console['error'](err)` — not even counted as a site), non-console writes
 * (`process.stdout.write`), `console.trace`/`console.debug`, and custom logger
 * wrappers. The baseline + drain posture bounds the existing population; new
 * leaks in these shapes would need a review-time catch, not this guard.
 *
 * ## Baseline
 *
 * Sites that predate the guard are frozen shrink-only in
 * `scripts/console-redaction-baseline.json` (per-file counts). New files must
 * be clean; a file may never exceed its frozen count. Re-run with
 * `--write-baseline` in a reviewed PR whenever a drain lands. Caveat (same as
 * design-tokens): ceilings are counts, not pinned lines.
 *
 * Drain the sites that can actually bind drizzle params FIRST — at
 * introduction (2026-11-20) those are `apps/web/src/lib/services/esign/
 * completion.ts` (catch around finalize-path scoped writes) and
 * `apps/web/src/lib/services/claim-root-service.ts` (raw objects around claim
 * transactions). The rest
 * are vendor strings (Resend/Supabase/Twilio) or static text — lower value.
 *
 * ## Exits (tri-state, per .claude/rules/verification.md)
 *
 * 0 clean · 1 violations · 2 could-not-check (missing root, or the TS parser
 * reported syntax errors — a scan that cannot parse refuses to vouch).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSource, EXEMPT, type ScanViolation } from './lib/console-error-redaction';

const ROOTS = ['apps/web/src', 'apps/admin/src'];
const BASELINE_PATH = 'scripts/console-redaction-baseline.json';
const WRITE = process.argv.includes('--write-baseline');

interface FileViolations {
  file: string;
  violations: ScanViolation[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function main(): number {
  for (const root of ROOTS) {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      console.error(`[console-error-redaction] search root missing: ${root} — refusing to pass.`);
      return 2;
    }
  }

  const files: string[] = [];
  for (const root of ROOTS) walk(root, files);
  if (files.length === 0) {
    console.error('[console-error-redaction] found 0 source files — refusing to pass.');
    return 2;
  }

  const parseFailures: string[] = [];
  const byFile: FileViolations[] = [];
  let sites = 0;
  let clientFiles = 0;

  for (const file of files) {
    const rel = relative(process.cwd(), file).split('\\').join('/');
    const source = readFileSync(file, 'utf8');
    const result = scanSource(rel, source);
    if (result.parseFailed) parseFailures.push(rel);
    if (result.isClient) clientFiles += 1;
    sites += result.sites;
    if (result.violations.length > 0) {
      byFile.push({ file: rel, violations: result.violations });
    }
  }

  if (parseFailures.length > 0) {
    console.error(
      `[console-error-redaction] the TypeScript parser reported syntax errors in ${parseFailures.length} file(s) — refusing to vouch for the scan:`,
    );
    for (const f of parseFailures.slice(0, 20)) console.error(`  ${f}`);
    return 2;
  }

  if (sites === 0) {
    // 2,000+ server files with zero console.error/warn calls means the scanner
    // stopped seeing calls, not that the tree is clean.
    console.error('[console-error-redaction] found 0 console.error/warn sites — refusing to pass.');
    return 2;
  }

  const counts: Record<string, number> = {};
  for (const { file, violations } of byFile) counts[file] = violations.length;
  const totalViolations = byFile.reduce((n, f) => n + f.violations.length, 0);

  console.log(
    `[console-error-redaction] files scanned: ${files.length} (client skipped: ${clientFiles}) · `
    + `console.error/warn sites: ${sites} · violations: ${totalViolations}`,
  );

  if (WRITE) {
    const sorted: Record<string, number> = {};
    for (const key of Object.keys(counts).sort()) sorted[key] = counts[key]!;
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    console.log(
      `[console-error-redaction] baseline written to ${BASELINE_PATH} (${Object.keys(sorted).length} files, ${totalViolations} sites)`,
    );
    return 0;
  }

  let baseline: Record<string, number> = {};
  if (existsSync(BASELINE_PATH)) {
    try {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>;
    } catch (e) {
      console.error(`[console-error-redaction] baseline unreadable: ${(e as Error).message}`);
      return 2;
    }
  } else if (totalViolations > 0) {
    console.error(
      `[console-error-redaction] no baseline at ${BASELINE_PATH} but ${totalViolations} violation(s) found. `
      + 'Review them, fix or accept, then run `pnpm guard:console-error-redaction -- --write-baseline` in a reviewed PR.',
    );
    for (const { file, violations } of byFile) {
      for (const v of violations) console.error(`  ${file}:${v.line}  ${v.text}`);
    }
    return 1;
  }

  // Shrink-only comparison: per-file counts may never exceed the frozen ceiling.
  const over: FileViolations[] = [];
  for (const entry of byFile) {
    const ceiling = baseline[entry.file] ?? 0;
    if (entry.violations.length > ceiling) over.push(entry);
  }

  if (over.length > 0) {
    console.error(
      `[console-error-redaction] ${over.length} file(s) exceed their frozen baseline `
      + `(escape hatch: \`// ${EXEMPT} — <reason>\`; wrappers: formatErrorForLog / redactParams):`,
    );
    for (const { file, violations } of over) {
      const ceiling = baseline[file] ?? 0;
      console.error(`  ${file} — ${violations.length} violation(s), baseline ${ceiling}`);
      for (const v of violations) console.error(`    :${v.line}  ${v.text}`);
    }
    return 1;
  }

  const under = Object.entries(baseline).filter(([file, n]) => (counts[file] ?? 0) < n);
  if (under.length > 0) {
    console.log(
      `[console-error-redaction] ${under.length} file(s) are below their ceiling — ratchet the baseline down with --write-baseline:`,
    );
    for (const [file, n] of under) console.log(`  ${file}: ${counts[file] ?? 0} < ${n}`);
  }

  return 0;
}

process.exit(main());

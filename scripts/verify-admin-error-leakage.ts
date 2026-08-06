#!/usr/bin/env tsx
/**
 * Guard: admin API routes must not put a caught error's `.message` into a
 * response body.
 *
 * ## What this catches
 *
 * `withAdminErrorHandler` guarantees that anything which ESCAPES a handler
 * becomes `{ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error
 * occurred' } }`. It cannot govern what a handler chooses to `return`. Admin
 * routes accumulated 54 such sites across 29 files, of the shape
 *
 * ```ts
 * if (error) {
 *   return NextResponse.json({ error: { message: error.message } }, { status: 500 });
 * }
 * ```
 *
 * where `error.message` is a raw PostgREST / Postgres / Storage / Stripe
 * string naming tables, columns, constraints and account identifiers. The
 * wrapper never saw them, so the contract silently did not hold.
 *
 * The fix is `assertNoDbError(error, context)` (throw, let the wrapper answer)
 * or an explicit `AppError` subclass for outcomes the caller is meant to see.
 * This guard exists so the 54 do not become 55.
 *
 * ## What is allowed
 *
 * - Zod issue messages (`parsed.error.issues[0].message`, `i.message` inside a
 *   `.map`) — authored validation text, written to be read by the caller.
 * - `console.error(..., err.message)` — server-side logging, not a response.
 * - A `.message` read from a project-owned domain error class listed in
 *   `ALLOWED_DOMAIN_ERRORS` — e.g. `RoleOpForbiddenError`, whose message is a
 *   deliberate, user-facing explanation of a 403.
 *
 * Escape hatch: `// admin-error-leak:exempt — <reason>` on the offending line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = 'apps/admin/src/app/api';
const EXEMPT = 'admin-error-leak:exempt';

/**
 * Error classes whose `.message` is authored by this project specifically to be
 * shown to the caller. Add here only when the message is a written sentence,
 * not a database or vendor string.
 */
const ALLOWED_DOMAIN_ERRORS = ['RoleOpForbiddenError'];

/**
 * Any `.message` read. Deliberately NOT anchored to a bare identifier: a first
 * attempt used `/\b[A-Za-z_$][\w$]*\.message\b/`, which silently missed
 * `(error as Error).message` and `(err as PostgrestError).message` — the exact
 * shape a TypeScript author reaches for when the caught value is `unknown`.
 * A revert-check caught it. The allow-rules below do the narrowing instead.
 */
const MESSAGE_READ = /\.message\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

/**
 * True when this line puts a `.message` into something being returned to the
 * client. Deliberately line-scoped and conservative: a response body in this
 * codebase is always built inline in a `NextResponse.json(...)` call that spans
 * at most a few lines, and the `message:` / `error:` key is on the same line as
 * the `.message` read in every real case.
 */
function isResponseBodyLine(line: string, precedingLines: string[] = []): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('*') || trimmed.startsWith('//')) return false;
  if (!MESSAGE_READ.test(trimmed)) return false;

  // Server-side logging is fine — that is where the real message belongs.
  if (/^(console\.(error|warn|log|info)|captureMessage|captureException)\s*\(/.test(trimmed)) {
    return false;
  }

  // Zod validation text is authored, not vendor-generated. Requires the Zod
  // context ON THE LINE — an earlier version also allowed a bare `e.message`,
  // which meant the single most idiomatic leak in the language walked straight
  // through the guard whose entire job is to stop it:
  //
  //   } catch (e) {
  //     return NextResponse.json({ error: { message: (e as Error).message } }, …);
  //
  // `i.message` keeps its allowance because it only ever appears inside
  // `.issues.map((i) => ({ field, message: i.message }))`, which the `.issues`
  // clause on the enclosing lines does not always reach.
  if (/\.issues\b/.test(trimmed) || /\bi\.message\b/.test(trimmed)) {
    return false;
  }

  // A project-owned domain error's message. The narrowing `instanceof` sits a
  // few lines above the response in the real shape:
  //
  //   if (err instanceof RoleOpForbiddenError) {
  //     return NextResponse.json(
  //       { error: { code: 'FORBIDDEN', message: err.message } },
  //
  // so look back over the enclosing branch, not just this line.
  const window = [line, ...precedingLines];
  if (
    ALLOWED_DOMAIN_ERRORS.some((cls) =>
      window.some((l) => new RegExp(`instanceof\\s+${cls}\\b`).test(l)),
    )
  ) {
    return false;
  }

  return (
    /\bmessage:\s*[^,\n]*\.message\b/.test(trimmed) ||
    /\berror:\s*[^,\n]*\.message\b/.test(trimmed) ||
    /NextResponse\.json\([^)]*\.message/.test(trimmed)
  );
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(API_ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes(EXEMPT)) return;
      // Allow the exemption on the line above, for multi-line JSON bodies.
      if (i > 0 && lines[i - 1]!.includes(EXEMPT)) return;
      // Four lines is enough for `if (err instanceof X) { return NextResponse.json(`
      // and never wide enough to reach an unrelated branch.
      if (isResponseBodyLine(line, lines.slice(Math.max(0, i - 4), i))) {
        violations.push({ file: relative('.', file), line: i + 1, text: line.trim() });
      }
    });
  }
  return violations;
}

/**
 * The guard is only worth anything if it would have caught the original bug, so
 * it checks itself against the exact shape that was drained before scanning.
 */
function selfTest(): void {
  const shouldFlag = [
    `    return NextResponse.json({ error: { message: error.message } }, { status: 500 });`,
    `      { error: { code: 'INTERNAL_ERROR', message: error.message } },`,
    `    return NextResponse.json({ error: uploadError.message }, { status: 500 });`,
    `      { error: { message: \`Snapshot failed: \${snapErr.message}\` } },`,
    // The cast form. Missed by the original identifier-anchored regex.
    `    return NextResponse.json({ error: { message: (error as Error).message } }, { status: 500 });`,
    // `catch (e)` is idiomatic, and a blanket `e.message` allowance let it pass.
    `    return NextResponse.json({ error: { message: (e as Error).message } }, { status: 500 });`,
    `      { error: { code: 'INTERNAL_ERROR', message: e.message } },`,
  ];
  const shouldPass = [
    `    console.error('[admin] plan update failed:', updateError.message);`,
    `      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'x' } },`,
    `            message: i.message,`,
    `    assertNoDbError(error, 'Failed to list access plans');`,
  ];

  for (const line of shouldFlag) {
    if (!isResponseBodyLine(line)) {
      console.error(`SELFTEST FAILED — should flag but did not:\n  ${line}`);
      process.exit(2);
    }
  }
  // The domain-error allowance is window-based, so exercise it as a window.
  if (
    isResponseBodyLine(`        { error: { code: 'FORBIDDEN', message: err.message } },`, [
      `      return NextResponse.json(`,
      `    if (err instanceof RoleOpForbiddenError) {`,
    ])
  ) {
    console.error('SELFTEST FAILED — RoleOpForbiddenError message should be allowed');
    process.exit(2);
  }

  for (const line of shouldPass) {
    if (isResponseBodyLine(line)) {
      console.error(`SELFTEST FAILED — should pass but was flagged:\n  ${line}`);
      process.exit(2);
    }
  }
}

selfTest();

const violations = scan();
if (violations.length > 0) {
  console.error(
    `\n✗ admin error leakage: ${violations.length} response(s) return a raw error message.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.text}`);
  }
  console.error(
    `\nUse assertNoDbError(error, '<what failed>') from '@/lib/api/assert-no-db-error' so\n` +
      `withAdminErrorHandler returns the opaque 500 and Sentry gets the real message,\n` +
      `or throw an AppError subclass when the caller is meant to read it.\n` +
      `Escape hatch: // ${EXEMPT} — <reason>\n`,
  );
  process.exit(1);
}

console.log('✓ admin error leakage: no raw error messages in API responses');

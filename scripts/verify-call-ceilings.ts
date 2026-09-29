/**
 * `pnpm guard:call-ceilings` — shrink-only PER-FILE ceilings on two call shapes
 * (roadmap rows 2.6 / DBB-04 and 2.7 / PAG-08).
 *
 * WHY
 * ---
 * Rule `unscoped` — calls to `createUnscopedClient(…)`. `guard:authz-comments`
 * requires one `// AUTHZ:` comment above each `@propertypro/db/unsafe` import,
 * and one comment covers EVERY call in the file. Measured with the parser on
 * main b83f5c9: 236 calls in 69 non-test files (a text grep finds 245 — the
 * other 9 are docblock mentions), five of which hold 94 (account-lifecycle-
 * service 27, provisioning-service 21, stripe-webhook-service 16,
 * export/export-job-service 15, billing/billing-group-service 15). Any of those
 * files could add an unrelated privileged, tenant-crossing call with every
 * guard green. A per-file count makes that addition a reviewed decision.
 *
 * Rule `fullTableRead` — `<expr>.query(<Identifier>)` with exactly one
 * argument that is a bare identifier. On a scoped client that reads the WHOLE
 * community table, unfiltered and unlimited, by definition. "Unbounded list
 * endpoint" (PAG-08) is not statically decidable, so this is the precise
 * proxy for it: 55 such calls in 28 files once the 19 `.query(communities)`
 * calls are EXCLUDED (one row under scope, benign); a text grep finds 61, the
 * other 6 being comment mentions.
 *
 * WHAT IT CANNOT SEE
 * ------------------
 * - `selectFrom(…)` / `queryWhere(…)` / raw drizzle chains with no `.limit()`
 *   are just as unbounded and are not counted — whether a predicate bounds the
 *   result set is a runtime property.
 * - `.query(someVariable)` where the variable holds a table is counted; a
 *   `.query(tables.x)` property access or `.query(pick())` call is not.
 * - Any `.query(x)` with one identifier argument is counted regardless of the
 *   receiver's type — the parser has no type information. In practice the only
 *   `.query` in these trees is the scoped client's.
 * - It counts CALLS, not privilege: renaming, aliasing (`const u =
 *   createUnscopedClient; u()`) or wrapping the call in a helper in another
 *   file moves the count rather than removing the access.
 * - Only `apps/web/src` and `apps/admin/src`; tests are excluded.
 *
 * Calls are found with the TypeScript parser, so a call written in a comment
 * or a string never counts; a file that fails to parse refuses (exit 2).
 *
 * SEMANTICS (baseline `scripts/call-ceilings-baseline.json`)
 * ---------------------------------------------------------
 * - count > ceiling                        → FAIL
 * - count < ceiling                        → pass, "lower it" hint
 * - baselined file/rule now 0 or deleted   → STALE → FAIL (ratchet it in the
 *   same PR that removed the calls)
 * - file/rule absent from baseline, count > 0 → FAIL
 *
 * HOW TO SHRINK / GROW
 * --------------------
 * Shrink: `pnpm exec tsx scripts/verify-call-ceilings.ts --write-baseline`.
 * Grow (new file, higher count): the same with `--force`, in a reviewed commit
 * that says why. Without `--force`, `--write-baseline` refuses any growth.
 * For `fullTableRead`, fixing the reads themselves is roadmap Phase 3.7
 * (PAG-02…07/10); this guard only stops the number rising meanwhile.
 *
 * Exit: 0 clean · 1 violations · 2 could not check (missing root, unreadable
 * entry, parse failure, zero calls counted for either rule).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { checkCeiling } from './lib/ceiling';
import { parseOrNull } from './lib/comment-ranges';
import { isMainModule } from './lib/is-main-module';

export const SCAN_ROOTS = ['apps/web/src', 'apps/admin/src'] as const;
export const RULES = ['unscoped', 'fullTableRead'] as const;
export type Rule = (typeof RULES)[number];
export type FileCounts = Partial<Record<Rule, number>>;
export type Baseline = Record<string, FileCounts>;

export const BASELINE_REL = 'scripts/call-ceilings-baseline.json';
const EXCLUDED_TABLE_IDENTIFIERS = new Set(['communities']);

const GUIDANCE: Record<Rule, string> = {
  unscoped:
    'Prefer createScopedClient(communityId); if the cross-tenant read is genuinely needed, ' +
    'put it behind a named, documented function rather than another inline call.',
  fullTableRead:
    'Push the filter into SQL (queryWhere/selectFrom with a predicate and a limit, or paginate()) ' +
    'instead of reading the whole community table.',
};

/** Pure per-file counter. `null` means the file did not parse. */
export function countCalls(fileName: string, source: string): Record<Rule, number> | null {
  const sf = parseOrNull(fileName, source);
  if (sf === null) return null;
  const counts: Record<Rule, number> = { unscoped: 0, fullTableRead: 0 };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'createUnscopedClient') {
        counts.unscoped += 1;
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'query' &&
        node.arguments.length === 1 &&
        ts.isIdentifier(node.arguments[0]!) &&
        !EXCLUDED_TABLE_IDENTIFIERS.has((node.arguments[0] as ts.Identifier).text)
      ) {
        counts.fullTableRead += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return counts;
}

function isScannable(name: string): boolean {
  if (!/\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts')) return false;
  return !/\.(test|spec)\.(ts|tsx)$/.test(name);
}

/** Walk a root; throws on any read/stat error (never swallowed into "empty"). */
function walk(absDir: string, out: string[]): void {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(abs, out);
    } else if (entry.isFile()) {
      if (isScannable(entry.name)) out.push(abs);
    } else {
      // Symlink or other: refuse rather than guess what it points at.
      throw new Error(`unexpected non-regular entry ${abs}`);
    }
  }
}

export type Measurement =
  | { ok: true; counts: Map<string, Record<Rule, number>>; filesScanned: number }
  | { ok: false; reason: string };

/** Measure the tree. Every "could not check" path returns `ok: false`. */
export function measure(repoRoot: string): Measurement {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) return { ok: false, reason: `scan root ${root} does not exist` };
    try {
      walk(abs, files);
    } catch (err) {
      return { ok: false, reason: `could not walk ${root}: ${String(err)}` };
    }
  }
  const counts = new Map<string, Record<Rule, number>>();
  const totals: Record<Rule, number> = { unscoped: 0, fullTableRead: 0 };
  for (const abs of files.sort()) {
    const rel = relative(repoRoot, abs).split(sep).join('/');
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch (err) {
      return { ok: false, reason: `could not read ${rel}: ${String(err)}` };
    }
    const c = countCalls(rel, source);
    if (c === null) return { ok: false, reason: `${rel} did not parse` };
    if (c.unscoped > 0 || c.fullTableRead > 0) counts.set(rel, c);
    totals.unscoped += c.unscoped;
    totals.fullTableRead += c.fullTableRead;
  }
  for (const rule of RULES) {
    if (totals[rule] === 0) {
      return { ok: false, reason: `zero ${rule} calls counted across ${files.length} files — the scan found nothing` };
    }
  }
  return { ok: true, counts, filesScanned: files.length };
}

/** The baseline a clean write would produce: every non-zero count, sorted keys. */
export function baselineFrom(counts: Map<string, Record<Rule, number>>): Baseline {
  const out: Baseline = {};
  for (const file of [...counts.keys()].sort()) {
    const c = counts.get(file)!;
    const entry: FileCounts = {};
    for (const rule of RULES) if (c[rule] > 0) entry[rule] = c[rule];
    if (Object.keys(entry).length > 0) out[file] = entry;
  }
  return out;
}

/**
 * Decide whether `--write-baseline` may replace `previous` with `next`.
 * Any entry added or count raised is growth, refused without `force`.
 */
export function planBaselineWrite(
  previous: Baseline,
  next: Baseline,
  force: boolean,
): { ok: boolean; growth: string[] } {
  const growth: string[] = [];
  for (const [file, entry] of Object.entries(next)) {
    for (const rule of RULES) {
      const n = entry[rule] ?? 0;
      const p = previous[file]?.[rule] ?? 0;
      if (n > p) growth.push(`${file} ${rule}: ${p} → ${n}`);
    }
  }
  return { ok: growth.length === 0 || force, growth };
}

/** Compare the tree against `baseline`. Returns the exit code; prints findings. */
export function checkCallCeilings(repoRoot: string, baseline: Baseline): 0 | 1 | 2 {
  const m = measure(repoRoot);
  if (!m.ok) {
    console.error(`\n❌ guard:call-ceilings could not check: ${m.reason} (exit 2).`);
    return 2;
  }

  const failures: string[] = [];
  const hints: string[] = [];
  const totals: Record<Rule, number> = { unscoped: 0, fullTableRead: 0 };
  const filesWithCalls: Record<Rule, number> = { unscoped: 0, fullTableRead: 0 };

  for (const [file, c] of m.counts) {
    for (const rule of RULES) {
      const actual = c[rule];
      if (actual === 0) continue;
      totals[rule] += actual;
      filesWithCalls[rule] += 1;
      const ceiling = baseline[file]?.[rule];
      if (ceiling === undefined) {
        failures.push(
          `${file} [${rule}]: ${actual} call(s), and this file has no ${rule} ceiling. ${GUIDANCE[rule]} ` +
            'A new entry needs `--write-baseline --force` in a reviewed commit that says why.',
        );
        continue;
      }
      const res = checkCeiling(`${file} [${rule}]`, actual, ceiling, GUIDANCE[rule]);
      if (res.failed) failures.push(res.message);
      else if (res.message) hints.push(res.message);
    }
  }

  for (const [file, entry] of Object.entries(baseline)) {
    for (const rule of RULES) {
      const ceiling = entry[rule];
      if (ceiling === undefined) continue;
      const actual = m.counts.get(file)?.[rule] ?? 0;
      if (actual === 0) {
        failures.push(
          `${file} [${rule}]: STALE — baselined at ${ceiling} but the file now has none` +
            `${existsSync(join(repoRoot, file)) ? '' : ' (file deleted)'}. ` +
            'Ratchet it: `pnpm exec tsx scripts/verify-call-ceilings.ts --write-baseline`.',
        );
      }
    }
  }

  console.log(
    `guard:call-ceilings — scanned ${m.filesScanned} files; ` +
      `unscoped: ${totals.unscoped} calls in ${filesWithCalls.unscoped} files; ` +
      `fullTableRead: ${totals.fullTableRead} calls in ${filesWithCalls.fullTableRead} files; ` +
      `baselined files: ${Object.keys(baseline).length}.`,
  );
  for (const h of hints) console.log(`  ℹ ${h}`);

  if (failures.length > 0) {
    console.error(`\n❌ guard:call-ceilings: ${failures.length} violation(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log('✅ guard:call-ceilings: every file is at or under its ceiling.');
  return 0;
}

export function loadBaseline(path: string): Baseline {
  return JSON.parse(readFileSync(path, 'utf-8')) as Baseline;
}

function main(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const baselinePath = join(repoRoot, BASELINE_REL);
  const writeBaseline = process.argv.includes('--write-baseline');
  const force = process.argv.includes('--force');

  let baseline: Baseline = {};
  const baselineExists = existsSync(baselinePath);
  if (baselineExists) {
    try {
      baseline = loadBaseline(baselinePath);
    } catch (err) {
      console.error(`\n❌ Could not read ${BASELINE_REL}: ${String(err)} (exit 2).`);
      process.exit(2);
    }
  } else if (!writeBaseline) {
    console.error(`\n❌ ${BASELINE_REL} is missing (exit 2).`);
    process.exit(2);
  }

  if (writeBaseline) {
    const m = measure(repoRoot);
    if (!m.ok) {
      console.error(`\n❌ guard:call-ceilings could not check: ${m.reason} (exit 2).`);
      process.exit(2);
    }
    const next = baselineFrom(m.counts);
    const plan = planBaselineWrite(baseline, next, force);
    if (!plan.ok) {
      console.error(`\n❌ --write-baseline would RAISE ${plan.growth.length} ceiling(s):`);
      for (const g of plan.growth) console.error(`  - ${g}`);
      console.error('   If that is deliberate, re-run with --force in a reviewed commit that says why.');
      process.exit(1);
    }
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${BASELINE_REL} (${Object.keys(next).length} files).`);
    process.exit(0);
  }

  process.exit(checkCallCeilings(repoRoot, baseline));
}

if (isMainModule(import.meta.url)) main();

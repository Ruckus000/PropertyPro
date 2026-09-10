#!/usr/bin/env tsx
/**
 * guard:admin-community-scope — every `communities` / `user_roles` read in
 * `apps/admin/src/lib/server/` must carry the real-community predicate.
 *
 *   pnpm guard:admin-community-scope
 *
 * WHY THIS EXISTS
 * ---------------
 * Wave 2 of the admin console redesign shipped a dashboard whose Members KPI
 * headline and Members sparkline counted DIFFERENT POPULATIONS. The headline
 * scoped to real communities (`.in('community_id', realIds)`, where `realIds`
 * comes from `communities` filtered by `is_demo = false` and
 * `deleted_at is null`); the chart read all of `user_roles` unfiltered, so it
 * counted members of demo and soft-deleted communities the headline excluded.
 * The chart's last point could therefore never equal the headline it sat under.
 *
 * Four gates missed it, and none of them was broken: the defect is not visible
 * in any single diff. It lives in the RELATIONSHIP between two sibling files —
 * `dashboard.ts` and `dashboard-series.ts` — each of which reads correctly on
 * its own terms. A second instance of the same class was then found in
 * `search/users.ts`, where the command palette resolved a user's newest
 * membership without excluding soft-deleted communities and deep-linked to a
 * page that calls `notFound()`. Production data confirmed that one was live.
 *
 * WHAT THIS GUARD DOES AND DOES NOT PROVE
 * ---------------------------------------
 * It CANNOT prove that two reads mean the same thing — that two sibling files
 * count the same population. That was considered and rejected: there is no
 * structural marker for "same population", and inventing one would be novel
 * machinery guarding a single pair of files.
 *
 * It proves the weaker, structurally checkable thing: **no read of these two
 * tables is silently unscoped.** Both live defects would have failed it. A
 * future read that forgets the predicate cannot reach main without either
 * carrying it or writing down, at the call site, why it is correct without it.
 *
 * THE UNIT OF ANALYSIS IS THE FLUENT CALL CHAIN
 * ---------------------------------------------
 * Not the line, and not the enclosing statement.
 *
 *  - **Statement scope is wrong**, and using it would defeat the guard on the
 *    exact file that motivated it: `dashboard.ts` wraps five separate reads
 *    inside ONE `await Promise.all([...])` statement. Under statement scope,
 *    one read's `is_demo` filter would vouch for a sibling read that has none —
 *    which is precisely the failure being guarded against, one file over.
 *  - **Line scope is wrong** because the chains are multi-line.
 *
 * A chain is built by ascending from the table literal to the outermost
 * expression still rooted at that literal's own call, so it stops cleanly at an
 * array element, a conditional branch, or an `await`. Sibling reads inside one
 * `Promise.all` therefore never bleed into each other.
 *
 * FINDING A READ: NOT KEYED ON `.from(...)`
 * -----------------------------------------
 * A read is any string literal whose EXACT text is `communities` or
 * `user_roles`, wherever it appears. Matching only inside `.from(...)` would
 * miss two reads that reach `user_roles` through a helper:
 *
 *     fetchRowsInPages<CreatedAtRow>(db, 'user_roles', 'created_at',
 *                                    'community_id', realCommunityIds, …)
 *
 * one of which is the members series — the single read this entire remediation
 * exists to protect.
 *
 * EXACT LITERALS, NEVER SUBSTRINGS
 * --------------------------------
 * Markers are matched against exact string-literal VALUES inside the chain,
 * never against substrings of the source text. `search/users.ts` selects
 * `'user_id, community_id'` — one literal that CONTAINS `community_id` but
 * scopes nothing. A substring check passes that read; exact-literal matching
 * correctly flags it (it carries an exempt, for a reason recorded there).
 *
 * Exit codes:
 *   0 — every read carries its predicate (or a reasoned exempt)
 *   1 — at least one read is unscoped
 *   2 — COULD NOT CHECK (missing root, zero files, zero reads, a file that
 *       failed to parse, or a broken parse-failure detector). It refuses to
 *       report success from a tree it did not actually examine.
 *
 * Escape hatch: `admin-community-scope:exempt — <reason>` on any line within
 * the chain's line span, or on the line immediately above it. The reason is
 * MANDATORY: a bare marker with nothing after the em dash does not suppress
 * the violation.
 *
 * Flags: `--selftest` runs only the fixtures (they also run unconditionally
 * before every real scan); `--root <dir>` overrides the search root, which is
 * how the broken-environment direction of the verification is exercised.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROOT_REL = 'apps/admin/src/lib/server';

/** The tables whose reads must be scoped, and the literals that scope them. */
const REQUIRED_MARKERS: Record<string, readonly string[]> = {
  // A "real" community is non-demo and not soft-deleted. Both halves matter:
  // `is_demo` alone still counts communities an operator deleted, and
  // `deleted_at` alone still counts seeded demos.
  communities: ['is_demo', 'deleted_at'],
  // A `user_roles` read is scoped by the community set it is restricted to.
  user_roles: ['community_id'],
};
const TABLES = Object.keys(REQUIRED_MARKERS);

const EXEMPT_MARKER = 'admin-community-scope:exempt';
/** Marker + em dash + a non-empty reason. The reason is not optional. */
const EXEMPT_WITH_REASON = /admin-community-scope:exempt\s*—\s*(\S.*)$/;

function fail(msg: string): never {
  console.error(`guard:admin-community-scope — ${msg}`);
  process.exit(2);
}

// ── Pure scan ────────────────────────────────────────────────────────────────

export interface TableRead {
  table: string;
  /** 1-based line of the chain's first character. */
  startLine: number;
  /** 1-based line of the chain's last character. */
  endLine: number;
  /** Exact string-literal values appearing anywhere inside the chain. */
  literals: string[];
  exempt: boolean;
  /** An exempt marker was present but carried no reason, so it did not apply. */
  reasonlessExempt: boolean;
  missing: string[];
}

export interface ScanResult {
  reads: TableRead[];
  violations: TableRead[];
  /** `sourceFile.parseDiagnostics.length`, or -1 if the detector is unavailable. */
  syntaxErrors: number;
}

/**
 * Ascend from a table literal to the outermost expression still rooted at this
 * literal's own call.
 *
 * 1. The literal is an argument of a `CallExpression` (`db.from('x')` or
 *    `fetchRowsInPages(db, 'x', …)`) — ascend to that call.
 * 2. While the parent is a `PropertyAccessExpression` or `CallExpression` whose
 *    `.expression` IS the current node, ascend. That is what walks
 *    `.select().eq().is()` to its end.
 * 3. Stop otherwise — at an array element, a conditional branch, an `await`, a
 *    parenthesis, a variable declaration.
 *
 * Step 2's identity check (`parent.expression === current`) is what keeps
 * sibling reads apart: an element of `Promise.all([a, b])` is an ARGUMENT of
 * the outer call, never its `.expression`, so the walk never escapes into it.
 */
function chainRoot(literal: ts.Node): ts.Node {
  let current: ts.Node = literal;
  const parent = current.parent;
  if (parent !== undefined && ts.isCallExpression(parent) && parent.arguments.some((a) => a === current)) {
    current = parent;
  }
  for (;;) {
    const next: ts.Node | undefined = current.parent;
    if (next === undefined) break;
    if (ts.isPropertyAccessExpression(next) && next.expression === current) {
      current = next;
      continue;
    }
    if (ts.isCallExpression(next) && next.expression === current) {
      current = next;
      continue;
    }
    break;
  }
  return current;
}

/** Every exact string-literal value inside a subtree. */
function literalsIn(node: ts.Node): string[] {
  const out: string[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isStringLiteralLike(n)) out.push(n.text);
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/**
 * Scan one source. Exported shape mirrors `extractClasses` in
 * verify-web-class-resolution.ts: the selftest drives THIS function with inline
 * fixtures, so the fixtures exercise the same code path the real scan uses.
 */
export function scanSource(fileName: string, source: string): ScanResult {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = source.split('\n');
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const reads: TableRead[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && TABLES.includes(node.text)) {
      const table = node.text;
      const chain = chainRoot(node);
      const startLine = lineOf(chain.getStart(sf));
      const endLine = lineOf(chain.getEnd());
      const literals = literalsIn(chain);
      const required = REQUIRED_MARKERS[table] ?? [];
      const missing = required.filter((marker) => !literals.includes(marker));

      // The chain's own line span, plus the line immediately above it.
      const span = lines.slice(Math.max(0, startLine - 2), endLine);
      const exempt = span.some((l) => EXEMPT_WITH_REASON.test(l));
      const reasonlessExempt = !exempt && span.some((l) => l.includes(EXEMPT_MARKER));

      reads.push({ table, startLine, endLine, literals, exempt, reasonlessExempt, missing });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  return {
    reads,
    violations: reads.filter((r) => r.missing.length > 0 && !r.exempt),
    syntaxErrors: Array.isArray(diagnostics) ? diagnostics.length : -1,
  };
}

/**
 * Prove the parse-failure detector actually detects. `parseDiagnostics` is a TS
 * INTERNAL: if a version bump renamed it, every file would read as clean and
 * this guard would vouch for a tree it never parsed. Same proof shape as
 * verify-web-class-resolution.ts's `parserSelfTest`.
 */
export function parserSelfTest(): boolean {
  const broken = scanSource('selftest.ts', `const a = db.from('communities'`);
  const clean = scanSource('selftest.ts', `const a = db.from('communities');`);
  return broken.syntaxErrors > 0 && clean.syntaxErrors === 0;
}

// ── Selftest ─────────────────────────────────────────────────────────────────

/**
 * Fixtures run through `scanSource`, the same function the real scan uses.
 * Each expects an exact violation COUNT — the `Promise.all` pair expects 1, not
 * "at least one", because that is what distinguishes chain scope from statement
 * scope.
 */
function selftest(): void {
  const cases: Array<[string, string, number]> = [
    // A `communities` read carrying both markers.
    [
      'communities: both markers',
      `const r = await db.from('communities').select('id').eq('is_demo', false).is('deleted_at', null);`,
      0,
    ],
    // Missing either half of the real-community predicate is a violation.
    [
      'communities: missing is_demo',
      `const r = await db.from('communities').select('id').is('deleted_at', null);`,
      1,
    ],
    [
      'communities: missing deleted_at',
      `const r = await db.from('communities').select('id').eq('is_demo', false);`,
      1,
    ],
    [
      'communities: missing both',
      `const r = await db.from('communities').select('id, name').in('id', ids);`,
      1,
    ],
    // `user_roles` scoped by an exact 'community_id' literal.
    [
      'user_roles: exact community_id',
      `const r = await db.from('user_roles').select('*').in('community_id', realIds);`,
      0,
    ],
    // THE SUBSTRING TRAP. `'user_id, community_id'` contains the marker text but
    // is a select list, not a filter. Exact-literal matching must flag it.
    [
      'user_roles: only a substring match',
      `const r = await db.from('user_roles').select('user_id, community_id').in('user_id', userIds);`,
      1,
    ],
    // The helper form. A guard keyed on `.from('user_roles')` would see nothing
    // here — and this is the members series, the read the remediation exists for.
    [
      'user_roles: fetchRowsInPages helper',
      `const r = await fetchRowsInPages<CreatedAtRow>(db, 'user_roles', 'created_at', 'community_id', ids, 1000, 50000);`,
      0,
    ],
    [
      'user_roles: helper with no community_id argument',
      `const r = await fetchRowsInPages<CreatedAtRow>(db, 'user_roles', 'created_at', ids, 1000, 50000);`,
      1,
    ],
    // CHAIN SCOPE, NOT STATEMENT SCOPE. Two reads in one statement: the first
    // scoped, the second not. Statement scope would let the first vouch for the
    // second and report 0. Exactly 1 is the whole point of this fixture.
    [
      'Promise.all: one scoped sibling must not vouch for an unscoped one',
      [
        `const [a, b] = await Promise.all([`,
        `  db.from('communities').select('id').eq('is_demo', false).is('deleted_at', null),`,
        `  db.from('user_roles').select('created_at'),`,
        `]);`,
      ].join('\n'),
      1,
    ],
    // …and the mirror image, so the fixture above cannot pass by accident of
    // ordering: unscoped FIRST, scoped second.
    [
      'Promise.all: unscoped sibling first',
      [
        `const [a, b] = await Promise.all([`,
        `  db.from('user_roles').select('created_at'),`,
        `  db.from('communities').select('id').eq('is_demo', false).is('deleted_at', null),`,
        `]);`,
      ].join('\n'),
      1,
    ],
    // Both unscoped in one statement — two violations, not one.
    [
      'Promise.all: both siblings unscoped',
      [
        `const [a, b] = await Promise.all([`,
        `  db.from('user_roles').select('created_at'),`,
        `  db.from('communities').select('id'),`,
        `]);`,
      ].join('\n'),
      2,
    ],
    // A ternary branch is a stop point too: the `Promise.resolve` arm must not
    // absorb the read, and the read must still be checked.
    [
      'ternary branch: scoped',
      `const p = ids.length > 0 ? db.from('user_roles').select('*').in('community_id', ids) : Promise.resolve({ count: 0 });`,
      0,
    ],
    [
      'ternary branch: unscoped',
      `const p = ids.length > 0 ? db.from('user_roles').select('*') : Promise.resolve({ count: 0 });`,
      1,
    ],
    // Exempt on the line immediately above the chain.
    [
      'exempt above the chain, with a reason',
      [
        `// admin-community-scope:exempt — resolves display names for communities being deleted`,
        `const r = await db.from('communities').select('id, name').in('id', ids);`,
      ].join('\n'),
      0,
    ],
    // Exempt inside the chain's line span.
    [
      'exempt within the chain span',
      [
        `const r = await db`,
        `  .from('communities') // admin-community-scope:exempt — deleted rows are the subject`,
        `  .select('id, name')`,
        `  .in('id', ids);`,
      ].join('\n'),
      0,
    ],
    // A bare marker with nothing after the em dash must NOT suppress.
    [
      'exempt with an empty reason',
      [
        `// admin-community-scope:exempt —`,
        `const r = await db.from('communities').select('id, name').in('id', ids);`,
      ].join('\n'),
      1,
    ],
    // …nor a marker with no em dash at all.
    [
      'exempt with no em dash',
      [
        `// admin-community-scope:exempt`,
        `const r = await db.from('communities').select('id, name').in('id', ids);`,
      ].join('\n'),
      1,
    ],
    // An exempt two lines above does not reach the chain.
    [
      'exempt too far above the chain',
      [
        `// admin-community-scope:exempt — not adjacent to anything`,
        ``,
        `const r = await db.from('communities').select('id, name').in('id', ids);`,
      ].join('\n'),
      1,
    ],
    // An exempt does not leak to the NEXT read after the one it annotates.
    [
      'exempt does not leak to a later read',
      [
        `// admin-community-scope:exempt — display names for deleted communities`,
        `const a = await db.from('communities').select('id, name').in('id', ids);`,
        `const b = await db.from('communities').select('id').in('id', ids);`,
      ].join('\n'),
      1,
    ],
    // The table name as an identifier, a property, or prose is not a read.
    [
      'identifier and prose, not a string literal',
      [
        `// communities and user_roles are read elsewhere in this file`,
        `const communities = rows.map((r) => r.community);`,
        `const user_roles = communities.length;`,
        `type X = { communities: number; user_roles: number };`,
      ].join('\n'),
      0,
    ],
    // A literal that merely CONTAINS a table name is not a read either.
    [
      'a literal containing a table name is not a read',
      `throw new Error('Failed to load communities');`,
      0,
    ],
    // A template literal spelling the table exactly IS a read, and is checked.
    [
      'template literal table name',
      'const r = await db.from(`user_roles`).select(`*`);',
      1,
    ],
    // Sanity: the fixtures above must not be passing because nothing is found.
    ['baseline sanity: an unscoped read is found at all', `db.from('user_roles');`, 1],
  ];

  for (const [name, source, expected] of cases) {
    const { violations } = scanSource('selftest.ts', source);
    if (violations.length !== expected) {
      console.error(
        `guard:admin-community-scope SELFTEST FAIL [${name}] expected ${expected} violation(s), ` +
          `got ${violations.length}\n--- fixture ---\n${source}\n---------------`,
      );
      process.exit(2);
    }
  }

  // The fixture set must actually be exercising the reader, not an empty walk.
  const found = cases.reduce((n, [, src]) => n + scanSource('selftest.ts', src).reads.length, 0);
  if (found === 0) {
    console.error('guard:admin-community-scope SELFTEST FAIL — fixtures produced zero reads.');
    process.exit(2);
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────

// ESM main-detection (POSIX only — matches the other guards). Importing this
// module from a unit test must not scan the tree or exit the runner; the
// selftest and the parser proof still run on every real invocation, before any
// scan result is trusted.
if (import.meta.url === `file://${process.argv[1]}`) {
  selftest();

  if (!parserSelfTest()) {
    fail(
      'the TypeScript parse-failure detector is broken: a deliberately malformed source reported no ' +
        'syntax errors. `sourceFile.parseDiagnostics` is a TS internal and this version may have moved ' +
        'it. Every unparseable file would silently contribute zero reads.',
    );
  }

  if (process.argv.includes('--selftest')) {
    console.log('guard:admin-community-scope selftest OK');
    process.exit(0);
  }

  const rootFlagIndex = process.argv.indexOf('--root');
  const rootRel = rootFlagIndex >= 0 ? process.argv[rootFlagIndex + 1] : DEFAULT_ROOT_REL;
  if (rootRel === undefined || rootRel.length === 0) {
    fail('--root was given with no directory.');
  }
  const rootAbs = path.isAbsolute(rootRel) ? rootRel : path.join(repoRoot, rootRel);

  if (!fs.existsSync(rootAbs) || !fs.statSync(rootAbs).isDirectory()) {
    fail(
      `search root '${rootRel}' does not exist — refusing to report success from a tree this guard ` +
        'cannot search.',
    );
  }

  function collectSources(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        collectSources(full, acc);
      } else if (entry.name.endsWith('.ts')) {
        acc.push(full);
      }
    }
    return acc;
  }

  const sources = collectSources(rootAbs);
  if (sources.length === 0) {
    fail(`no .ts files under '${rootRel}' — the source layout moved.`);
  }

  const violations: string[] = [];
  const unparsed: string[] = [];
  const perTable: Record<string, number> = Object.fromEntries(TABLES.map((t) => [t, 0]));
  let totalReads = 0;
  let exemptCount = 0;

  for (const file of sources) {
    const rel = path.relative(repoRoot, file);
    const { reads, violations: fileViolations, syntaxErrors } = scanSource(
      file,
      fs.readFileSync(file, 'utf8'),
    );

    // A file that failed to parse contributes zero reads, which is
    // indistinguishable from a file that legitimately has none. Refuse.
    if (syntaxErrors !== 0) {
      unparsed.push(
        `${rel} (${syntaxErrors === -1 ? 'detector unavailable' : `${syntaxErrors} syntax error(s)`})`,
      );
      continue;
    }

    for (const read of reads) {
      totalReads += 1;
      perTable[read.table] = (perTable[read.table] ?? 0) + 1;
      if (read.exempt) exemptCount += 1;
    }

    for (const v of fileViolations) {
      const markers = v.missing.map((m) => `'${m}'`).join(' and ');
      const hint = v.reasonlessExempt
        ? ` An "${EXEMPT_MARKER}" marker is present but carries no reason after the em dash, so it does not apply.`
        : ` If this read is correct without the predicate, add ` +
          `"${EXEMPT_MARKER} — <why it is correct without it>" on the line above.`;
      violations.push(
        `  ${rel}:${v.startLine} — read of '${v.table}' is missing ${markers} in its call chain ` +
          `(lines ${v.startLine}-${v.endLine}).${hint}`,
      );
    }
  }

  if (unparsed.length > 0) {
    fail(
      `${unparsed.length} file(s) failed to parse, so they contributed zero reads:\n   ` +
        unparsed.join('\n   '),
    );
  }

  // A scan that examined nothing must never pass. `apps/admin/src/lib/server`
  // holds 13 of these reads today; a collapse to zero means the reader, the root,
  // or the data-access convention moved, and every check above passed vacuously.
  if (totalReads === 0) {
    fail(
      `scanned ${sources.length} file(s) under '${rootRel}' and found ZERO reads of ` +
        `${TABLES.map((t) => `'${t}'`).join(' / ')}. Either the tables are no longer read here, or ` +
        'the reader has stopped seeing them. Refusing to pass a check that examined nothing.',
    );
  }

  const denominator =
    `scanned ${sources.length} files; examined ${totalReads} reads ` +
    `(${TABLES.map((t) => `${perTable[t] ?? 0} ${t}`).join(', ')}); ${exemptCount} exempt`;

  if (violations.length > 0) {
    console.error(
      'guard:admin-community-scope — unscoped reads of communities / user_roles in ' +
        `${rootRel}:\n${violations.join('\n')}\n\n` +
        'A `communities` read must filter both `is_demo` and `deleted_at`; a `user_roles` read must ' +
        'be restricted by `community_id`. The population these reads return is compared against ' +
        'other reads on screen — see the Members KPI / Members sparkline mismatch this guard exists ' +
        `for.\n${denominator}`,
    );
    process.exit(1);
  }

  console.log(`guard:admin-community-scope OK — ${denominator}.`);
}

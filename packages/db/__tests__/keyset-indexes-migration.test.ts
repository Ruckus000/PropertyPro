import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0076 (the seven hard-tier keyset indexes).
 *
 * Same reasoning as `support-inbox-migration.test.ts`: everything else that runs
 * on a PR mocks the database, so NOTHING else can prove these exist.
 *
 * What these assertions DO guard: an accidental edit to 0076 — a dropped
 * `WHERE deleted_at IS NULL`, a column removed, a direction flipped, one of the
 * seven statements deleted while "tidying" the file. All of those leave the
 * migration applying cleanly and the whole suite green, because an index that is
 * merely *suboptimal* is not an error. That is the defect PAG-01 was written
 * about in reverse: the seven feeds were migrated to a sort `paginate()` cannot
 * express and shipped with zero supporting indexes, invisibly, for months.
 *
 * What these assertions deliberately do NOT claim: that the column list matches
 * the service's `orderBy`. A test that restates the same literal cannot
 * distinguish a correct column list from a wrong one — it would pass on the bug
 * it purports to catch. The mapping to `apps/web/src/lib/services/*` was
 * established by reading each shipped `orderBy` (file:line cited in the
 * migration header) and by proving causality against a live planner: with the
 * index the shipped query plans to an index scan with no sort node; dropping
 * that one index reintroduces the sort; restoring it removes the sort again.
 * That evidence is recorded in
 * `docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md` §4.6.
 * A guard that re-parses the services to keep the two in sync is worth having
 * but is PAG-08's territory (no guard today polices pagination shape), not this
 * file's.
 */

const RAW = readFileSync(
  path.resolve(__dirname, '../migrations/0076_keyset_indexes_hard_tier.sql'),
  'utf8',
);

/**
 * The SQL with `--` comments stripped, exactly as the 0068 guards do.
 *
 * Every assertion below runs against this, never the raw text. The header
 * comment discusses each index and names its columns, so matching against the
 * raw file would let prose satisfy an assertion the SQL does not — one
 * occurrence of each string is already in the commentary by design.
 */
const SQL = RAW.replace(/--[^\n]*/g, '');

/** index name -> [table, ordered columns with direction, partial predicate]. */
const INDEX_PATTERN =
  /CREATE INDEX IF NOT EXISTS "([a-z_0-9]+)"\s+ON "public"\."([a-z_]+)"\s*\(([^)]*)\)\s*(WHERE\s+"deleted_at" IS NULL)?/g;

function parseIndexes(): Map<string, { table: string; columns: string[]; partial: boolean }> {
  const found = new Map<string, { table: string; columns: string[]; partial: boolean }>();
  for (const m of SQL.matchAll(INDEX_PATTERN)) {
    found.set(m[1], {
      table: m[2],
      columns: m[3]
        .split(',')
        .map((c) => c.trim().replace(/"/g, '').replace(/\s+(ASC|DESC)$/i, '').trim())
        .filter(Boolean),
      partial: Boolean(m[4]),
    });
  }
  return found;
}

const EXPECTED: Record<string, { table: string; columns: string[] }> = {
  faqs_active_order_idx: { table: 'faqs', columns: ['community_id', 'sort_order', 'id'] },
  announcements_active_feed_idx: {
    table: 'announcements',
    columns: ['community_id', 'is_pinned', 'published_at', 'id'],
  },
  vendors_active_name_idx: {
    table: 'vendors',
    columns: ['community_id', 'is_active', 'name', 'id'],
  },
  assessments_active_created_idx: {
    table: 'assessments',
    columns: ['community_id', 'is_active', 'created_at', 'id'],
  },
  visitor_log_arrival_idx: {
    table: 'visitor_log',
    columns: ['community_id', 'expected_arrival', 'id'],
  },
  forum_threads_pinned_created_idx: {
    table: 'forum_threads',
    columns: ['community_id', 'is_pinned', 'created_at', 'id'],
  },
  // Two components, not three: `amenities` has no `is_active` column. The one
  // index the plan itself missed, added by the audit's 2026-09-23 amendment.
  amenities_name_idx: { table: 'amenities', columns: ['community_id', 'name', 'id'] },
};

describe('migration 0076 — hard-tier keyset indexes', () => {
  const indexes = parseIndexes();

  it('the extractor actually sees the statements (population guard)', () => {
    // Without this, a broken regex would make every assertion below pass on an
    // empty map — vacuously green, which is as useless as vacuously red.
    expect(indexes.size).toBe(7);
    // ...and that the parse is not picking up commentary or stray DDL.
    for (const name of Object.keys(EXPECTED)) {
      expect(indexes.has(name), `missing index ${name}`).toBe(true);
    }
  });

  it('creates exactly the seven PAG-01 indexes and nothing undeclared', () => {
    expect([...indexes.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [name, expected] of Object.entries(EXPECTED)) {
    describe(name, () => {
      it('is on the expected table with the expected column list in order', () => {
        const actual = indexes.get(name);
        expect(actual, `${name} not parsed from stripped SQL`).toBeDefined();
        expect(actual!.table).toBe(expected.table);
        // Order matters: a reordered list still creates, still applies, and is
        // simply never chosen by the planner for this feed's ORDER BY.
        expect(actual!.columns).toEqual(expected.columns);
      });

      it('is partial on deleted_at IS NULL, matching what createScopedClient injects', () => {
        // scoped-client.ts buildScopeFilters adds `community_id = ?` AND
        // `deleted_at IS NULL` to every read of these tables. A non-partial
        // index would still work but would carry rows no query can ask for.
        expect(indexes.get(name)!.partial).toBe(true);
      });
    });
  }

  it('leads every index with community_id (the tenant predicate is an equality)', () => {
    for (const [name, def] of indexes) {
      expect(def.columns[0], `${name} does not lead with community_id`).toBe('community_id');
    }
  });

  it('ends every index with id, the deterministic keyset tiebreaker', () => {
    // Each shipped cursor compares on id last; without it as a trailing key the
    // index cannot serve the ORDER BY and the feed falls back to a sort.
    for (const [name, def] of indexes) {
      expect(def.columns[def.columns.length - 1], `${name} lacks a trailing id`).toBe('id');
    }
  });

  it('does not build any index concurrently', () => {
    // The prod apply is transaction-wrapped, where CONCURRENTLY hard-fails.
    // Asserted against the comment-stripped SQL, so the header's prose about the
    // non-concurrent form cannot satisfy it either.
    expect(SQL).not.toMatch(/CONCURRENTLY/i);
  });

  it('declares no index() for these in the schema files (snapshot must stay drizzle-unchanged)', () => {
    // 0076 is hand-authored, so `meta/0076_snapshot.json` copies the tip and is
    // honest ONLY because drizzle-tracked schema is unchanged. If someone adds a
    // drizzle `index()` to these schema files later, the snapshot must instead be
    // produced by `db:generate`, or the chain rots (see migration-safety.md).
    for (const table of ['faqs', 'announcements', 'vendors', 'assessments', 'visitor-log', 'forum-threads', 'amenities']) {
      const src = readFileSync(path.resolve(__dirname, `../src/schema/${table}.ts`), 'utf8');
      for (const name of Object.keys(EXPECTED)) {
        expect(src, `${name} leaked into schema/${table}.ts`).not.toContain(name);
      }
    }
  });
});

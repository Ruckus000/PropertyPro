/**
 * Tests for `createMigration()` — the hand-authored migration scaffolder.
 *
 * It exists to replace hand-editing `meta/_journal.json`, which is what produced
 * derived `when` timestamps and let PRs #852 and #853 collide. So the assertions
 * that matter most are: `when` is wall-clock (not derived from the previous
 * entry), and the snapshot chains correctly — a broken chain is invisible until
 * `db:generate` emits a bogus migration months later.
 *
 * Fixtures are a minimal fake migrations dir in tmp: the journal, and one tip
 * snapshot to chain off.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMigration } from '../new-migration';

const STARTING_JOURNAL = {
  version: '7',
  dialect: 'postgresql',
  entries: [
    { idx: 0, version: '7', when: 1778104090479, tag: '0000_nappy_guardian', breakpoints: true },
    { idx: 1, version: '7', when: 1778106092617, tag: '0001_round_pixie', breakpoints: true },
  ],
};

const TIP_SNAPSHOT = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  prevId: 'bbbbbbbb-1111-2222-3333-444444444444',
  version: '7',
  dialect: 'postgresql',
  tables: { units: { name: 'units' } },
  enums: {},
  policies: {},
};

let migrationsDir: string;

function readJournal() {
  return JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8'));
}

beforeEach(() => {
  migrationsDir = mkdtempSync(join(tmpdir(), 'new-migration-'));
  mkdirSync(join(migrationsDir, 'meta'), { recursive: true });
  writeFileSync(
    join(migrationsDir, 'meta/_journal.json'),
    `${JSON.stringify(STARTING_JOURNAL, null, 2)}\n`,
  );
  writeFileSync(
    join(migrationsDir, 'meta/0001_snapshot.json'),
    `${JSON.stringify(TIP_SNAPSHOT, null, 2)}\n`,
  );
});

afterEach(() => {
  rmSync(migrationsDir, { recursive: true, force: true });
});

describe('createMigration', () => {
  it('creates the sql stub, journal entry and snapshot at the next index', () => {
    const result = createMigration({ migrationsDir, name: 'close_rls_gaps' });

    expect(result.skipped).toBe(false);
    expect(result.idx).toBe(2);
    expect(result.tag).toBe('0002_close_rls_gaps');
    expect(existsSync(join(migrationsDir, '0002_close_rls_gaps.sql'))).toBe(true);
    expect(existsSync(join(migrationsDir, 'meta/0002_snapshot.json'))).toBe(true);

    const entries = readJournal().entries;
    expect(entries).toHaveLength(3);
    expect(entries[2]).toMatchObject({
      idx: 2,
      version: '7',
      tag: '0002_close_rls_gaps',
      breakpoints: true,
    });
  });

  it('stamps `when` with wall-clock time, not derived from the previous entry', () => {
    const before = Date.now();
    const result = createMigration({ migrationsDir, name: 'wall_clock' });
    const after = Date.now();

    expect(result.when).toBeGreaterThanOrEqual(before);
    expect(result.when).toBeLessThanOrEqual(after);
    // The regression this whole change exists to prevent: previous + 60000.
    const prevWhen = STARTING_JOURNAL.entries[1]!.when;
    expect(result.when).not.toBe(prevWhen + 60000);
    expect(result.when).toBeGreaterThan(prevWhen);
  });

  it('chains the new snapshot off the tip and gives it a fresh id', () => {
    createMigration({ migrationsDir, name: 'chained' });
    const snapshot = JSON.parse(
      readFileSync(join(migrationsDir, 'meta/0002_snapshot.json'), 'utf8'),
    );

    expect(snapshot.prevId).toBe(TIP_SNAPSHOT.id);
    expect(snapshot.id).not.toBe(TIP_SNAPSHOT.id);
    // Content is copied verbatim — the whole premise of the hand-authored path
    // is that drizzle-tracked schema is unchanged.
    expect(snapshot.tables).toEqual(TIP_SNAPSHOT.tables);
  });

  it('is idempotent by name: re-running writes nothing and reports the existing tag', () => {
    const first = createMigration({ migrationsDir, name: 'twice' });
    const journalAfterFirst = readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8');

    // Must match on the NAME, not the tag: the tag embeds the index, and the
    // re-run picks the next free one — so a tag comparison would never match and
    // would silently create a second migration doing the same thing.
    const second = createMigration({ migrationsDir, name: 'twice' });

    expect(second.skipped).toBe(true);
    expect(second.filesWritten).toEqual([]);
    expect(second.tag).toBe(first.tag);
    expect(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8')).toBe(journalAfterFirst);
    expect(existsSync(join(migrationsDir, '0003_twice.sql'))).toBe(false);
  });

  it('refuses to overwrite an orphaned file the journal does not know about', () => {
    writeFileSync(join(migrationsDir, '0002_orphan.sql'), '-- left behind\n');

    expect(() => createMigration({ migrationsDir, name: 'orphan' })).toThrow(/Refusing to overwrite/);
  });

  it('rejects names that would produce a malformed tag', () => {
    for (const bad of ['Close-RLS-Gaps', 'close rls gaps', '2_leading_digit', '']) {
      expect(() => createMigration({ migrationsDir, name: bad })).toThrow(/Invalid migration name/);
    }
  });

  it('writes a stub that tells the author what to document', () => {
    createMigration({ migrationsDir, name: 'documented' });
    const sql = readFileSync(join(migrationsDir, '0002_documented.sql'), 'utf8');

    expect(sql).toContain('0002_documented');
    expect(sql).toContain('WHY:');
    expect(sql).toContain('statement-breakpoint');
  });
});

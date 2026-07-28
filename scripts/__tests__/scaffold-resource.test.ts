/**
 * Golden-file test for `scaffoldResource()` — Plan A4.
 *
 * Approach:
 *   - Build a minimal fake repo root in a tmp dir containing only what the
 *     scaffolder mutates (the migration journal + the schema barrel index).
 *   - Run the scaffolder with `--target <tmpDir>` for `widgets`.
 *   - Diff every produced file byte-for-byte against the committed golden
 *     fixtures under scripts/scaffold-resource.test/fixtures/widgets/.
 *
 * Why: if either the scaffolder logic or the templates drift away from each
 * other, this test catches it on the next CI run. The fixtures double as
 * documentation: a reviewer can scan them in a normal `git diff`.
 *
 * Note: the journal-entry's `when` is a `Date.now()` value, so we relax that
 * specific field to "any positive number" rather than asserting exact bytes.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scaffoldResource } from '../scaffold-resource';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(here, '..', 'scaffold-resource.test/fixtures/widgets');

// Minimal journal that mirrors the real repo's `meta/_journal.json` baseline:
// 4 entries with idx 0..3, so the scaffolder picks 0004 for `widgets`.
const STARTING_JOURNAL = {
  version: '7',
  dialect: 'postgresql',
  entries: [
    { idx: 0, version: '7', when: 1778104090479, tag: '0000_nappy_guardian', breakpoints: true },
    { idx: 1, version: '7', when: 1778106092617, tag: '0001_round_pixie', breakpoints: true },
    { idx: 2, version: '7', when: 1778115661662, tag: '0002_reconcile_help_articles_user_search', breakpoints: true },
    { idx: 3, version: '7', when: 1778694790784, tag: '0003_maintenance_unit_label', breakpoints: true },
  ],
};

const STARTING_BARREL = `/**
 * Schema barrel export — all tables, enums, and inferred types.
 */
export * from './communities';
`;

function writeFile(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents, 'utf8');
}

function listFilesRel(rootAbs: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string): void => {
    for (const entry of readdirSync(absDir)) {
      const abs = join(absDir, entry);
      const s = statSync(abs);
      if (s.isDirectory()) walk(abs);
      else if (s.isFile()) out.push(relative(rootAbs, abs));
    }
  };
  walk(rootAbs);
  return out.sort();
}

describe('scaffoldResource()', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'scaffold-resource-test-'));
    writeFile(
      join(tmpRoot, 'packages/db/migrations/meta/_journal.json'),
      `${JSON.stringify(STARTING_JOURNAL, null, 2)}\n`,
    );
    writeFile(join(tmpRoot, 'packages/db/src/schema/index.ts'), STARTING_BARREL);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('generates byte-identical files vs the committed widgets fixtures', () => {
    const result = scaffoldResource({ plural: 'widgets', target: tmpRoot });

    expect(result.schemaBarrelTouched).toBe(true);
    // The RLS block is returned for printing, never written — drizzle emits the
    // table and FK from the schema file, but never the policies or trigger.
    expect(result.rlsBlock).toContain('CREATE POLICY "pp_tenant_select" ON public."widgets"');
    expect(result.rlsBlock).toContain('pp_rls_enforce_tenant_scope');

    const fixtureFiles = listFilesRel(FIXTURE_ROOT);
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const rel of fixtureFiles) {
      const expected = readFileSync(join(FIXTURE_ROOT, rel), 'utf8');
      const actual = readFileSync(join(tmpRoot, rel), 'utf8');
      // Helpful failure message for golden-file drift.
      if (expected !== actual) {
        // eslint-disable-next-line no-console -- diagnostic on failure
        console.error(`Mismatch in ${rel}`);
      }
      expect(actual, `byte mismatch for ${rel}`).toBe(expected);
    }
  });

  it('appends a re-export to the schema barrel', () => {
    scaffoldResource({ plural: 'widgets', target: tmpRoot });
    const barrel = readFileSync(join(tmpRoot, 'packages/db/src/schema/index.ts'), 'utf8');
    expect(barrel).toContain("export * from './widgets';");
    // The original line is preserved.
    expect(barrel).toContain("export * from './communities';");
  });

  it('does not touch the migration journal — db:generate owns it', () => {
    const before = readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8');

    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    // Byte-identical, not just "same length". A journal entry written here would
    // have no matching meta/NNNN_snapshot.json, which fails
    // checkSnapshotChainIntact and leaves `migration-ordering` red.
    expect(readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8')).toBe(before);
  });

  it('writes nothing under packages/db/migrations/', () => {
    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    const migrationFiles = listFilesRel(join(tmpRoot, 'packages/db/migrations'));
    // Only the pre-existing journal fixture. A stray .sql here would be an
    // orphan: checkMigrationFilesExist requires a journal entry for every file.
    expect(migrationFiles).toEqual(['meta/_journal.json']);
  });

  it('leaves the journal untouched when re-scaffolded after a manual cleanup', () => {
    // The scenario the old appendJournalEntry claimed to guard, and got wrong:
    // it matched on the whole tag, but the tag embeds the index, so a re-run
    // built `0005_create_widgets` against an existing `0004_create_widgets` and
    // appended a duplicate. The pre-existing test for it filtered on
    // `tag === '0004_create_widgets'` and so never saw the `0005` entry.
    // Now the journal is never written at all, which removes the class.
    const before = readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8');
    const first = scaffoldResource({ plural: 'widgets', target: tmpRoot });
    for (const rel of first.filesWritten) {
      rmSync(join(tmpRoot, rel), { force: true });
    }

    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    expect(readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8')).toBe(before);
  });

  it('refuses to overwrite existing files', () => {
    // Pre-create one of the targets to simulate a collision.
    writeFile(
      join(tmpRoot, 'apps/web/src/app/api/v1/widgets/route.ts'),
      '// pre-existing file\n',
    );
    expect(() => scaffoldResource({ plural: 'widgets', target: tmpRoot })).toThrow(
      /Refusing to overwrite/,
    );
    // Nothing else was written (atomic behavior).
    expect(existsSync(join(tmpRoot, 'packages/db/src/schema/widgets.ts'))).toBe(false);
  });

  it('rejects invalid plural names', () => {
    for (const bad of ['Widgets', 'widget', 'wid_gets', '1widgets', '-widgets', 'widgets-']) {
      expect(() => scaffoldResource({ plural: bad, target: tmpRoot }), `expected reject of "${bad}"`).toThrow();
    }
  });

  it('accepts an explicit --singular override (kebab-case allowed)', () => {
    // Use a different resource name + an explicit singular to avoid widget collision.
    const result = scaffoldResource({ plural: 'categories', singular: 'category', target: tmpRoot });
    expect(result.filesWritten.length).toBeGreaterThan(0);

    const schema = readFileSync(join(tmpRoot, 'packages/db/src/schema/categories.ts'), 'utf8');
    expect(schema).toContain("'categories'");
    expect(schema).toContain('export const categories = pgTable');
    expect(schema).toContain('type Category =');

    const contract = readFileSync(
      join(tmpRoot, 'apps/web/src/app/api/v1/categories/contract.ts'),
      'utf8',
    );
    expect(contract).toContain('categoriesListContract');
    expect(contract).toContain('categoryItemSchema');
    expect(contract).toContain("path: '/api/v1/categories'");

    // The RLS block is substituted too, even though it is printed rather than
    // written — a stray `widgets` there would be pasted into a real migration.
    expect(result.rlsBlock).toContain('"categories"');
    expect(result.rlsBlock).not.toContain('widgets');
    expect(result.rlsBlock).not.toContain('widget'); // no orphan singular either
  });

  it('substitutes correctly for names that contain fixture tokens as substrings (regression)', () => {
    // Bug: a chained .replaceAll(plural).replaceAll(singular) sequence would
    // turn `widgets` → `awidgets` and then re-scan the result to corrupt it
    // into `aawidgets`. The single-pass regex form must visit each position
    // exactly once.
    const result = scaffoldResource({ plural: 'awidgets', target: tmpRoot });
    expect(result.filesWritten.length).toBeGreaterThan(0);

    const schema = readFileSync(join(tmpRoot, 'packages/db/src/schema/awidgets.ts'), 'utf8');
    // Critical: NEVER `aawidgets` (double-substitution bug).
    expect(schema).not.toContain('aawidgets');
    expect(schema).not.toContain('aawidget');
    expect(schema).toContain('export const awidgets = pgTable');
    expect(schema).toContain('pgTable(\'awidgets\'');
    expect(schema).toContain('type Awidget =');

    const route = readFileSync(
      join(tmpRoot, 'apps/web/src/app/api/v1/awidgets/route.ts'),
      'utf8',
    );
    expect(route).not.toContain('aawidgets');
    expect(route).toContain('awidgetsListContract');
    expect(route).toContain('paginateAwidgets');
  });

  it('throws a clear error when the target is not a repo root', () => {
    // The scaffolder no longer PARSES the journal (db:generate owns it), but it
    // still checks the file exists — cheapest proof that --target is right,
    // before anything is written.
    rmSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'));
    expect(() => scaffoldResource({ plural: 'widgets', target: tmpRoot })).toThrow(
      /Cannot find migration journal/,
    );
    expect(existsSync(join(tmpRoot, 'packages/db/src/schema/widgets.ts'))).toBe(false);
  });

});

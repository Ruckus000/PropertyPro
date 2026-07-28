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

    expect(result.migrationIndex).toBe(4);
    expect(result.schemaBarrelTouched).toBe(true);
    expect(result.journalTouched).toBe(true);

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

  it('appends a journal entry with the next index', () => {
    scaffoldResource({ plural: 'widgets', target: tmpRoot });
    const raw = readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8');
    const journal = JSON.parse(raw) as typeof STARTING_JOURNAL;
    expect(journal.entries).toHaveLength(5);
    const last = journal.entries[4]!;
    expect(last.idx).toBe(4);
    expect(last.tag).toBe('0004_create_widgets');
    expect(last.version).toBe('7');
    expect(last.breakpoints).toBe(true);
    // `when` is Date.now() at scaffold-time; just assert it's a plausible
    // ms-precision unix timestamp.
    expect(typeof last.when).toBe('number');
    expect(last.when).toBeGreaterThan(1_700_000_000_000);
  });

  it('does not append a second journal entry when the resource is re-scaffolded after a cleanup', () => {
    // The scenario appendJournalEntry's own comment claims to protect: the
    // generated files were deleted by hand, but the journal entry was left.
    // A re-run then picks migrationIdx = max+1, so the tag it builds is
    // 0005_create_widgets while the journal holds 0004_create_widgets — a
    // full-tag comparison never matches and silently appends a duplicate entry
    // (and a second migration creating the same table).
    const first = scaffoldResource({ plural: 'widgets', target: tmpRoot });
    for (const rel of first.filesWritten) {
      rmSync(join(tmpRoot, rel), { force: true });
    }

    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    const journal = JSON.parse(
      readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8'),
    ) as typeof STARTING_JOURNAL;
    const widgetEntries = journal.entries.filter((e) => e.tag.endsWith('_create_widgets'));

    expect(widgetEntries).toHaveLength(1);
    expect(widgetEntries[0]!.tag).toBe('0004_create_widgets');
    expect(journal.entries).toHaveLength(5);
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
    // Migration index is picked from the journal — should be the next slot.
    expect(result.migrationIndex).toBe(4);

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

    // Migration filename is renumbered AND the fixture token in the body is
    // substituted to the new plural name.
    const migration = readFileSync(
      join(tmpRoot, 'packages/db/migrations/0004_create_categories.sql'),
      'utf8',
    );
    expect(migration).toContain('"categories"');
    expect(migration).not.toContain('widgets');
    expect(migration).not.toContain('widget'); // no orphan singular either
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

  it('throws a clear error when the migration journal is malformed JSON', () => {
    writeFile(
      join(tmpRoot, 'packages/db/migrations/meta/_journal.json'),
      '{ not valid json',
    );
    expect(() => scaffoldResource({ plural: 'widgets', target: tmpRoot })).toThrow(
      /not valid JSON/,
    );
  });

  it('does not double-append a journal entry on re-run after manual file cleanup', () => {
    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    // Simulate "developer deleted the scaffolded files to retry" — keep the
    // journal + barrel changes, drop the artifact files. The next run must
    // pass `ensureNoCollisions` (files are gone) but MUST NOT add a second
    // journal entry with the same tag.
    rmSync(join(tmpRoot, 'packages/db/migrations/0004_create_widgets.sql'));
    rmSync(join(tmpRoot, 'packages/db/src/schema/widgets.ts'));
    rmSync(join(tmpRoot, 'apps/web/src/app/api/v1/widgets'), { recursive: true });
    rmSync(join(tmpRoot, 'apps/web/src/lib/services/widgets-service.ts'));
    rmSync(join(tmpRoot, 'apps/web/src/hooks/useWidgets.ts'));
    rmSync(join(tmpRoot, 'apps/web/src/app/(authenticated)/widgets'), { recursive: true });
    rmSync(join(tmpRoot, 'apps/web/__tests__/api/widgets'), { recursive: true });
    rmSync(join(tmpRoot, 'apps/web/__tests__/integration/widgets.integration.test.ts'));

    scaffoldResource({ plural: 'widgets', target: tmpRoot });

    const raw = readFileSync(join(tmpRoot, 'packages/db/migrations/meta/_journal.json'), 'utf8');
    const journal = JSON.parse(raw) as typeof STARTING_JOURNAL;
    const widgetsEntries = journal.entries.filter((e) => e.tag === '0004_create_widgets');
    expect(widgetsEntries).toHaveLength(1);
  });
});

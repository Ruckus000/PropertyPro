/**
 * Migration 0097 — the catalog rows for the four website looks.
 *
 * Bayfront, Heritage, Palm Grove and Plain & Simple are each two platform-level
 * rows: a colour-and-font set in `site_theme_presets`, and a layout entry in
 * `site_layout_metadata` whose `default_preset_slug` points back at that set.
 * The looks take their colours and fonts from the first, and the admin console
 * lists both. Every other test mocks the database, so nothing else would notice
 * a mistyped font, a layout pointing at the wrong set, or a re-run that
 * overwrote an administrator's edit. This runs against a real Postgres and
 * asserts what the server holds.
 *
 * ## What each case is careful about
 *
 * **Fonts are checked against the real allow-list.** `resolveTheme` swaps any
 * family outside `ALLOWED_FONTS` for the default font without a word, so a
 * preset naming one would paint the wrong typeface on every site that chose the
 * look. The list is imported rather than repeated, so dropping a family from it
 * while a look still uses it fails here.
 *
 * **A preset carries exactly the five preset keys.** A preset's tokens say
 * `headingFont` / `bodyFont`; a community's branding says `fontHeading` /
 * `fontBody`, and `applyPresetTokensToBranding` copies one onto the other,
 * ignoring any key it does not know. A misnamed or stray key therefore fails
 * silently, as a font that never applies, so the key set is pinned.
 *
 * **Failures are collected, not thrown one at a time.** Each case builds a list
 * of what is wrong and asserts the list is empty, so a bad migration reports
 * every look it got wrong in one run.
 *
 * **Re-applying is a no-op, and it never overwrites.** Production receives this
 * file by hand, and a platform administrator can rename or retint a row in the
 * console afterwards. `ON CONFLICT DO NOTHING` is what makes a second apply
 * harmless, and the difference between it and an upsert only shows when a row has
 * been edited, so one case edits first. Both re-runs happen inside a transaction
 * that is rolled back: nothing is left behind, and a migration that wrongly
 * updated a row cannot damage the database it is being tested on.
 *
 * Run with `pnpm test:integration:local`. NEVER against `.env.local` — that
 * DATABASE_URL is production.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('site looks catalog (migration 0097)');

const describeDb = getDescribeDb();

/** The four looks: slug, display name, and the one-line description the catalog shows. */
const LOOKS = [
  { slug: 'bayfront', name: 'Bayfront', blurb: 'Photo-led and modern.' },
  { slug: 'heritage', name: 'Heritage', blurb: 'Formal and official.' },
  { slug: 'palm-grove', name: 'Palm Grove', blurb: 'Warm and friendly.' },
  { slug: 'plain-simple', name: 'Plain & Simple', blurb: 'No photos needed, larger text.' },
] as const;

/** A literal slug list for the queries below; the slugs are constants above. */
const SLUG_LIST = LOOKS.map((look) => `'${look.slug}'`).join(', ');

/** `ThemePresetTokens`' keys, sorted. */
const PRESET_TOKEN_KEYS = ['accentColor', 'bodyFont', 'headingFont', 'primaryColor', 'secondaryColor'];

const ALLOWED_FONT_NAMES: readonly string[] = ALLOWED_FONTS;

/** The slice of a postgres.js client both a connection and a transaction offer. */
type Queryable = Pick<postgres.Sql, 'unsafe'>;

type CatalogRow = { slug: string } & Record<string, unknown>;

interface Catalog {
  presets: CatalogRow[];
  layouts: CatalogRow[];
}

/** What one statement of the migration did: its SQL command and how many rows it touched. */
interface StatementOutcome {
  command: string;
  count: number;
}

/** The migration's statements, split the way drizzle's migrator splits a file. */
function migrationStatements(): string[] {
  return readFileSync(
    new URL('../../../../packages/db/migrations/0097_site_looks_catalog.sql', import.meta.url),
    'utf8',
  )
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Every column of the eight catalog rows, so "nothing changed" means every column. */
async function readCatalog(client: Queryable): Promise<Catalog> {
  const read = async (table: string): Promise<CatalogRow[]> => {
    const rows = await client.unsafe<{ row: CatalogRow }[]>(
      `SELECT to_jsonb(t) AS row FROM ${table} t WHERE t.slug IN (${SLUG_LIST}) ORDER BY t.slug`,
    );
    return rows.map((entry) => entry.row);
  };
  return { presets: await read('site_theme_presets'), layouts: await read('site_layout_metadata') };
}

function bySlug<T extends { slug: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.slug, row]));
}

describeDb('site looks catalog (migration 0097)', () => {
  let db: postgres.Sql;

  beforeAll(() => {
    db = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await db.end();
  });

  /** Apply the migration's statements in order on `client`, reporting what each did. */
  async function applyMigration(client: Queryable): Promise<StatementOutcome[]> {
    const outcomes: StatementOutcome[] = [];
    for (const statement of migrationStatements()) {
      const result = await client.unsafe(statement);
      outcomes.push({ command: result.command, count: result.count });
    }
    return outcomes;
  }

  /** Run `work` in a transaction and roll it back, handing back what `work` returned. */
  async function inRolledBackTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    class Rollback extends Error {}
    const outcome: { done: boolean; value?: T } = { done: false };
    await db
      .begin(async (tx) => {
        outcome.value = await work(tx);
        outcome.done = true;
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    if (!outcome.done) throw new Error('the transaction body did not finish');
    return outcome.value as T;
  }

  it('seeds the four presets with allowed fonts', async () => {
    const rows = await db.unsafe<
      {
        slug: string;
        display_name: string;
        description: string | null;
        tier: string;
        is_featured: boolean;
        is_archived: boolean;
        tokens: Record<string, unknown>;
        heading_font: string | null;
        body_font: string | null;
      }[]
    >(`
      SELECT slug, display_name, description, tier, is_featured, is_archived, tokens,
             tokens->>'headingFont' AS heading_font,
             tokens->>'bodyFont' AS body_font
      FROM site_theme_presets
      WHERE slug IN (${SLUG_LIST})
    `);
    const found = bySlug(rows);

    const problems: string[] = [];
    for (const look of LOOKS) {
      const row = found.get(look.slug);
      if (!row) {
        problems.push(`${look.slug}: no preset row`);
        continue;
      }
      if (row.display_name !== look.name) problems.push(`${look.slug}: display_name is "${row.display_name}"`);
      if (row.description !== look.blurb) problems.push(`${look.slug}: description is "${row.description}"`);
      if (row.tier !== 'essentials') problems.push(`${look.slug}: tier is "${row.tier}"`);
      if (!row.is_featured) problems.push(`${look.slug}: is not featured`);
      if (row.is_archived) problems.push(`${look.slug}: is archived`);

      const keys = Object.keys(row.tokens).sort();
      if (keys.join() !== PRESET_TOKEN_KEYS.join()) {
        problems.push(`${look.slug}: token keys are [${keys.join(', ')}]`);
      }
      for (const key of ['primaryColor', 'secondaryColor', 'accentColor']) {
        const value = row.tokens[key];
        if (typeof value !== 'string' || !isValidHexColor(value)) {
          problems.push(`${look.slug}: ${key} is ${JSON.stringify(value)}, not a six-digit hex colour`);
        }
      }
      if (row.heading_font === null || !ALLOWED_FONT_NAMES.includes(row.heading_font)) {
        problems.push(`${look.slug}: headingFont "${row.heading_font}" is not in ALLOWED_FONTS`);
      }
      if (row.body_font === null || !ALLOWED_FONT_NAMES.includes(row.body_font)) {
        problems.push(`${look.slug}: bodyFont "${row.body_font}" is not in ALLOWED_FONTS`);
      }
    }
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('seeds the four layouts pointing at their presets', async () => {
    const rows = await db.unsafe<
      {
        slug: string;
        display_name: string;
        tagline: string | null;
        description: string | null;
        tier: string;
        is_featured: boolean;
        is_archived: boolean;
        version: string;
        default_preset_slug: string | null;
        preset_slug: string | null;
      }[]
    >(`
      SELECT l.slug, l.display_name, l.tagline, l.description, l.tier, l.is_featured,
             l.is_archived, l.version, l.default_preset_slug, p.slug AS preset_slug
      FROM site_layout_metadata l
      LEFT JOIN site_theme_presets p ON p.slug = l.default_preset_slug
      WHERE l.slug IN (${SLUG_LIST})
    `);
    const found = bySlug(rows);

    const problems: string[] = [];
    for (const look of LOOKS) {
      const row = found.get(look.slug);
      if (!row) {
        problems.push(`${look.slug}: no layout row`);
        continue;
      }
      if (row.display_name !== look.name) problems.push(`${look.slug}: display_name is "${row.display_name}"`);
      if (row.tagline !== look.blurb) problems.push(`${look.slug}: tagline is "${row.tagline}"`);
      if (row.description !== look.blurb) problems.push(`${look.slug}: description is "${row.description}"`);
      if (row.tier !== 'essentials') problems.push(`${look.slug}: tier is "${row.tier}"`);
      if (!row.is_featured) problems.push(`${look.slug}: is not featured`);
      if (row.is_archived) problems.push(`${look.slug}: is archived`);
      if (row.version !== '1.0.0') problems.push(`${look.slug}: version is "${row.version}"`);
      if (row.default_preset_slug !== look.slug) {
        problems.push(`${look.slug}: default_preset_slug is "${row.default_preset_slug}"`);
      }
      if (row.preset_slug === null) {
        problems.push(`${look.slug}: default_preset_slug "${row.default_preset_slug}" matches no preset row`);
      }
    }
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('re-running the migration changes nothing', async () => {
    const before = await readCatalog(db);

    const rerun = await inRolledBackTransaction(async (tx) => ({
      outcomes: await applyMigration(tx),
      after: await readCatalog(tx),
    }));

    // Both INSERTs ran, and neither added, updated or removed a row.
    expect(rerun.outcomes).toEqual([
      { command: 'INSERT', count: 0 },
      { command: 'INSERT', count: 0 },
    ]);
    expect(rerun.after).toEqual(before);
  });

  it("re-running the migration keeps an administrator's edits", async () => {
    const rerun = await inRolledBackTransaction(async (tx) => {
      // What the console lets a platform administrator do to a catalog row.
      await tx.unsafe(`
        UPDATE site_theme_presets
        SET display_name = 'Edited colours', is_featured = false,
            tokens = tokens || '{"accentColor":"#000000"}'::jsonb
        WHERE slug = 'bayfront'
      `);
      await tx.unsafe(`
        UPDATE site_layout_metadata
        SET display_name = 'Edited layout', tagline = 'Edited tagline', is_archived = true
        WHERE slug = 'bayfront'
      `);
      const edited = await readCatalog(tx);
      await applyMigration(tx);
      return { edited, after: await readCatalog(tx) };
    });

    // The edits are still there after the re-run. Read back directly, so a
    // statement that edited no row cannot make the whole-catalog comparison below
    // pass vacuously.
    expect(bySlug(rerun.after.presets).get('bayfront')).toMatchObject({
      display_name: 'Edited colours',
      is_featured: false,
    });
    expect(bySlug(rerun.after.layouts).get('bayfront')).toMatchObject({
      display_name: 'Edited layout',
      tagline: 'Edited tagline',
      is_archived: true,
    });
    // And the re-run touched no other column of any row.
    expect(rerun.after).toEqual(rerun.edited);
  });
});

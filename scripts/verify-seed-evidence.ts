/* eslint-disable no-console */
import postgres from 'postgres';

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

const EXPECTED_CATEGORY_COUNTS = {
  'sunset-condos': 5,
  'palm-shores-hoa': 5,
  'sunset-ridge-apartments': 6,
} as const satisfies Record<(typeof DEMO_SLUGS)[number], number>;

interface CategoryCountRow {
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  category_count: number;
}

interface NullCategoryRow {
  slug: string;
  docs_without_category: number;
  total_docs: number;
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );

  const formatRow = (columns: string[]): string =>
    `| ${columns.map((column, index) => column.padEnd(widths[index]!)).join(' | ')} |`;
  const separator = `|-${widths.map((width) => '-'.repeat(width)).join('-|-')}-|`;

  return [formatRow(headers), separator, ...rows.map((row) => formatRow(row))].join('\n');
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function run(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL: Missing DATABASE_URL environment variable.');
    return 1;
  }

  let exitCode = 1;
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const databaseHost = new URL(databaseUrl).hostname;
    console.log(`Seed evidence verification host: ${databaseHost}`);

    const categoryRows = await sql<CategoryCountRow[]>`
      select
        c.slug,
        c.community_type,
        count(dc.id)::int as category_count
      from communities c
      left join document_categories dc
        on dc.community_id = c.id
        and dc.deleted_at is null
        and dc.is_system = true
      where c.slug in (${DEMO_SLUGS[0]}, ${DEMO_SLUGS[1]}, ${DEMO_SLUGS[2]})
      group by c.slug, c.community_type
      order by c.slug
    `;

    const nullCategoryRows = await sql<NullCategoryRow[]>`
      select
        c.slug,
        count(*) filter (where d.category_id is null)::int as docs_without_category,
        count(*)::int as total_docs
      from communities c
      join documents d
        on d.community_id = c.id
        and d.deleted_at is null
      where c.slug in (${DEMO_SLUGS[0]}, ${DEMO_SLUGS[1]}, ${DEMO_SLUGS[2]})
      group by c.slug
      order by c.slug
    `;

    const categoryBySlug = new Map(categoryRows.map((row) => [row.slug, row]));
    const nullBySlug = new Map(nullCategoryRows.map((row) => [row.slug, row]));

    const failures: string[] = [];

    const categoryTableRows: string[][] = DEMO_SLUGS.map((slug) => {
      const expected = EXPECTED_CATEGORY_COUNTS[slug];
      const actual = categoryBySlug.get(slug)?.category_count;
      const status = actual === expected ? 'PASS' : 'FAIL';

      if (status === 'FAIL') {
        failures.push(
          `${slug}: expected ${String(expected)} system categories, got ${String(actual ?? 'missing')}.`,
        );
      }

      return [slug, String(expected), String(actual ?? 'missing'), status];
    });

    const nullCategoryTableRows: string[][] = DEMO_SLUGS.map((slug) => {
      const row = nullBySlug.get(slug);
      const actual = row?.docs_without_category;
      const totalDocs = row?.total_docs;
      const status = actual === 0 ? 'PASS' : 'FAIL';

      if (status === 'FAIL') {
        failures.push(
          `${slug}: expected docs_without_category=0, got ${String(actual ?? 'missing')} (total_docs=${String(totalDocs ?? 'missing')}).`,
        );
      }

      return [
        slug,
        '0',
        String(actual ?? 'missing'),
        String(totalDocs ?? 'missing'),
        status,
      ];
    });

    console.log('\nSystem Category Coverage');
    console.log(
      formatTable(
        ['slug', 'expected_category_count', 'actual_category_count', 'status'],
        categoryTableRows,
      ),
    );

    console.log('\nDocument Category Null Check');
    console.log(
      formatTable(
        ['slug', 'expected_docs_without_category', 'actual_docs_without_category', 'total_docs', 'status'],
        nullCategoryTableRows,
      ),
    );

    if (failures.length === 0) {
      console.log('\nPASS: Seed evidence verification checks passed.');
      exitCode = 0;
    } else {
      console.error('\nFAIL: Seed evidence verification checks failed.');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL: Seed evidence verification query failed: ${summarizeError(error)}`);
    exitCode = 1;
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      console.error(`FAIL: Could not close postgres-js client cleanly: ${summarizeError(error)}`);
      exitCode = 1;
    }
  }

  return exitCode;
}

run()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(`FAIL: Unexpected verifier error: ${summarizeError(error)}`);
    process.exit(1);
  });

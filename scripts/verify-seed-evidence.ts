/* eslint-disable no-console */
import postgres from 'postgres';
import { createAdminClient } from '@propertypro/db';

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

const EXPECTED_CATEGORY_COUNTS = {
  'sunset-condos': 5,
  'palm-shores-hoa': 5,
  'sunset-ridge-apartments': 6,
} as const satisfies Record<(typeof DEMO_SLUGS)[number], number>;

const EXPECTED_ESIGN_TEMPLATE_COUNTS = {
  'sunset-condos': 2,
  'palm-shores-hoa': 2,
  'sunset-ridge-apartments': 2,
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

interface EsignTemplateRow {
  slug: string;
  template_id: number;
  template_name: string;
  source_document_path: string | null;
}

interface StorageCheckResult {
  slug: string;
  templateName: string;
  sourcePath: string | null;
  storageStatus: 'PASS' | 'FAIL';
  storageMessage: string;
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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'FAIL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.',
    );
    return 1;
  }

  let exitCode = 1;
  const sql = postgres(databaseUrl, { prepare: false });
  const admin = createAdminClient();

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

    const esignTemplateRows = await sql<EsignTemplateRow[]>`
      select
        c.slug,
        et.id as template_id,
        et.name as template_name,
        et.source_document_path
      from communities c
      left join esign_templates et
        on et.community_id = c.id
        and et.deleted_at is null
        and et.status = 'active'
      where c.slug in (${DEMO_SLUGS[0]}, ${DEMO_SLUGS[1]}, ${DEMO_SLUGS[2]})
      order by c.slug, et.id
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

    const esignRowsBySlug = new Map<
      string,
      EsignTemplateRow[]
    >();
    for (const row of esignTemplateRows) {
      const list = esignRowsBySlug.get(row.slug) ?? [];
      if (row.template_id) {
        list.push(row);
      }
      esignRowsBySlug.set(row.slug, list);
    }

    const esignCountRows: string[][] = DEMO_SLUGS.map((slug) => {
      const expected = EXPECTED_ESIGN_TEMPLATE_COUNTS[slug];
      const actualRows = esignRowsBySlug.get(slug) ?? [];
      const withSourcePdf = actualRows.filter((row) => !!row.source_document_path).length;
      const status =
        actualRows.length === expected && withSourcePdf === expected ? 'PASS' : 'FAIL';

      if (actualRows.length !== expected) {
        failures.push(
          `${slug}: expected ${String(expected)} active e-sign templates, got ${String(actualRows.length)}.`,
        );
      }

      if (withSourcePdf !== expected) {
        failures.push(
          `${slug}: expected ${String(expected)} active e-sign templates with source PDFs, got ${String(withSourcePdf)}.`,
        );
      }

      return [slug, String(expected), String(actualRows.length), String(withSourcePdf), status];
    });

    console.log('\nE-Sign Template Coverage');
    console.log(
      formatTable(
        ['slug', 'expected_active_templates', 'actual_active_templates', 'with_source_pdf', 'status'],
        esignCountRows,
      ),
    );

    const storageChecks: StorageCheckResult[] = [];
    for (const slug of DEMO_SLUGS) {
      for (const row of esignRowsBySlug.get(slug) ?? []) {
        if (!row.source_document_path) {
          storageChecks.push({
            slug,
            templateName: row.template_name,
            sourcePath: null,
            storageStatus: 'FAIL',
            storageMessage: 'Missing source_document_path',
          });
          continue;
        }

        const folder = row.source_document_path.slice(
          0,
          Math.max(row.source_document_path.lastIndexOf('/'), 0),
        );
        const fileName = row.source_document_path.slice(
          row.source_document_path.lastIndexOf('/') + 1,
        );

        const { data: listing, error: listError } = await admin.storage
          .from('documents')
          .list(folder, { limit: 100, search: fileName });

        if (listError) {
          failures.push(
            `${slug}: failed to list storage for ${row.template_name}: ${listError.message}.`,
          );
          storageChecks.push({
            slug,
            templateName: row.template_name,
            sourcePath: row.source_document_path,
            storageStatus: 'FAIL',
            storageMessage: `List failed: ${listError.message}`,
          });
          continue;
        }

        const listed = (listing ?? []).some((file) => file.name === fileName);
        if (!listed) {
          failures.push(
            `${slug}: storage object missing for ${row.template_name} at ${row.source_document_path}.`,
          );
          storageChecks.push({
            slug,
            templateName: row.template_name,
            sourcePath: row.source_document_path,
            storageStatus: 'FAIL',
            storageMessage: 'Object missing from storage listing',
          });
          continue;
        }

        const { data: fileData, error: downloadError } = await admin.storage
          .from('documents')
          .download(row.source_document_path);

        if (downloadError || !fileData) {
          failures.push(
            `${slug}: failed to download source PDF for ${row.template_name}: ${downloadError?.message ?? 'No data returned'}.`,
          );
          storageChecks.push({
            slug,
            templateName: row.template_name,
            sourcePath: row.source_document_path,
            storageStatus: 'FAIL',
            storageMessage: `Download failed: ${downloadError?.message ?? 'No data returned'}`,
          });
          continue;
        }

        storageChecks.push({
          slug,
          templateName: row.template_name,
          sourcePath: row.source_document_path,
          storageStatus: 'PASS',
          storageMessage: 'Listed and downloadable',
        });
      }
    }

    console.log('\nE-Sign Storage Check');
    console.log(
      formatTable(
        ['slug', 'template_name', 'source_path', 'storage_status', 'details'],
        storageChecks.map((row) => [
          row.slug,
          row.templateName,
          row.sourcePath ?? 'missing',
          row.storageStatus,
          row.storageMessage,
        ]),
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

/* eslint-disable no-console */
import postgres from 'postgres';
// AUTHZ: CLI/verification script — the service-role client is only reachable
// from this guarded subpath (DBB-01, #803 removed the root-barrel re-export).
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getDefaultDocumentCategories, type CommunityType } from '@propertypro/shared';

const DEMO_SLUGS = ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments'] as const;

/**
 * Derived, never hard-coded.
 *
 * The seed provisions demo communities from `getDefaultDocumentCategories()` —
 * the same list production uses — so a literal here is a copy of a list that
 * grows without it. It had gone stale exactly that way: the expectation still
 * said 5/5/6 while both default sets had grown to 8, so this check failed on a
 * correctly-seeded database.
 */
function expectedCategoryCount(communityType: CommunityType): number {
  return getDefaultDocumentCategories(communityType).length;
}

const EXPECTED_ESIGN_TEMPLATE_COUNTS = {
  'sunset-condos': 2,
  'palm-shores-hoa': 2,
  'sunset-ridge-apartments': 2,
} as const satisfies Record<(typeof DEMO_SLUGS)[number], number>;

const STORAGE_RETRY_DELAYS_MS = [400, 1000, 2000] as const;

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

interface SeededDocumentRow {
  slug: string;
  document_id: number;
  document_title: string;
  file_path: string;
}

interface UserIdDriftRow {
  email: string;
  public_user_id: string;
  auth_user_id: string;
}

interface StorageCheckResult {
  slug: string;
  itemName: string;
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

function isRetryableStorageError(message: string): boolean {
  return /bad gateway|gateway timeout|fetch failed|timed out|timeout|503|504|no data returned|\{\}/i.test(
    message,
  );
}

async function retryStorageVerification<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = summarizeError(error);
      if (!isRetryableStorageError(message) || attempt === STORAGE_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, STORAGE_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw new Error('Storage verification retry loop exited without resolving.');
}

async function verifyStorageObject(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
  itemName: string,
  sourcePath: string | null,
): Promise<StorageCheckResult> {
  if (!sourcePath) {
    return {
      slug,
      itemName,
      sourcePath: null,
      storageStatus: 'FAIL',
      storageMessage: 'Missing storage path',
    };
  }

  const folder = sourcePath.slice(
    0,
    Math.max(sourcePath.lastIndexOf('/'), 0),
  );
  const fileName = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);

  let listing;
  try {
    listing = await retryStorageVerification(async () => {
      const result = await admin.storage
        .from('documents')
        .list(folder, { limit: 100, search: fileName });

      if (result.error) {
        throw new Error(`List failed: ${result.error.message}`);
      }

      return result.data;
    });
  } catch (error) {
    return {
      slug,
      itemName,
      sourcePath,
      storageStatus: 'FAIL',
      storageMessage: summarizeError(error),
    };
  }

  const listed = (listing ?? []).some((file) => file.name === fileName);
  if (!listed) {
    return {
      slug,
      itemName,
      sourcePath,
      storageStatus: 'FAIL',
      storageMessage: 'Object missing from storage listing',
    };
  }

  try {
    await retryStorageVerification(async () => {
      const result = await admin.storage
        .from('documents')
        .download(sourcePath);

      if (result.error || !result.data) {
        throw new Error(`Download failed: ${result.error?.message ?? 'No data returned'}`);
      }

      return result.data;
    });
  } catch (error) {
    return {
      slug,
      itemName,
      sourcePath,
      storageStatus: 'FAIL',
      storageMessage: summarizeError(error),
    };
  }

  return {
    slug,
    itemName,
    sourcePath,
    storageStatus: 'PASS',
    storageMessage: 'Listed and downloadable',
  };
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
        and (
          d.file_path like 'transparency/%'
          or d.file_path like 'demo/%'
        )
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

    const seededDocumentRows = await sql<SeededDocumentRow[]>`
      select
        c.slug,
        d.id as document_id,
        d.title as document_title,
        d.file_path
      from communities c
      join documents d
        on d.community_id = c.id
        and d.deleted_at is null
      where c.slug in (${DEMO_SLUGS[0]}, ${DEMO_SLUGS[1]}, ${DEMO_SLUGS[2]})
        and (
          d.file_path like 'transparency/%'
          or d.file_path like 'demo/%'
        )
      order by c.slug, d.id
    `;

    const categoryBySlug = new Map(categoryRows.map((row) => [row.slug, row]));
    const nullBySlug = new Map(nullCategoryRows.map((row) => [row.slug, row]));

    const failures: string[] = [];

    const categoryTableRows: string[][] = DEMO_SLUGS.map((slug) => {
      const row = categoryBySlug.get(slug);
      // A missing community is its own failure — reporting it as a count
      // mismatch against a guessed expectation would name the wrong problem.
      if (!row) {
        failures.push(`${slug}: community not found.`);
        return [slug, 'n/a', 'missing', 'FAIL'];
      }

      const expected = expectedCategoryCount(row.community_type);
      const actual = row.category_count;
      const status = actual === expected ? 'PASS' : 'FAIL';

      if (status === 'FAIL') {
        failures.push(
          `${slug}: expected ${String(expected)} system categories, got ${String(actual)}.`,
        );
      }

      return [slug, String(expected), String(actual), status];
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

    console.log('\nSeeded Document Category Null Check');
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
        const check = await verifyStorageObject(
          admin,
          slug,
          row.template_name,
          row.source_document_path,
        );
        storageChecks.push(check);

        if (check.storageStatus === 'FAIL') {
          failures.push(
            `${slug}: e-sign storage check failed for ${row.template_name} at ${row.source_document_path ?? 'missing'} (${check.storageMessage}).`,
          );
        }
      }
    }

    console.log('\nE-Sign Storage Check');
    console.log(
      formatTable(
        ['slug', 'item_name', 'source_path', 'storage_status', 'details'],
        storageChecks.map((row) => [
          row.slug,
          row.itemName,
          row.sourcePath ?? 'missing',
          row.storageStatus,
          row.storageMessage,
        ]),
      ),
    );

    const seededDocsBySlug = new Map<string, SeededDocumentRow[]>();
    for (const row of seededDocumentRows) {
      const list = seededDocsBySlug.get(row.slug) ?? [];
      list.push(row);
      seededDocsBySlug.set(row.slug, list);
    }

    const seededDocumentCountRows: string[][] = DEMO_SLUGS.map((slug) => {
      const rows = seededDocsBySlug.get(slug) ?? [];
      const status = rows.length > 0 ? 'PASS' : 'FAIL';

      if (rows.length === 0) {
        failures.push(`${slug}: expected at least one seeded document storage row, got 0.`);
      }

      return [slug, String(rows.length), status];
    });

    console.log('\nSeeded Document Coverage');
    console.log(
      formatTable(
        ['slug', 'seeded_document_rows', 'status'],
        seededDocumentCountRows,
      ),
    );

    const seededDocumentChecks: StorageCheckResult[] = [];
    for (const slug of DEMO_SLUGS) {
      for (const row of seededDocsBySlug.get(slug) ?? []) {
        const check = await verifyStorageObject(
          admin,
          slug,
          row.document_title,
          row.file_path,
        );
        seededDocumentChecks.push(check);

        if (check.storageStatus === 'FAIL') {
          failures.push(
            `${slug}: seeded document storage check failed for ${row.document_title} at ${row.file_path} (${check.storageMessage}).`,
          );
        }
      }
    }

    console.log('\nSeeded Document Storage Check');
    console.log(
      formatTable(
        ['slug', 'item_name', 'source_path', 'storage_status', 'details'],
        seededDocumentChecks.map((row) => [
          row.slug,
          row.itemName,
          row.sourcePath ?? 'missing',
          row.storageStatus,
          row.storageMessage,
        ]),
      ),
    );

    const userIdDriftRows = await sql<UserIdDriftRow[]>`
      select
        u.email,
        u.id::text as public_user_id,
        a.id::text as auth_user_id
      from public.users u
      join auth.users a on a.email = u.email
      where u.id <> a.id
      order by u.email
    `;

    console.log('\nPublic/Auth User ID Drift Check');
    if (userIdDriftRows.length === 0) {
      console.log('PASS: No drift between public.users.id and auth.users.id.');
    } else {
      console.log(
        formatTable(
          ['email', 'public_user_id', 'auth_user_id'],
          userIdDriftRows.map((row) => [row.email, row.public_user_id, row.auth_user_id]),
        ),
      );
      for (const row of userIdDriftRows) {
        failures.push(
          `User id drift: ${row.email} public.users.id=${row.public_user_id} differs from auth.users.id=${row.auth_user_id}.`,
        );
      }
    }

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

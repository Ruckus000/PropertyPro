import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { documents } from '../src/schema/documents';
import { searchDocuments } from '../src/queries/document-search';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const COMMUNITY_A_SLUG = '__test_doc_search_community_a__';
const COMMUNITY_B_SLUG = '__test_doc_search_community_b__';
const FILE_NAMES = [
  '__test_doc_search_a_minutes__.pdf',
  '__test_doc_search_a_budget__.pdf',
  '__test_doc_search_b_minutes__.pdf',
];

describeDb('document search integration', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let communityAId: number;
  let communityBId: number;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    await db.delete(communities).where(eq(communities.slug, COMMUNITY_A_SLUG));
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_B_SLUG));

    const [communityA] = await db
      .insert(communities)
      .values({
        name: 'Doc Search Community A',
        slug: COMMUNITY_A_SLUG,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning();

    const [communityB] = await db
      .insert(communities)
      .values({
        name: 'Doc Search Community B',
        slug: COMMUNITY_B_SLUG,
        communityType: 'hoa_720',
        timezone: 'America/Chicago',
      })
      .returning();

    communityAId = communityA!.id;
    communityBId = communityB!.id;
  });

  beforeEach(async () => {
    for (const fileName of FILE_NAMES) {
      await db.delete(documents).where(eq(documents.fileName, fileName));
    }

    await db.insert(documents).values([
      {
        communityId: communityAId,
        title: 'Board Minutes Q1',
        description: 'Minutes for quarterly board meeting',
        filePath: 'communities/a/documents/minutes-q1.pdf',
        fileName: '__test_doc_search_a_minutes__.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        searchText: 'board minutes quarterly governance',
      },
      {
        communityId: communityAId,
        title: 'Budget Memo',
        description: 'Annual budget allocation',
        filePath: 'communities/a/documents/budget.pdf',
        fileName: '__test_doc_search_a_budget__.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        searchText: 'budget planning reserve study',
      },
      {
        communityId: communityBId,
        title: 'Minutes from other tenant',
        description: 'Should not leak to community A',
        filePath: 'communities/b/documents/minutes.pdf',
        fileName: '__test_doc_search_b_minutes__.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        searchText: 'board minutes from another tenant',
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_A_SLUG));
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_B_SLUG));
    await sql.end();
  });

  it('returns only current-community results for full-text query', async () => {
    const result = await searchDocuments({
      communityId: communityAId,
      query: 'minutes',
      limit: 20,
    });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((row) => row.fileName === '__test_doc_search_a_minutes__.pdf')).toBe(true);
    expect(result.data.some((row) => row.fileName === '__test_doc_search_b_minutes__.pdf')).toBe(false);
  });

  it('applies mime-type and category/date filters with empty query', async () => {
    const result = await searchDocuments({
      communityId: communityAId,
      query: '',
      mimeType: 'application/pdf',
      limit: 20,
    });

    expect(result.data.every((row) => row.mimeType === 'application/pdf')).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });
});

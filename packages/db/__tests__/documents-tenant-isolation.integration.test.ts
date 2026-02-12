/**
 * Integration tests for document tenant isolation through scoped client.
 * Requires DATABASE_URL and uses real database behavior (no mocks).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { documents } from '../src/schema/documents';

type CreateScopedClient = typeof import('../src/scoped-client').createScopedClient;

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const COMMUNITY_A_SLUG = '__test_docs_iso_community_a__';
const COMMUNITY_B_SLUG = '__test_docs_iso_community_b__';

const TEST_FILE_NAMES = [
  '__test_docs_iso_a_visible__.pdf',
  '__test_docs_iso_b_hidden__.pdf',
  '__test_docs_iso_a_only__.pdf',
  '__test_docs_iso_forged__.pdf',
  '__test_docs_iso_conflict__.pdf',
];

describeDb('documents tenant isolation (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let communityAId: number;
  let communityBId: number;
  let createScopedClient: CreateScopedClient;

  beforeAll(async () => {
    createScopedClient = (await import('../src/scoped-client')).createScopedClient;

    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    // Reset test communities (cascade clears child records).
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_A_SLUG));
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_B_SLUG));

    const [communityA] = await db
      .insert(communities)
      .values({
        name: 'Docs Isolation Community A',
        slug: COMMUNITY_A_SLUG,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning();

    const [communityB] = await db
      .insert(communities)
      .values({
        name: 'Docs Isolation Community B',
        slug: COMMUNITY_B_SLUG,
        communityType: 'hoa_720',
        timezone: 'America/Chicago',
      })
      .returning();

    communityAId = communityA!.id;
    communityBId = communityB!.id;
  });

  beforeEach(async () => {
    for (const fileName of TEST_FILE_NAMES) {
      await db.delete(documents).where(eq(documents.fileName, fileName));
    }
  });

  afterAll(async () => {
    if (db) {
      await db.delete(communities).where(eq(communities.slug, COMMUNITY_A_SLUG));
      await db.delete(communities).where(eq(communities.slug, COMMUNITY_B_SLUG));
    }

    if (sql) {
      await sql.end();
    }
  });

  it('community A scoped client sees only community A documents', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);

    await clientA.insert(documents, {
      title: 'A Visible Doc',
      filePath: 'communities/a/documents/a-visible.pdf',
      fileName: '__test_docs_iso_a_visible__.pdf',
      fileSize: 1234,
      mimeType: 'application/pdf',
    });

    await clientB.insert(documents, {
      title: 'B Hidden Doc',
      filePath: 'communities/b/documents/b-hidden.pdf',
      fileName: '__test_docs_iso_b_hidden__.pdf',
      fileSize: 5678,
      mimeType: 'application/pdf',
    });

    const rows = await clientA.query(documents);
    const aDoc = rows.find((row) => row['fileName'] === '__test_docs_iso_a_visible__.pdf');
    const bDoc = rows.find((row) => row['fileName'] === '__test_docs_iso_b_hidden__.pdf');

    expect(aDoc).toBeDefined();
    expect(aDoc!['communityId']).toBe(communityAId);
    expect(bDoc).toBeUndefined();
  });

  it('community B scoped client cannot read community A documents', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);

    await clientA.insert(documents, {
      title: 'A Only Doc',
      filePath: 'communities/a/documents/a-only.pdf',
      fileName: '__test_docs_iso_a_only__.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
    });

    const rows = await clientB.query(documents);
    const leaked = rows.find((row) => row['fileName'] === '__test_docs_iso_a_only__.pdf');

    expect(leaked).toBeUndefined();
  });

  it('scoped insert overrides forged communityId value', async () => {
    const clientA = createScopedClient(communityAId, db);

    const [inserted] = await clientA.insert(documents, {
      communityId: communityBId,
      title: 'Forged Community Insert',
      filePath: 'communities/a/documents/forged.pdf',
      fileName: '__test_docs_iso_forged__.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
    });

    expect(inserted).toBeDefined();
    expect((inserted as Record<string, unknown>)['communityId']).toBe(communityAId);
  });

  it('conflicting tenant predicate cannot bypass scoping', async () => {
    const clientA = createScopedClient(communityAId, db);

    const [inserted] = await clientA.insert(documents, {
      title: 'Conflicting Predicate Doc',
      filePath: 'communities/a/documents/conflict.pdf',
      fileName: '__test_docs_iso_conflict__.pdf',
      fileSize: 8192,
      mimeType: 'application/pdf',
    });

    const documentId = (inserted as Record<string, unknown>)['id'] as number;

    const updated = await clientA.update(
      documents,
      { title: 'Bypass Attempt' },
      and(
        eq(documents.id, documentId),
        eq(documents.communityId, communityBId),
      ),
    );
    expect(updated).toHaveLength(0);

    const deleted = await clientA.hardDelete(
      documents,
      and(
        eq(documents.id, documentId),
        eq(documents.communityId, communityBId),
      ),
    );
    expect(deleted).toHaveLength(0);

    const rows = await clientA.query(documents);
    const stillPresent = rows.find((row) => row['id'] === documentId);
    expect(stillPresent).toBeDefined();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { documentCategories } from '../src/schema/document-categories';
import { documents } from '../src/schema/documents';
import {
  getAccessibleDocuments,
  getDocumentWithAccessCheck,
} from '../src/queries/document-access';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const CONDO_SLUG = '__test_doc_access_condo__';
const APARTMENT_SLUG = '__test_doc_access_apartment__';

describeDb('document access control (integration, strict matrix)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let condoId: number;
  let apartmentId: number;
  const fileNames: string[] = [];

  async function createCategory(communityId: number, name: string): Promise<number> {
    const [row] = await db
      .insert(documentCategories)
      .values({
        communityId,
        name,
        description: `Category: ${name}`,
      })
      .returning({ id: documentCategories.id });
    return row!.id;
  }

  async function createDoc(params: {
    communityId: number;
    categoryId: number | null;
    title: string;
    fileName: string;
  }): Promise<number> {
    fileNames.push(params.fileName);
    const [row] = await db
      .insert(documents)
      .values({
        communityId: params.communityId,
        categoryId: params.categoryId,
        title: params.title,
        filePath: `communities/${params.communityId}/documents/${params.fileName}`,
        fileName: params.fileName,
        fileSize: 1024,
        mimeType: 'application/pdf',
      })
      .returning({ id: documents.id });
    return row!.id;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    await db.delete(communities).where(eq(communities.slug, CONDO_SLUG));
    await db.delete(communities).where(eq(communities.slug, APARTMENT_SLUG));

    const [condo] = await db
      .insert(communities)
      .values({
        name: 'Document Access Condo',
        slug: CONDO_SLUG,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning();
    condoId = condo!.id;

    const [apartment] = await db
      .insert(communities)
      .values({
        name: 'Document Access Apartment',
        slug: APARTMENT_SLUG,
        communityType: 'apartment',
        timezone: 'America/Chicago',
      })
      .returning();
    apartmentId = apartment!.id;
  });

  beforeEach(async () => {
    if (fileNames.length > 0) {
      await db.delete(documents).where(eq(documents.fileName, fileNames[fileNames.length - 1]!));
      for (const fileName of fileNames.slice(0, -1)) {
        await db.delete(documents).where(eq(documents.fileName, fileName));
      }
      fileNames.length = 0;
    }

    await db.delete(documentCategories).where(
      and(
        eq(documentCategories.communityId, condoId),
        eq(documentCategories.isSystem, false),
      ),
    );
    await db.delete(documentCategories).where(
      and(
        eq(documentCategories.communityId, apartmentId),
        eq(documentCategories.isSystem, false),
      ),
    );
  });

  afterAll(async () => {
    await db.delete(communities).where(eq(communities.slug, CONDO_SLUG));
    await db.delete(communities).where(eq(communities.slug, APARTMENT_SLUG));
    await sql.end();
  });

  it('condo tenant sees only declaration/rules/inspection docs', async () => {
    const declarationId = await createCategory(condoId, 'Declaration');
    const rulesId = await createCategory(condoId, 'Rules & Regulations');
    const inspectionId = await createCategory(condoId, 'Inspection Reports');
    const meetingId = await createCategory(condoId, 'Meeting Minutes');
    const unknownId = await createCategory(condoId, 'Board Packets');

    await createDoc({ communityId: condoId, categoryId: declarationId, title: 'Decl', fileName: '__doc_access_decl__.pdf' });
    await createDoc({ communityId: condoId, categoryId: rulesId, title: 'Rules', fileName: '__doc_access_rules__.pdf' });
    await createDoc({ communityId: condoId, categoryId: inspectionId, title: 'Inspect', fileName: '__doc_access_inspect__.pdf' });
    await createDoc({ communityId: condoId, categoryId: meetingId, title: 'Minutes', fileName: '__doc_access_minutes__.pdf' });
    await createDoc({ communityId: condoId, categoryId: unknownId, title: 'Unknown', fileName: '__doc_access_unknown__.pdf' });
    await createDoc({ communityId: condoId, categoryId: null, title: 'No Category', fileName: '__doc_access_null__.pdf' });

    const rows = await getAccessibleDocuments({
      communityId: condoId,
      role: 'resident', isUnitOwner: false,
      communityType: 'condo_718',
    });
    const names = rows.map((r) => r['fileName']);

    expect(names).toEqual(expect.arrayContaining([
      '__doc_access_decl__.pdf',
      '__doc_access_rules__.pdf',
      '__doc_access_inspect__.pdf',
    ]));
    expect(names).not.toContain('__doc_access_minutes__.pdf');
    expect(names).not.toContain('__doc_access_unknown__.pdf');
    expect(names).not.toContain('__doc_access_null__.pdf');
  });

  it('apartment tenant sees lease/rules/handbook/move docs only', async () => {
    const leaseId = await createCategory(apartmentId, 'Lease Docs');
    const rulesId = await createCategory(apartmentId, 'Rules');
    const handbookId = await createCategory(apartmentId, 'Community Handbook');
    const moveId = await createCategory(apartmentId, 'Move In/Out Docs');
    const maintId = await createCategory(apartmentId, 'Maintenance Records');
    const unknownId = await createCategory(apartmentId, 'Financial Reports');

    await createDoc({ communityId: apartmentId, categoryId: leaseId, title: 'Lease', fileName: '__doc_access_ap_lease__.pdf' });
    await createDoc({ communityId: apartmentId, categoryId: rulesId, title: 'Rules', fileName: '__doc_access_ap_rules__.pdf' });
    await createDoc({ communityId: apartmentId, categoryId: handbookId, title: 'Handbook', fileName: '__doc_access_ap_handbook__.pdf' });
    await createDoc({ communityId: apartmentId, categoryId: moveId, title: 'Move', fileName: '__doc_access_ap_move__.pdf' });
    await createDoc({ communityId: apartmentId, categoryId: maintId, title: 'Maint', fileName: '__doc_access_ap_maint__.pdf' });
    await createDoc({ communityId: apartmentId, categoryId: unknownId, title: 'Unknown', fileName: '__doc_access_ap_unknown__.pdf' });

    const rows = await getAccessibleDocuments({
      communityId: apartmentId,
      role: 'resident', isUnitOwner: false,
      communityType: 'apartment',
    });
    const names = rows.map((r) => r['fileName']);

    expect(names).toEqual(expect.arrayContaining([
      '__doc_access_ap_lease__.pdf',
      '__doc_access_ap_rules__.pdf',
      '__doc_access_ap_handbook__.pdf',
      '__doc_access_ap_move__.pdf',
    ]));
    expect(names).not.toContain('__doc_access_ap_maint__.pdf');
    expect(names).not.toContain('__doc_access_ap_unknown__.pdf');
  });

  it('unknown category is denied to restricted role but allowed for elevated role', async () => {
    const unknownId = await createCategory(condoId, 'Custom Board Packet');
    const docId = await createDoc({
      communityId: condoId,
      categoryId: unknownId,
      title: 'Unknown Category Document',
      fileName: '__doc_access_unknown_only__.pdf',
    });

    const restricted = await getDocumentWithAccessCheck({
      communityId: condoId,
      role: 'resident', isUnitOwner: false,
      communityType: 'condo_718',
    }, docId);
    expect(restricted).toBeNull();

    const elevated = await getDocumentWithAccessCheck({
      communityId: condoId,
      role: 'resident', isUnitOwner: true,
      communityType: 'condo_718',
    }, docId);
    expect(elevated).not.toBeNull();
    expect(elevated?.['id']).toBe(docId);
  });
});


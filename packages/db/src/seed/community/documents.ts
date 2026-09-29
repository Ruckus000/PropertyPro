/** Document categories and registry-tracked seeded documents. */
import { and, eq } from '../../filters';
import { documentCategories, documents } from '../../schema';
import { getDefaultDocumentCategories } from '@propertypro/shared';
import { db } from './context';
import { lookupRegistry, upsertRegistryEntry } from './registry';
import { ensureSeededDocumentStorage } from './storage';
import type { DemoDocumentCategoryKey, SeededDocumentCategoryIds } from './types';

/**
 * Maps the seed's stable logical category keys to the provisioned production
 * category names per community type. Demo communities are seeded with the same
 * categories as production (getDefaultDocumentCategories), while the document
 * seeding below keeps referencing these logical keys unchanged.
 */
const DEMO_CATEGORY_NAME_BY_KEY: Record<
  'condo_718' | 'hoa_720' | 'apartment',
  Partial<Record<DemoDocumentCategoryKey, string>>
> = {
  condo_718: {
    declaration: 'Governing Documents',
    rules: 'Governing Documents',
    inspection_reports: 'Inspection Reports',
    meeting_minutes: 'Meeting Records',
    announcements: 'Correspondence',
  },
  hoa_720: {
    declaration: 'Governing Documents',
    rules: 'Governing Documents',
    inspection_reports: 'Inspection Reports',
    meeting_minutes: 'Meeting Records',
    announcements: 'Correspondence',
  },
  apartment: {
    rules: 'Rules',
    announcements: 'Communications',
    maintenance_records: 'Maintenance Records',
    inspection_reports: 'Compliance',
    lease_docs: 'Lease Agreements',
    community_handbook: 'Community Handbook',
    move_in_out_docs: 'Move In/Out Docs',
  },
};

export async function seedDocumentCategories(
  communityId: number,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): Promise<SeededDocumentCategoryIds> {
  // Demo communities use the same provisioned categories as production.
  const definitions = getDefaultDocumentCategories(communityType);

  const idByName = new Map<string, number>();
  for (const definition of definitions) {
    const existing = await db
      .select({ id: documentCategories.id })
      .from(documentCategories)
      .where(
        and(
          eq(documentCategories.communityId, communityId),
          eq(documentCategories.name, definition.name),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(documentCategories)
        .set({
          description: definition.description,
          isSystem: true,
          updatedAt: new Date(),
        })
        .where(eq(documentCategories.id, existing[0].id));
      idByName.set(definition.name, existing[0].id);
      continue;
    }

    const [created] = await db
      .insert(documentCategories)
      .values({
        communityId,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      })
      .returning({ id: documentCategories.id });

    if (created) {
      idByName.set(definition.name, created.id);
    }
  }

  // Resolve the seed's logical keys to provisioned category ids for this type.
  const nameByKey = DEMO_CATEGORY_NAME_BY_KEY[communityType];
  const categoryIds: SeededDocumentCategoryIds = {
    declaration: undefined,
    rules: undefined,
    inspection_reports: undefined,
    meeting_minutes: undefined,
    announcements: undefined,
    maintenance_records: undefined,
    lease_docs: undefined,
    community_handbook: undefined,
    move_in_out_docs: undefined,
  };
  for (const key of Object.keys(categoryIds) as DemoDocumentCategoryKey[]) {
    const name = nameByKey[key];
    categoryIds[key] = name ? idByName.get(name) : undefined;
  }

  return categoryIds;
}

export async function seedRegistryDocument(
  communityId: number,
  seedKey: string,
  title: string,
  fileName: string,
  searchText: string,
  categoryId: number | null = null,
): Promise<number> {
  const filePath = `demo/${communityId}/${seedKey}/${fileName}`;
  const fileSize = await ensureSeededDocumentStorage(filePath, title, searchText);

  const registryEntityId = await lookupRegistry('document', seedKey, communityId);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(documents)
      .set({
        title,
        fileName,
        filePath,
        mimeType: 'application/pdf',
        fileSize,
        searchText,
        categoryId,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    if (updated) return updated.id;
  }

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.communityId, communityId), eq(documents.filePath, filePath)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(documents)
      .set({
        title,
        fileName,
        filePath,
        mimeType: 'application/pdf',
        fileSize,
        searchText,
        categoryId,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, existing[0].id))
      .returning();
    if (updated) {
      await upsertRegistryEntry('document', seedKey, String(updated.id), communityId);
      return updated.id;
    }
  }

  const [created] = await db
    .insert(documents)
    .values({
      communityId,
      title,
      fileName,
      filePath,
      mimeType: 'application/pdf',
      fileSize,
      searchText,
      categoryId,
    })
    .returning();

  await upsertRegistryEntry('document', seedKey, String(created!.id), communityId);
  return created!.id;
}

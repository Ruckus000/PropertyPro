/**
 * PM bulk document upload — per-community insert helper.
 *
 * Inserts the same set of document records into one community using the
 * tenant-scoped client. Files are assumed to already be uploaded to
 * Supabase Storage; this helper only writes the DB rows.
 *
 * Caller is responsible for iterating across the requested communities (so
 * that per-community Promise.allSettled error capture stays at the route)
 * and for verifying PM permissions for each communityId BEFORE invoking.
 */
import { createScopedClient, documents } from '@propertypro/db';

export interface BulkDocumentInput {
  fileName: string;
  storagePath: string;
  categoryId?: number | null;
  description?: string | null;
}

/**
 * Insert every document in `docs` into `communityId`. Returns the number
 * of rows successfully written.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor is
 * a property_manager_admin in this community (typically via
 * `findManagedCommunitiesPortfolioUnscoped` + membership check).
 */
export async function insertBulkDocumentsForCommunity(params: {
  communityId: number;
  uploadedBy: string;
  docs: BulkDocumentInput[];
}): Promise<{ created: number }> {
  const { communityId, uploadedBy, docs } = params;
  const scoped = createScopedClient(communityId);
  let created = 0;
  for (const doc of docs) {
    await scoped.insert(documents, {
      title: doc.fileName,
      description: doc.description ?? null,
      categoryId: doc.categoryId ?? null,
      filePath: doc.storagePath,
      fileName: doc.fileName,
      fileSize: 0, // Size not tracked in bulk — already uploaded
      mimeType: 'application/octet-stream',
      uploadedBy,
    });
    created++;
  }
  return { created };
}

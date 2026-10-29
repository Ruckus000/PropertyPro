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
import { captureException } from '@sentry/nextjs';
import { createScopedClient, documents } from '@propertypro/db';
import { autoLinkCommunityRecords } from '@/lib/services/record-auto-link-service';

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
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor holds
 * property_manager or root_manager in this community. The bulk route does this
 * by requiring every target id to appear in
 * `findManagedCommunitiesPortfolioUnscoped`; containment in that map IS the
 * membership check.
 */
export async function insertBulkDocumentsForCommunity(params: {
  communityId: number;
  uploadedBy: string;
  docs: BulkDocumentInput[];
}): Promise<{ created: number }> {
  const { communityId, uploadedBy, docs } = params;
  const scoped = createScopedClient(communityId);
  let created = 0;
  const createdIds: number[] = [];
  for (const doc of docs) {
    const [row] = await scoped.insert(documents, {
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
    if (row) createdIds.push(Number(row['id']));
  }

  // Bulk rows are inserted posted, so link the records THESE rows unambiguously
  // fill (D12), with one read for the whole batch. Only these: linking the
  // documents the community already had is a backfill, which a person reviews
  // first. Bookkeeping: a failure is reported, never thrown, because the
  // documents are already saved.
  if (createdIds.length > 0) {
    try {
      await autoLinkCommunityRecords(communityId, uploadedBy, { documentIds: createdIds });
    } catch (err) {
      captureException(err, {
        tags: { record_auto_link: 'bulk_upload' },
        extra: { communityId },
      });
    }
  }
  return { created };
}

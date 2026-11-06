/**
 * PM bulk document upload — per-community insert helper.
 *
 * Creates the same set of documents in one community. Each row is written
 * through `createUploadedDocument`, the same path a single upload takes, so the
 * real size and MIME type are recorded and the creation is audit-logged.
 *
 * Caller is responsible for iterating across the requested communities (so
 * that per-community Promise.allSettled error capture stays at the route), for
 * verifying PM permissions, each storage path and the redaction attestation,
 * and for reading each file once with `readValidatedUpload` (its result is
 * `measured`) BEFORE invoking.
 */
import { captureException } from '@sentry/nextjs';
import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';
import { recordRedactionAttestation } from '@/lib/documents/redaction-attestation';
import { autoLinkCommunityRecords } from '@/lib/services/record-auto-link-service';

export interface BulkDocumentInput {
  fileName: string;
  storagePath: string;
  fileSize: number;
  description?: string | null;
  measured: { byteLength: number; mime: string };
}

/**
 * Create every document in `docs` in `communityId`. Returns the number of
 * rows created.
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

  // Before the first row exists, as on the single upload path. The route has
  // already refused a request without the attestation; bulk rows carry no
  // category, recorded as 0 like an unknown one.
  for (const doc of docs) {
    await recordRedactionAttestation({
      communityId,
      categoryId: 0,
      userId: uploadedBy,
      title: doc.fileName,
    });
  }

  const createdIds: number[] = [];
  for (const doc of docs) {
    const { document } = await createUploadedDocument({
      userId: uploadedBy,
      communityId,
      title: doc.fileName,
      description: doc.description ?? null,
      filePath: doc.storagePath,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      measured: doc.measured,
      sourceType: 'library',
      // Bulk uploads have never notified residents; unchanged here.
      sendDocumentNotifications: false,
      // ponytail: bulk PDFs get no text extraction (search misses their text),
      // as before; one job per community would re-download the shared file N
      // times. Trigger: a manager reports a bulk-uploaded PDF missing from search.
      extractText: false,
    });
    createdIds.push(Number(document['id']));
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
  return { created: createdIds.length };
}

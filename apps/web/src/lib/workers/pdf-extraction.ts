import { eq, sql } from 'drizzle-orm';
import { createPresignedDownloadUrl, createScopedClient, documents } from '@propertypro/db';
import { extractPdfText } from '@/lib/utils/extract-pdf-text';

type QueueParams = {
  communityId: number;
  documentId: number;
  bucket?: string; // default: 'documents'
  path: string;
  mimeType: string;
};

/**
 * Queue a background PDF text extraction and DB update.
 *
 * Fire-and-forget: errors are caught and logged without affecting callers.
 */
export function queuePdfExtraction(params: QueueParams): void {
  void (async () => {
    try {
      if (!params.mimeType.toLowerCase().includes('pdf')) return;

      const bucket = params.bucket ?? 'documents';

      // Create a short-lived signed URL and download file bytes
      const signedUrl = await createPresignedDownloadUrl(bucket, params.path, 300);
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`Failed to download pdf: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();

      // Extract text (uses pdf-parse when available, otherwise fallback)
      const text = (await extractPdfText(arrayBuffer)).trim();

      // Update document with search_text and search_vector
      const scoped = createScopedClient(params.communityId);
      await scoped.update(
        documents,
        {
          searchText: text,
          // Use to_tsvector to build the search vector inside Postgres
          searchVector: sql`to_tsvector('english', ${text})`,
        },
        eq(documents.id, params.documentId),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pdf-extraction] Failed to process document', {
        documentId: params.documentId,
        communityId: params.communityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}


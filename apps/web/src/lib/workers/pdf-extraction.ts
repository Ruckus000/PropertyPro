import {
  createPresignedDownloadUrl,
  updateDocumentExtractionFailure,
  updateDocumentExtractionSuccess,
} from '@propertypro/db';
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
 * Updates extraction status:
 * - 'completed' on success with text
 * - 'skipped' when pdf-parse returns empty text (likely a scanned PDF)
 * - 'failed' on error with error message
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

      if (text.length === 0) {
        // Empty text likely means scanned PDF or image-only PDF
        await updateDocumentExtractionSuccess({
          communityId: params.communityId,
          documentId: params.documentId,
          text,
          status: 'skipped',
        });
        return;
      }

      // Update document with search_text, search_vector, and extraction status
      await updateDocumentExtractionSuccess({
        communityId: params.communityId,
        documentId: params.documentId,
        text,
        status: 'completed',
      });
    } catch (err) {
      // Update extraction status to failed with error message
      try {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await updateDocumentExtractionFailure({
          communityId: params.communityId,
          documentId: params.documentId,
          errorMessage,
        });
      } catch (updateErr) {
        // If even the status update fails, just log it
        // eslint-disable-next-line no-console
        console.error('[pdf-extraction] Failed to update extraction status', {
          documentId: params.documentId,
          communityId: params.communityId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }

      // eslint-disable-next-line no-console
      console.error('[pdf-extraction] Failed to process document', {
        documentId: params.documentId,
        communityId: params.communityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

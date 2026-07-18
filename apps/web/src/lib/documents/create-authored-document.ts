/**
 * Create an in-app authored document — uploads pre-rendered PDF + source HTML
 * to the documents bucket and inserts a normal documents row with
 * source_type='authored'. Parallel to create-uploaded-document.ts (which
 * handles file uploads through magic-bytes validation), but the bytes here
 * are produced server-side by the publish pipeline so we trust them.
 *
 * Storage layout (side-by-side under the same prefix):
 *   authored/{communityId}/{uuid}.pdf   — the canonical artifact
 *   authored/{communityId}/{uuid}.html  — the source HTML for re-edit
 *
 * The .pdf path is recorded in documents.file_path; the .html path is
 * derived by extension swap on read.
 */
import { createScopedClient, documents, logAuditEvent } from '@propertypro/db';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AppError } from '@/lib/api/errors';
import { queuePdfExtraction } from '@/lib/workers/pdf-extraction';
import { createNotificationsForEvent, queueNotificationDetailed } from '@/lib/services/notification-service';
import type { DocumentMutationResult, DocumentMutationWarning } from './types';

interface CreateAuthoredDocumentInput {
  userId: string;
  communityId: number;
  title: string;
  description?: string | null;
  categoryId: number | null;
  parentDocumentId: number | null;
  pdfBytes: Uint8Array;
  htmlBytes: Uint8Array;
  /** Send "document posted" notifications. Default true. */
  sendDocumentNotifications?: boolean;
}

const NOTIFICATION_WARNING: DocumentMutationWarning = {
  code: 'notification_dispatch_failed',
  message: 'The document was published, but community notifications could not be sent.',
};

async function uploadServerBytes(
  bucket: 'documents',
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new AppError(
      `Failed to upload authored document artifact: ${error.message}`,
      500,
      'AUTHORED_UPLOAD_FAILED',
    );
  }
}

export async function createAuthoredDocument(
  input: CreateAuthoredDocumentInput,
): Promise<DocumentMutationResult> {
  const objectId = crypto.randomUUID();
  const pdfPath = `authored/${input.communityId}/${objectId}.pdf`;
  const htmlPath = `authored/${input.communityId}/${objectId}.html`;

  // Upload both side-by-side. Idempotent (upsert=true) for safe retry.
  await uploadServerBytes('documents', pdfPath, input.pdfBytes, 'application/pdf');
  await uploadServerBytes('documents', htmlPath, input.htmlBytes, 'text/html; charset=utf-8');

  const fileName = `${input.title.replace(/[^\w\s.-]/g, '').slice(0, 80) || 'document'}.pdf`;

  const scoped = createScopedClient(input.communityId);
  const insertedRows = (await scoped.insert(documents, {
    title: input.title,
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    filePath: pdfPath,
    fileName,
    fileSize: input.pdfBytes.byteLength,
    mimeType: 'application/pdf',
    sourceType: 'authored',
    parentDocumentId: input.parentDocumentId ?? null,
    uploadedBy: input.userId,
    extractionStatus: 'pending',
  })) as Array<Record<string, unknown>>;

  const created = insertedRows[0];
  if (!created) {
    throw new AppError('Failed to create authored document', 500, 'DOCUMENT_CREATE_FAILED');
  }

  const documentId = Number(created['id']);

  await logAuditEvent({
    userId: input.userId,
    action: 'create',
    resourceType: 'document',
    resourceId: String(documentId),
    communityId: input.communityId,
    newValues: {
      title: input.title,
      categoryId: input.categoryId ?? null,
      parentDocumentId: input.parentDocumentId ?? null,
      filePath: pdfPath,
      fileName,
      fileSize: input.pdfBytes.byteLength,
      mimeType: 'application/pdf',
      sourceType: 'authored',
    },
  });

  // Index the published PDF for full-text search via the existing worker.
  try {
    if (Number.isFinite(documentId)) {
      queuePdfExtraction({
        communityId: input.communityId,
        documentId,
        path: pdfPath,
        mimeType: 'application/pdf',
        bucket: 'documents',
      });
    }
  } catch {
    // Non-blocking.
  }

  const warnings: DocumentMutationWarning[] = [];

  if (input.sendDocumentNotifications !== false) {
    try {
      const notificationResult = await queueNotificationDetailed(
        input.communityId,
        {
          type: 'document_posted',
          documentTitle: input.title,
          uploadedByName: 'Community Team',
          documentId: String(documentId),
          sourceType: 'document',
          sourceId: String(documentId),
        },
        'all',
        input.userId,
      );
      if (notificationResult.failedCount > 0) {
        warnings.push(NOTIFICATION_WARNING);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[documents] authored notification dispatch failed', {
        communityId: input.communityId,
        documentId: String(documentId),
        error: err instanceof Error ? err.message : String(err),
      });
      warnings.push(NOTIFICATION_WARNING);
    }

    void createNotificationsForEvent(
      input.communityId,
      {
        category: 'document',
        title: `New Document: ${input.title}`,
        body: undefined,
        actionUrl: `/documents/${documentId}`,
        sourceType: 'document',
        sourceId: String(documentId),
      },
      'all',
      input.userId,
    ).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[documents] in-app notification failed', {
        communityId: input.communityId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return { document: created, warnings };
}

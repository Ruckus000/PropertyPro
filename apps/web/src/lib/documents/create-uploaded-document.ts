import {
  createPresignedDownloadUrl,
  createScopedClient,
  documents,
  logAuditEvent,
} from '@propertypro/db';
import { AppError, UnprocessableEntityError, ValidationError } from '@/lib/api/errors';
import { queuePdfExtraction } from '@/lib/workers/pdf-extraction';
import { validateFile } from '@/lib/utils/file-validation';
import { createNotificationsForEvent, queueNotificationDetailed } from '@/lib/services/notification-service';
import type { DocumentMutationResult, DocumentMutationWarning } from './types';

type DocumentSourceType = 'library' | 'violation_evidence';

interface CreateUploadedDocumentInput {
  userId: string;
  communityId: number;
  title: string;
  description?: string | null;
  categoryId?: number | null;
  filePath: string;
  fileName: string;
  fileSize: number;
  sourceType: DocumentSourceType;
  sendDocumentNotifications?: boolean;
}

interface InvalidUploadContext {
  userId: string;
  communityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  reason: string;
  message: string;
  details?: Record<string, unknown>;
}

const DOCUMENT_NOTIFICATION_WARNING: DocumentMutationWarning = {
  code: 'notification_dispatch_failed',
  message: 'The document was uploaded, but community notifications could not be sent.',
};

async function downloadStorageBytes(path: string): Promise<Uint8Array> {
  const signedUrl = await createPresignedDownloadUrl('documents', path, 300);
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new ValidationError(`Unable to read uploaded file from storage (status ${res.status})`);
  }

  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Reject an upload that failed validation: record it, then 422.
 *
 * DELIBERATELY DOES NOT DELETE THE OBJECT, and that is the fix for a real
 * vulnerability rather than an omission.
 *
 * This used to call `deleteStorageObject(context.filePath)` — a client-supplied
 * path — with no check that anything referenced it. The `documents` bucket also
 * holds e-sign templates, signed PDFs, audit certificates and processed logos
 * under sibling prefixes that `validateUploadFilePath` accepted, so a member
 * holding `documents:write` could name an executed contract, send a wrong
 * `fileSize`, and have the service-role client destroy it while the
 * `esign_submissions` row survived pointing at nothing.
 *
 * Making that delete safe needs a reference model covering every writer into
 * the bucket, kept complete forever, with no test able to prove completeness —
 * see `scripts/lib/document-object-orphans.ts`, which enumerates six of them.
 * This repo already declined that trade for the sibling bucket
 * (`scripts/reconcile-site-assets-usage.ts`: orphan deletion is "destructive and
 * irreversible, the orphan set depends on this script's reference model being
 * complete, and it needs a human looking at real numbers first").
 *
 * So the rejected bytes stay. They sit in a PRIVATE bucket with no row, which
 * makes them unreachable through every product surface — downloads are signed
 * URLs minted only for `documents` rows — and `pnpm documents:orphan-report`
 * lists them for an operator who can see real numbers before deciding. The
 * audit entry below is what records that a rejection happened at all.
 */
async function rejectInvalidUpload(context: InvalidUploadContext): Promise<never> {
  await logAuditEvent({
    userId: context.userId,
    action: 'validation_failed',
    resourceType: 'document_upload',
    resourceId: context.filePath,
    communityId: context.communityId,
    metadata: {
      reason: context.reason,
      filePath: context.filePath,
      fileName: context.fileName,
      fileSize: context.fileSize,
      // The object is intentionally left in place; `filePath` above is what an
      // operator needs to find it in the orphan report.
      objectRetained: true,
      ...(context.details ?? {}),
    },
  });

  throw new UnprocessableEntityError(context.message, {
    reason: context.reason,
  });
}

export async function createUploadedDocument(
  input: CreateUploadedDocumentInput,
): Promise<DocumentMutationResult> {
  const storageBytes = await downloadStorageBytes(input.filePath);
  if (storageBytes.byteLength !== input.fileSize) {
    await rejectInvalidUpload({
      userId: input.userId,
      communityId: input.communityId,
      filePath: input.filePath,
      fileName: input.fileName,
      fileSize: input.fileSize,
      reason: 'file_size_mismatch',
      message: 'Uploaded file failed validation. Please retry your upload.',
      details: {
        expectedFileSize: input.fileSize,
        actualFileSize: storageBytes.byteLength,
      },
    });
  }

  const validation = await validateFile(storageBytes, storageBytes.byteLength);
  if (!validation.ok || !validation.type) {
    await rejectInvalidUpload({
      userId: input.userId,
      communityId: input.communityId,
      filePath: input.filePath,
      fileName: input.fileName,
      fileSize: input.fileSize,
      reason: 'magic_bytes_validation_failed',
      message:
        validation.error
        ?? 'Uploaded file failed validation. Upload a supported PDF, DOCX, PNG, or JPG file.',
      details: {
        validationError: validation.error ?? null,
      },
    });
  }

  const detectedType = validation.type;
  if (!detectedType) {
    throw new ValidationError('Failed to detect uploaded file type');
  }

  const scoped = createScopedClient(input.communityId);
  const isPdf = detectedType.mime.toLowerCase().includes('pdf');
  const insertedRows = await scoped.insert(documents, {
    title: input.title,
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    filePath: input.filePath,
    fileName: input.fileName,
    fileSize: storageBytes.byteLength,
    mimeType: detectedType.mime,
    sourceType: input.sourceType,
    uploadedBy: input.userId,
    extractionStatus: isPdf ? 'pending' : 'not_applicable',
  });

  const created = insertedRows[0];
  if (!created) {
    throw new AppError('Failed to create document', 500, 'DOCUMENT_CREATE_FAILED');
  }

  await logAuditEvent({
    userId: input.userId,
    action: 'create',
    resourceType: 'document',
    resourceId: String(created['id']),
    communityId: input.communityId,
    newValues: {
      title: input.title,
      categoryId: input.categoryId ?? null,
      filePath: input.filePath,
      fileName: input.fileName,
      fileSize: storageBytes.byteLength,
      mimeType: detectedType.mime,
      sourceType: input.sourceType,
    },
  });

  try {
    if (isPdf) {
      const docId = Number((created as Record<string, unknown>)['id']);
      const communityId = Number((created as Record<string, unknown>)['communityId'] ?? input.communityId);
      if (Number.isFinite(docId) && Number.isFinite(communityId)) {
        queuePdfExtraction({
          communityId,
          documentId: docId,
          path: input.filePath,
          mimeType: detectedType.mime,
          bucket: 'documents',
        });
      }
    }
  } catch {
    // Never block document creation on extraction scheduling.
  }

  const warnings: DocumentMutationWarning[] = [];

  if (input.sourceType === 'library' && input.sendDocumentNotifications !== false) {
    try {
      const notificationResult = await queueNotificationDetailed(
        input.communityId,
        {
          type: 'document_posted',
          documentTitle: input.title,
          uploadedByName: 'Community Team',
          documentId: String(created['id']),
          sourceType: 'document',
          sourceId: String(created['id']),
        },
        'all',
        input.userId,
      );
      if (notificationResult.failedCount > 0) {
        warnings.push(DOCUMENT_NOTIFICATION_WARNING);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[documents] notification dispatch failed', {
        communityId: input.communityId,
        documentId: String(created['id']),
        error: error instanceof Error ? error.message : String(error),
      });
      warnings.push(DOCUMENT_NOTIFICATION_WARNING);
    }

    void createNotificationsForEvent(
      input.communityId,
      {
        category: 'document',
        title: `New Document: ${input.title}`,
        body: undefined,
        actionUrl: `/documents/${created['id']}`,
        sourceType: 'document',
        sourceId: String(created['id']),
      },
      'all',
      input.userId,
    ).catch((err: unknown) => {
      console.error('[documents] in-app notification failed', { communityId: input.communityId, error: err instanceof Error ? err.message : String(err) });
    });
  }

  return {
    document: created,
    warnings,
  };
}

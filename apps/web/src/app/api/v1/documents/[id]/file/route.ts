/**
 * Replace a document's file.
 *
 * PUT /api/v1/documents/[id]/file
 *
 * The document keeps its id, so everything that points at it keeps working:
 * the compliance checklist item it satisfies, the public site's link, site
 * blocks. That is the design's promise ("the link stays the same") and the
 * reason this is an in-place update rather than a new version row.
 *
 * The previous file is not deleted. Its bytes stay in the private bucket (see
 * `rejectInvalidUpload` for why this codebase never deletes a client-named
 * object), and the audit entry records its path, name and size, so the record
 * of what was posted before survives the replacement.
 *
 * Gate chain: the DELETE / PATCH chain on this resource, then a redaction
 * attestation chosen by audience. A document already on the public site asks
 * the public-site question — the new bytes go to the open internet the moment
 * this returns — otherwise the upload question, by category.
 *
 * Only `library` documents. An authored document's PDF is rendered from HTML
 * kept beside it; swapping in an uploaded file would leave the two disagreeing,
 * and the author flow already has its own re-edit path.
 */
import { logAuditEvent } from '@propertypro/db';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { assertCommunityOwnedStoragePath } from '@/lib/services/storage-validators';
import {
  enforcePublishRedactionAttestation,
  enforceRedactionAttestation,
} from '@/lib/documents/redaction-attestation';
import { readValidatedUpload } from '@/lib/documents/create-uploaded-document';
import { queuePdfExtraction } from '@/lib/workers/pdf-extraction';
import {
  getDocumentFileSnapshot,
  replaceDocumentFile,
} from '@/lib/services/documents-service';
import { documentsReplaceFileContract } from './contract';

export const PUT = withErrorHandler(
  runRoute(documentsReplaceFileContract, async ({ params, body, communityId }) => {
    const userId = await requireAuthenticatedUserId();

    // The same pin as the create path: a `documents/` object under this
    // community, never a sibling namespace such as signed e-sign contracts.
    assertCommunityOwnedStoragePath(body.filePath, communityId, 'documents', 'filePath');
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const existing = await getDocumentFileSnapshot(communityId, params.id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }
    if (existing.sourceType !== 'library') {
      throw new ValidationError('Only uploaded documents can have their file replaced.');
    }
    if (existing.filePath === body.filePath) {
      throw new ValidationError('That file is already the current file for this document.');
    }

    // Before any write: new bytes reach the audience the document already has.
    // A DRAFT has none beyond managers — the question is asked when it is
    // posted (PATCH /api/v1/documents `{ posted: true }`).
    // Strictly null: anything else (a row read without the column) asks.
    const isDraft = existing.postedAt === null;
    if (isDraft) {
      // Nothing to ask yet.
    } else if (existing.publicAccess) {
      await enforcePublishRedactionAttestation({
        communityId,
        // A null category is treated as sensitive, as on the publish path.
        categoryId: existing.categoryId ?? 0,
        userId,
        title: existing.title,
        attested: body.redactionAttested,
      });
    } else {
      await enforceRedactionAttestation({
        communityId,
        categoryId: existing.categoryId ?? 0,
        userId,
        title: existing.title,
        attested: body.redactionAttested,
      });
    }

    const upload = await readValidatedUpload({
      userId,
      communityId,
      filePath: body.filePath,
      fileName: body.fileName,
      fileSize: body.fileSize,
    });

    const updated = await replaceDocumentFile(communityId, params.id, existing.filePath, {
      filePath: body.filePath,
      fileName: body.fileName,
      fileSize: upload.byteLength,
      mimeType: upload.mime,
    });
    if (updated.length === 0) {
      // The row moved on between the read above and this write — another
      // replace, or a delete. Refuse rather than overwrite what we never saw.
      throw new ConflictError('This document changed while you were replacing its file. Reload and try again.');
    }

    await logAuditEvent({
      userId,
      action: 'update',
      resourceType: 'document',
      resourceId: String(params.id),
      communityId,
      oldValues: {
        filePath: existing.filePath,
        fileName: existing.fileName,
        fileSize: existing.fileSize,
        mimeType: existing.mimeType,
      },
      newValues: {
        filePath: body.filePath,
        fileName: body.fileName,
        fileSize: upload.byteLength,
        mimeType: upload.mime,
      },
      metadata: { change: 'file_replaced' },
    });

    try {
      queuePdfExtraction({
        communityId,
        documentId: params.id,
        path: body.filePath,
        mimeType: upload.mime,
        bucket: 'documents',
      });
    } catch {
      // Never fail a finished replace on extraction scheduling.
    }

    return {
      id: params.id,
      fileName: body.fileName,
      fileSize: upload.byteLength,
      mimeType: upload.mime,
    };
  }),
);

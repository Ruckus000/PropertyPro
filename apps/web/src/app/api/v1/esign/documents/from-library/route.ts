/**
 * Import a Documents-library file into the e-sign source prefix.
 *
 * See `./contract.ts` for the auth chain and why a copy is required rather
 * than binding the library path directly.
 */
import crypto from 'node:crypto';
import { runRoute } from '@propertypro/api-contract';
import { getDocumentWithAccessCheck, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { NotFoundError } from '@/lib/api/errors';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { copyStorageObject } from '@/lib/site-assets/copy-object';
import { assertPdfMagicBytes } from '@/lib/services/storage-validators';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { esignDocumentFromLibraryContract } from './contract';

export const POST = withErrorHandler(
  runRoute(esignDocumentFromLibraryContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    // A caller may only copy a document they can already open. This is the
    // same gate the download route applies, and it is what keeps the
    // audience rules on a library document (board-only, owners-only) from
    // being walked around by sending the file for signature instead.
    const document = await getDocumentWithAccessCheck(
      {
        communityId,
        role: membership.role,
        communityType: membership.communityType,
        isUnitOwner: membership.isUnitOwner,
      },
      body.documentId,
    );

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const fileName = (document['fileName'] as string | undefined) ?? 'document.pdf';
    const filePath = document['filePath'] as string | undefined;

    if (!filePath) {
      throw new NotFoundError('Document has no stored file');
    }

    // Same shape the presign route mints, so both step-1 paths produce a path
    // `assertCommunityOwnedStoragePath` accepts.
    const sourceDocumentPath =
      `communities/${communityId}/esign-templates/` +
      `${crypto.randomUUID()}-${sanitizeFilename(fileName)}`;

    await copyStorageObject('documents', filePath, sourceDocumentPath);

    // The library accepts more than PDFs, and everything downstream — field
    // placement, flattening, the signed output — assumes one. Check the copy
    // rather than a stored MIME type; the helper deletes the object it just
    // rejected, so a non-PDF import leaves nothing behind.
    await assertPdfMagicBytes('documents', sourceDocumentPath);

    await logAuditEvent({
      userId: actorUserId,
      action: 'esign_source_document_imported',
      resourceType: 'document',
      resourceId: String(body.documentId),
      communityId,
      metadata: {
        fileName,
        sourceDocumentPath,
        requestId: req.headers.get('x-request-id'),
      },
    });

    return { sourceDocumentPath, name: fileName };
  }),
);

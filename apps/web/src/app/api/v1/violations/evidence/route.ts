import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { validateUploadFilePath } from '@/lib/api/upload-path';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireViolationsEnabled } from '@/lib/violations/common';
import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';
import { requirePermission } from '@/lib/db/access-control';
import { violationsEvidenceCreateContract } from './contract';

/**
 * POST /api/v1/violations/evidence — attach uploaded file as violation evidence.
 *
 * Plan A1 drain #144. Migrated to `runRoute(contract, handler)`.
 */
export const POST = withErrorHandler(
  runRoute(violationsEvidenceCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    validateUploadFilePath(body.filePath, communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');

    const result = await createUploadedDocument({
      userId: actorUserId,
      communityId,
      title: body.title,
      description: body.description ?? null,
      filePath: body.filePath,
      fileName: body.fileName,
      fileSize: body.fileSize,
      sourceType: 'violation_evidence',
      sendDocumentNotifications: false,
    });

    return result.document;
  }),
);

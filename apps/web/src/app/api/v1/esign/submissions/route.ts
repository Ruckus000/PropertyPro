import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createSubmission,
  listSubmissions,
} from '@/lib/services/esign-service';
import type { EsignSubmissionStatus } from '@propertypro/shared';
import {
  esignSubmissionsCreateContract,
  esignSubmissionsListContract,
} from './contract';

const listStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'processing_failed',
  'declined',
  'expired',
  'cancelled',
]);

export const GET = withErrorHandler(
  runRoute(esignSubmissionsListContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');

    let status: EsignSubmissionStatus | undefined;
    if (rawStatus) {
      const parsed = listStatusSchema.safeParse(rawStatus);
      if (!parsed.success) {
        throw new ValidationError('Invalid status filter', {
          fields: [{
            field: 'status',
            message: `status must be one of: ${listStatusSchema.options.join(', ')}`,
          }],
        });
      }
      status = parsed.data as EsignSubmissionStatus;
    }

    return listSubmissions(communityId, { status });
  }),
);

export const POST = withErrorHandler(
  runRoute(esignSubmissionsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    return createSubmission(
      communityId,
      actorUserId,
      {
        templateId: body.templateId,
        signers: body.signers,
        signingOrder: body.signingOrder,
        sendEmail: body.sendEmail,
        expiresAt: body.expiresAt,
        messageSubject: body.messageSubject,
        messageBody: body.messageBody,
        linkedDocumentId: body.linkedDocumentId,
      },
      requestId,
    );
  }),
);

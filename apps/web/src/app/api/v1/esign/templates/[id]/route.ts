import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  archiveTemplate,
  getTemplate,
  updateTemplate,
} from '@/lib/services/esign-service';
import {
  esignTemplateDeleteContract,
  esignTemplateGetContract,
  esignTemplatePatchContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(esignTemplateGetContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);

    return getTemplate(communityId, params.id);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(esignTemplatePatchContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    return updateTemplate(
      communityId,
      actorUserId,
      params.id,
      {
        name: body.name,
        description: body.description ?? undefined,
        fieldsSchema: body.fieldsSchema,
      },
      requestId,
    );
  }),
);

export const DELETE = withErrorHandler(
  runRoute(esignTemplateDeleteContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    await archiveTemplate(communityId, actorUserId, params.id, requestId);

    return { success: true as const };
  }),
);

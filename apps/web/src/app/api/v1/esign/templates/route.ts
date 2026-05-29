import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createTemplate,
  listTemplates,
} from '@/lib/services/esign-service';
import type { EsignTemplateStatus, EsignTemplateType } from '@propertypro/shared';
import {
  esignTemplatesCreateContract,
  esignTemplatesListContract,
} from './contract';

const listStatusSchema = z.enum(['active', 'archived']);
const listTypeSchema = z.enum([
  'proxy',
  'consent',
  'lease_addendum',
  'maintenance_auth',
  'violation_ack',
  'assessment_agreement',
  'custom',
]);

export const GET = withErrorHandler(
  runRoute(esignTemplatesListContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const rawType = searchParams.get('type');

    let status: EsignTemplateStatus | undefined;
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
      status = parsed.data as EsignTemplateStatus;
    }
    let type: EsignTemplateType | undefined;
    if (rawType) {
      const parsed = listTypeSchema.safeParse(rawType);
      if (!parsed.success) {
        throw new ValidationError('Invalid type filter', {
          fields: [{
            field: 'type',
            message: `type must be one of: ${listTypeSchema.options.join(', ')}`,
          }],
        });
      }
      type = parsed.data as EsignTemplateType;
    }

    return listTemplates(communityId, { status, type });
  }),
);

export const POST = withErrorHandler(
  runRoute(esignTemplatesCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    return createTemplate(
      communityId,
      actorUserId,
      {
        name: body.name,
        templateType: body.templateType,
        sourceDocumentPath: body.sourceDocumentPath,
        fieldsSchema: body.fieldsSchema,
        description: body.description,
      },
      requestId,
    );
  }),
);

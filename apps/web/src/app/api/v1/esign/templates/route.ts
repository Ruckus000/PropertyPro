import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
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

const createTemplateSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  templateType: z.enum([
    'proxy',
    'consent',
    'lease_addendum',
    'maintenance_auth',
    'violation_ack',
    'assessment_agreement',
    'custom',
  ]),
  sourceDocumentPath: z.string().trim().min(1),
  fieldsSchema: z.object({
    version: z.literal(1),
    fields: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['signature', 'initials', 'date', 'text', 'checkbox']),
        signerRole: z.string(),
        page: z.number().int().min(0),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().gt(0).max(100),
        height: z.number().gt(0).max(100),
        required: z.boolean(),
        label: z.string().optional(),
      }),
    ),
    signerRoles: z.array(z.string().min(1)),
  }),
});

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawType = searchParams.get('type');

  const status = rawStatus
    ? (listStatusSchema.parse(rawStatus) as EsignTemplateStatus)
    : undefined;
  const type = rawType
    ? (listTypeSchema.parse(rawType) as EsignTemplateType)
    : undefined;

  const data = await listTemplates(communityId, { status, type });

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createTemplateSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid template payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignWritePermission(membership);
  await requirePlanFeature(communityId, 'hasEsign');

  const requestId = req.headers.get('x-request-id');
  const data = await createTemplate(
    communityId,
    actorUserId,
    {
      name: parseResult.data.name,
      templateType: parseResult.data.templateType,
      sourceDocumentPath: parseResult.data.sourceDocumentPath,
      fieldsSchema: parseResult.data.fieldsSchema,
      description: parseResult.data.description,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});

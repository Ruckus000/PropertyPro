import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import {
  getTemplate,
  updateTemplate,
  archiveTemplate,
} from '@/lib/services/esign-service';

const updateTemplateSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  fieldsSchema: z
    .object({
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
    })
    .optional(),
});

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireEsignReadPermission(membership);

    const data = await getTemplate(communityId, id);
    return NextResponse.json({ data });
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = updateTemplateSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid template update payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireEsignWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await updateTemplate(
      communityId,
      actorUserId,
      id,
      {
        name: parseResult.data.name,
        description: parseResult.data.description ?? undefined,
        fieldsSchema: parseResult.data.fieldsSchema,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireEsignWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    await archiveTemplate(communityId, actorUserId, id, requestId);

    return NextResponse.json({ success: true });
  },
);

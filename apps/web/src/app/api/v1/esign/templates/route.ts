import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import * as esignService from '@/lib/services/esign-service';

const createTemplateSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  templateType: z.string().optional(),
  sourceDocumentPath: z.string().optional(),
  documentUrl: z.string().url().optional(),
  html: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const url = new URL(req.url);
  const communityId = Number(url.searchParams.get('communityId'));
  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'read');

  const status = url.searchParams.get('status') ?? undefined;
  const templates = await esignService.listTemplates(effectiveCommunityId, status);
  return NextResponse.json({ data: templates });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { fields: formatZodErrors(parsed.error) });
  }

  const effectiveCommunityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'write');
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

  if (!parsed.data.documentUrl && !parsed.data.html) {
    throw new ValidationError('Either documentUrl or html must be provided');
  }

  const template = await esignService.createTemplate({
    communityId: effectiveCommunityId,
    userId,
    name: parsed.data.name,
    description: parsed.data.description,
    templateType: parsed.data.templateType,
    sourceDocumentPath: parsed.data.sourceDocumentPath,
    documentUrl: parsed.data.documentUrl,
    html: parsed.data.html,
  });

  return NextResponse.json({ data: template }, { status: 201 });
});

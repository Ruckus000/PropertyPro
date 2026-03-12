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

const registerTemplateSchema = z.object({
  communityId: z.number().int().positive(),
  docusealTemplateId: z.number().int().positive(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  templateType: z.string().optional(),
});

/**
 * POST /api/v1/esign/templates/register
 *
 * Called by the embedded DocuSeal builder after a template is saved.
 * Fetches template details from DocuSeal and creates the DB record.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();
  const parsed = registerTemplateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { fields: formatZodErrors(parsed.error) });
  }

  const effectiveCommunityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'write');
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

  const template = await esignService.registerBuilderTemplate({
    communityId: effectiveCommunityId,
    userId,
    docusealTemplateId: parsed.data.docusealTemplateId,
    name: parsed.data.name,
    description: parsed.data.description,
    templateType: parsed.data.templateType,
  });

  return NextResponse.json({ data: template }, { status: 201 });
});

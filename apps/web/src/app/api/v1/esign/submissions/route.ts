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

const createSubmissionSchema = z.object({
  communityId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  signers: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.string().min(1),
        userId: z.string().uuid().optional(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              default_value: z.string(),
              readonly: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  sendEmail: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
  message: z
    .object({
      subject: z.string().min(1),
      body: z.string().min(1),
    })
    .optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const url = new URL(req.url);
  const communityId = Number(url.searchParams.get('communityId'));
  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'read');

  const status = url.searchParams.get('status') ?? undefined;
  const submissions = await esignService.listSubmissions(effectiveCommunityId, {
    status,
    userId,
    role: membership.role,
  });

  return NextResponse.json({ data: submissions });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();
  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { fields: formatZodErrors(parsed.error) });
  }

  const effectiveCommunityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'write');
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

  const result = await esignService.createSubmission({
    communityId: effectiveCommunityId,
    userId,
    templateId: parsed.data.templateId,
    signers: parsed.data.signers,
    sendEmail: parsed.data.sendEmail,
    expiresAt: parsed.data.expiresAt,
    message: parsed.data.message,
  });

  return NextResponse.json({ data: result }, { status: 201 });
});

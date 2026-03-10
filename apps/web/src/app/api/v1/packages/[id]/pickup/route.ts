import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requirePackageLoggingEnabled,
  requirePackagesWritePermission,
  requireStaffOperator,
} from '@/lib/logistics/common';
import { pickupPackageForCommunity } from '@/lib/services/package-visitor-service';

const pickupSchema = z.object({
  communityId: z.number().int().positive(),
  pickedUpByName: z.string().trim().min(1).max(240),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const packageId = parsePositiveInt(params?.id ?? '', 'package id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = pickupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid package pickup payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePackageLoggingEnabled(membership);
    requirePackagesWritePermission(membership);
    requireStaffOperator(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await pickupPackageForCommunity(
      communityId,
      packageId,
      actorUserId,
      {
        pickedUpByName: parsed.data.pickedUpByName,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ValidationError } from '@/lib/api/errors';
import { requireFinanceAdminWrite, requireFinanceEnabled } from '@/lib/finance/common';
import { getCommunityFeePolicy } from '@/lib/services/finance-service';

const getSchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const parseResult = getSchema.safeParse({ communityId: searchParams.get('communityId') });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);

  const feePolicy = await getCommunityFeePolicy(communityId);

  return NextResponse.json({ data: { feePolicy } });
});

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  feePolicy: z.enum(['owner_pays', 'association_absorbs']),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = patchSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid fee policy payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId, feePolicy } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);
  requireFinanceAdminWrite(membership);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = rows[0] as Record<string, unknown> | undefined;
  const currentSettings = (community?.communitySettings as Record<string, unknown>) ?? {};
  const oldPolicy = currentSettings.paymentFeePolicy ?? 'association_absorbs';

  const updatedSettings = { ...currentSettings, paymentFeePolicy: feePolicy };
  await scoped.update(
    communities,
    { communitySettings: updatedSettings },
    eq(communities.id, communityId),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'settings_changed',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    oldValues: { paymentFeePolicy: oldPolicy },
    newValues: { paymentFeePolicy: feePolicy },
    metadata: { requestId: req.headers.get('x-request-id') ?? null },
  });

  return NextResponse.json({ data: { feePolicy } });
});

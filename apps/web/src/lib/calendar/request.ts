import type { NextRequest } from 'next/server';
import { BadRequestError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

export function parseCommunityIdFromQueryOrHeader(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');

  if (!rawCommunityId) {
    return resolveEffectiveCommunityId(req, null);
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }

  return resolveEffectiveCommunityId(req, parsedCommunityId);
}

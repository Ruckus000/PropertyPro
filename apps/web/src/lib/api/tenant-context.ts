import { type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveEffectiveCommunityId(
  req: NextRequest,
  explicitCommunityId: number | null | undefined,
): number {
  const headerValue = req.headers.get('x-community-id');
  const headerCommunityId = parsePositiveInt(headerValue);

  if (headerValue != null && headerCommunityId == null) {
    throw new NotFoundError('Community not found');
  }

  if (
    explicitCommunityId != null &&
    (!Number.isInteger(explicitCommunityId) || explicitCommunityId <= 0)
  ) {
    throw new ValidationError('communityId must be a positive integer');
  }

  if (
    headerCommunityId != null &&
    explicitCommunityId != null &&
    headerCommunityId !== explicitCommunityId
  ) {
    throw new NotFoundError('Community not found');
  }

  if (headerCommunityId != null) {
    return headerCommunityId;
  }

  if (explicitCommunityId != null) {
    return explicitCommunityId;
  }

  throw new ValidationError('Invalid or missing communityId');
}

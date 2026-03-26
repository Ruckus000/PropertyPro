import { ForbiddenError } from '@/lib/api/errors';

export const COMMUNITY_ID_HEADER = 'x-community-id';
export const TENANT_SLUG_HEADER = 'x-tenant-slug';
export const TENANT_SOURCE_HEADER = 'x-tenant-source';
export const USER_ID_HEADER = 'x-user-id';
export const USER_EMAIL_HEADER = 'x-user-email';
export const USER_FULL_NAME_HEADER = 'x-user-full-name';
export const USER_PHONE_HEADER = 'x-user-phone';

export const FORWARDED_AUTH_HEADERS = [
  COMMUNITY_ID_HEADER,
  TENANT_SLUG_HEADER,
  TENANT_SOURCE_HEADER,
  USER_ID_HEADER,
  USER_EMAIL_HEADER,
  USER_FULL_NAME_HEADER,
  USER_PHONE_HEADER,
  'x-preview',
] as const;

export function normalizeForwardedHeaderValue(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseForwardedCommunityId(
  value: string | null | undefined,
): number | null {
  const normalized = normalizeForwardedHeaderValue(value);
  if (!normalized) return null;

  const communityId = Number(normalized);
  return Number.isInteger(communityId) && communityId > 0 ? communityId : null;
}

export function requireForwardedCommunityId(
  value: string | null | undefined,
): number {
  const communityId = parseForwardedCommunityId(value);
  if (!communityId) {
    throw new ForbiddenError('Missing or invalid community context');
  }
  return communityId;
}

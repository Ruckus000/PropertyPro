import { ForbiddenError } from '@/lib/api/errors';

export const COMMUNITY_ID_HEADER = 'x-community-id';
export const TENANT_SLUG_HEADER = 'x-tenant-slug';
export const TENANT_SOURCE_HEADER = 'x-tenant-source';
export const USER_ID_HEADER = 'x-user-id';
export const USER_EMAIL_HEADER = 'x-user-email';
export const USER_FULL_NAME_HEADER = 'x-user-full-name';
export const USER_PHONE_HEADER = 'x-user-phone';

/** Set by middleware only after a support cookie verifies against a live row. */
export const SUPPORT_SESSION_HEADER = 'x-support-session';
export const SUPPORT_ADMIN_ID_HEADER = 'x-support-admin-id';
export const SUPPORT_SESSION_ID_HEADER = 'x-support-session-id';

/**
 * Headers middleware OWNS: deleted from every inbound request before it stamps
 * its own values. Anything middleware sets must appear here, or a client can
 * send it directly and the app cannot tell the difference.
 *
 * The three `x-support-*` entries were missing. They were latent — nothing read
 * them — until the support banner started deriving its visibility from
 * `x-support-session` (the cookie is HttpOnly now, so the client cannot detect
 * the session itself). A spoofed header would have rendered "Support Mode —
 * Read-Only" to an ordinary user.
 */
export const FORWARDED_AUTH_HEADERS = [
  COMMUNITY_ID_HEADER,
  TENANT_SLUG_HEADER,
  TENANT_SOURCE_HEADER,
  USER_ID_HEADER,
  USER_EMAIL_HEADER,
  USER_FULL_NAME_HEADER,
  USER_PHONE_HEADER,
  SUPPORT_SESSION_HEADER,
  SUPPORT_ADMIN_ID_HEADER,
  SUPPORT_SESSION_ID_HEADER,
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

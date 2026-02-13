/**
 * Request context extraction for Sentry tagging.
 *
 * Header conventions:
 * - request ID: `x-request-id`
 * - tenant/community ID: `x-community-id`
 *   (legacy fallback `x-tenant-id` retained temporarily for compatibility)
 * - user ID: `x-user-id`
 */
export interface SentryRequestContext {
  requestId: string;
  communityId?: string;
  userId?: string;
}

const REQUEST_ID_HEADER = 'x-request-id';
// TODO(P2-30 hardening follow-up): remove x-tenant-id fallback after migration window.
const COMMUNITY_ID_HEADERS: readonly string[] = ['x-community-id', 'x-tenant-id'];
const USER_ID_HEADERS: readonly string[] = ['x-user-id'];

function normalizeHeaderValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readFirstHeader(
  headers: Pick<Headers, 'get'>,
  candidates: readonly string[],
): string | undefined {
  for (const headerName of candidates) {
    const value = normalizeHeaderValue(headers.get(headerName));
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function extractSentryRequestContext(
  headers: Pick<Headers, 'get'>,
): SentryRequestContext {
  return {
    requestId: normalizeHeaderValue(headers.get(REQUEST_ID_HEADER)) ?? '',
    communityId: readFirstHeader(headers, COMMUNITY_ID_HEADERS),
    userId: readFirstHeader(headers, USER_ID_HEADERS),
  };
}

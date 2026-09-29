/**
 * Support-session scope for user-keyed, cross-community surfaces.
 *
 * A support session impersonates ONE user and is consented for ONE community.
 * Most of the app is pinned to that community by middleware (`x-community-id`
 * is the session's). But a handful of surfaces are keyed only on the user id
 * and aggregate across EVERY community the user belongs to — the community
 * picker, the cross-community overview and notification feed, the PM
 * portfolio. Under impersonation those would expose, or act on, communities
 * the operator was never granted.
 *
 * The rule those surfaces follow:
 *   - `getSupportScope(...) === null` → not a support session; unchanged.
 *   - aggregate reads → NARROW to exactly `scope.communityId` (nothing when it
 *     is null), so the impersonated UI still works for the consented community;
 *   - portfolio / cross-community writes → DENY.
 *
 * Header trust: middleware strips every inbound `x-support-*` /
 * `x-community-id` (FORWARDED_AUTH_HEADERS) and sets them only after the
 * support cookie verifies against a live `support_sessions` row, so their
 * presence is authoritative.
 */
import { headers } from 'next/headers';
import { ForbiddenError } from '@/lib/api/errors';
import {
  COMMUNITY_ID_HEADER,
  parseForwardedCommunityId,
  SUPPORT_COMMUNITY_ID_HEADER,
  SUPPORT_SESSION_ID_HEADER,
} from '@/lib/request/forwarded-headers';

export interface SupportScope {
  /**
   * The session's consented community, or null when it cannot be read. Null
   * FAILS CLOSED: a narrowed surface then returns nothing at all.
   */
  communityId: number | null;
}

/** Minimal header reader — satisfied by `Headers` and Next's `ReadonlyHeaders`. */
interface HeaderReader {
  get(name: string): string | null;
}

export const SUPPORT_SESSION_DENIED_MESSAGE = 'Not available during a support session';

/**
 * `null` when the request is not a support session (no `x-support-session-id`);
 * otherwise the session's consented community.
 *
 * The community comes from `x-support-community-id`, which middleware stamps on
 * every impersonated request. `x-community-id` is NOT sufficient on its own: it
 * is deliberately left unset on the TENANT_OPTIONAL_PATHS (/select-community),
 * which is exactly where the community picker narrows. Where `x-community-id`
 * IS present it must agree — middleware already rejects a disagreement, so a
 * mismatch here means something upstream changed, and we fail closed.
 */
export function getSupportScope(requestHeaders: HeaderReader): SupportScope | null {
  if (!requestHeaders.get(SUPPORT_SESSION_ID_HEADER)) return null;

  const supportCommunityId = parseForwardedCommunityId(
    requestHeaders.get(SUPPORT_COMMUNITY_ID_HEADER),
  );
  const rawTenant = requestHeaders.get(COMMUNITY_ID_HEADER);
  if (rawTenant !== null && parseForwardedCommunityId(rawTenant) !== supportCommunityId) {
    return { communityId: null };
  }
  return { communityId: supportCommunityId };
}

/** Page / server-component variant: reads the current request's headers. */
export async function getPageSupportScope(): Promise<SupportScope | null> {
  return getSupportScope(await headers());
}

/**
 * Keep only the rows belonging to the scoped community. Identity when `scope`
 * is null (not a support session); empty when `scope.communityId` is null.
 */
export function narrowToSupportScope<T>(
  rows: readonly T[],
  scope: SupportScope | null,
  communityIdOf: (row: T) => number,
): T[] {
  if (scope === null) return [...rows];
  if (scope.communityId === null) return [];
  return rows.filter((row) => communityIdOf(row) === scope.communityId);
}

/** Throw 403 when the request is a support session. */
export function refuseUnderSupportSession(
  requestHeaders: HeaderReader,
  message: string = SUPPORT_SESSION_DENIED_MESSAGE,
): void {
  if (getSupportScope(requestHeaders) !== null) {
    throw new ForbiddenError(message);
  }
}

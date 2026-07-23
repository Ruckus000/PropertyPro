// read-entitlement:exempt — OAuth callback completes a connection flow, not a community-data read
/**
 * GET /api/v1/calendar/google/callback
 *
 * Google Calendar OAuth callback. Plan A1 drain. Migrated to
 * `runRoute(contract, handler)`; see `./contract.ts` for the schema and
 * rationale.
 *
 * Auth chain preserved verbatim from the pre-migration handler:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQueryOrHeader(req)
 *     → requireCommunityMembership(communityId, actorUserId)        (async)
 *     → requireCalendarSyncEnabledForMembership(membership)         (SYNC)
 *     → requireCalendarSyncWritePermission(membership)              (SYNC)
 *     → validateOAuthState(state, communityId, actorUserId)         (SYNC)
 *     → completeGoogleCalendarConnect(communityId, actorUserId, code, requestId)
 *
 * `state` and `code` are parsed from `req.url` in the handler (NOT declared in
 * the contract) to preserve byte-identical behavior: `validateOAuthState`
 * owns state validation, and the empty/whitespace `code` guard throws
 * `BadRequestError('code query parameter is required')` verbatim.
 *
 * `x-request-id` header is forwarded verbatim to
 * `completeGoogleCalendarConnect`, including the `null` value when absent.
 * Success wire shape `{ data: ... }` is byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncWritePermission,
} from '@/lib/calendar/common';
import {
  completeGoogleCalendarConnect,
  validateOAuthState,
} from '@/lib/services/calendar-sync-service';
import { calendarGoogleCallbackContract } from './contract';

export const GET = withErrorHandler(
  runRoute(calendarGoogleCallbackContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQueryOrHeader(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCalendarSyncEnabledForMembership(membership);
    requireCalendarSyncWritePermission(membership);

    const { searchParams } = new URL(req.url);

    validateOAuthState(searchParams.get('state'), communityId, actorUserId);

    const code = searchParams.get('code');
    if (!code || code.trim().length === 0) {
      throw new BadRequestError('code query parameter is required');
    }

    return completeGoogleCalendarConnect(
      communityId,
      actorUserId,
      code,
      req.headers.get('x-request-id'),
    );
  }),
);

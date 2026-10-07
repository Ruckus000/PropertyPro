// read-entitlement:exempt — the caller's own consent record; a lapsed subscription must never stop an owner reading or withdrawing their own statutory consent
/**
 * /api/v1/notice-consent — the signed-in owner's consent to electronic notice.
 *
 * GET reads it, POST gives it, DELETE withdraws it. All three act on the
 * caller's own row. Only a unit owner may give consent; anyone may read or
 * withdraw their own, so an owner who is later re-classed can still withdraw.
 * A record only — nothing decides notice delivery from it.
 */
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolveClientIp } from '@/lib/api/client-ip';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getConsentEmail,
  getNoticeConsent,
  giveNoticeConsent,
  withdrawNoticeConsent,
} from '@/lib/services/notice-consent-service';
import {
  noticeConsentDeleteContract,
  noticeConsentGetContract,
  noticeConsentPostContract,
} from './contract';

async function stateFor(communityId: number, userId: string) {
  const [consent, currentEmail] = await Promise.all([
    getNoticeConsent(communityId, userId),
    getConsentEmail(communityId, userId),
  ]);
  return { ...consent, currentEmail };
}

// route-gate: self-scoped — reads only the caller's own consent row, after a membership check
export const GET = withErrorHandler(
  runRoute(noticeConsentGetContract, async ({ communityId }) => {
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);
    return stateFor(communityId, userId);
  }),
);

export const POST = withErrorHandler(
  runRoute(noticeConsentPostContract, async ({ communityId, req }) => {
    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (membership.role !== 'resident' || !membership.isUnitOwner) {
      throw new ForbiddenError('Only unit owners can consent to electronic notice');
    }
    const email = await getConsentEmail(communityId, userId);
    if (!email) throw new NotFoundError('No email address on file');
    await giveNoticeConsent({
      communityId,
      userId,
      email,
      ipAddress: resolveClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return stateFor(communityId, userId);
  }),
);

// route-gate: self-scoped — withdraws only the caller's own consent, after a membership check
export const DELETE = withErrorHandler(
  runRoute(noticeConsentDeleteContract, async ({ communityId, req }) => {
    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    await requireCommunityMembership(communityId, userId);
    await withdrawNoticeConsent(communityId, userId, {
      ipAddress: resolveClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return stateFor(communityId, userId);
  }),
);

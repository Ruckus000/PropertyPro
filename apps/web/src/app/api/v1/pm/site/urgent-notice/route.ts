/**
 * Website editor v3, Phase 7 — `/api/v1/pm/site/urgent-notice`.
 *
 * GET    — the currently stored notice, expired or not (the editor needs to
 *          show a manager what they posted even after it came down).
 * POST   — post or replace it. Public on the next request; no draft, no review.
 * DELETE — take it down.
 *
 * Authorization is byte-identical to publish: the same `ensurePmAccess` shape
 * used by `site/publish`, `site/hero` and `site/blocks`. That is a requirement
 * of the phase, not a convenience — anyone who can publish the site can post a
 * notice, and nobody else can.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  clearUrgentNotice,
  getUrgentNotice,
  setUrgentNotice,
  type UrgentNoticeRecord,
} from '@/lib/services/urgent-notice-service';
import {
  urgentNoticeClearContract,
  urgentNoticeGetContract,
  urgentNoticeSetContract,
} from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  // The middleware `x-community-id` header is authoritative; the id in the
  // query/body is the cross-checked redundant value. A caller who is a manager
  // of community A cannot address community B by editing the payload.
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(
    membership,
    PM_MANAGER_ROLES,
    'Only property managers can post an urgent notice',
  );
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

/** Dates cross the wire as ISO strings. */
function serialize(notice: UrgentNoticeRecord | null) {
  if (!notice) return { urgentNotice: null };
  return {
    urgentNotice: {
      text: notice.text,
      expiresAt: notice.expiresAt?.toISOString() ?? null,
      setAt: notice.setAt?.toISOString() ?? null,
    },
  };
}

export const GET = withErrorHandler(
  runRoute(urgentNoticeGetContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // Admin reads are additionally gated on entitlement (§4.1, enforced by
    // `guard:read-entitlement`). A lapsed community's manager cannot read.
    await requireEntitledForAdminRead(communityId, membership);
    return serialize(await getUrgentNotice(communityId));
  }),
);

export const POST = withErrorHandler(
  runRoute(urgentNoticeSetContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // `setUrgentNotice` throws ConflictError (409) when the site has never been
    // published and ValidationError (400) on empty / over-length / past-expiry
    // input. `withErrorHandler` maps both to the canonical error envelope.
    const notice = await setUrgentNotice({
      communityId,
      actorUserId: userId,
      text: body.text,
      expiresAt: body.expiresAt === null ? null : new Date(body.expiresAt),
    });

    return serialize(notice);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(urgentNoticeClearContract, async ({ query, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, query.communityId);
    await clearUrgentNotice({ communityId, actorUserId: userId });
    return { ok: true as const };
  }),
);

/**
 * Invitations API
 *
 * POST   /api/v1/invitations      — create an invitation and send email
 * PATCH  /api/v1/invitations      — accept invitation (one-time-use token)
 *
 * Plan A1 drain #130. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createElement } from 'react';
import { logAuditEvent } from '@propertypro/db';
import { InvitationEmail, sendEmail } from '@propertypro/email';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createInvitation,
  createSupabaseAuthUserFromInvitation,
  findInvitationByToken,
  getCommunityNameForInvitation,
  getUserForInvitation,
  getUserRoleForInvitation,
  markInvitationConsumed,
} from '@/lib/services/invitations-service';
import {
  acceptInvitationContract,
  createInvitationContract,
} from './contract';
import { getBaseUrl } from '@/lib/utils/url';


function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export const POST = withErrorHandler(
  runRoute(createInvitationContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { userId, ttlDays } = body;
    const actorMembership = await requireCommunityMembership(communityId, actorUserId);
    // Inviting a user into the community is an administrative membership
    // action, equivalent to creating a resident record (AZ-01). Gate it on
    // residents:write so ordinary members cannot mint/send invitations.
    requirePermission(actorMembership, 'residents', 'write');

    const community = await getCommunityNameForInvitation(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const user = await getUserForInvitation(communityId, userId);
    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    // Membership is asserted here, not assumed.
    //
    // `getUserForInvitation` reads the `users` table, which has NO
    // `community_id` — the scoped client does not isolate it, so the lookup
    // above resolves ANY user on the platform. This role lookup DOES scope
    // (`user_roles` carries `community_id`), so it is the only thing standing
    // between an arbitrary user id and an invitation email branded with this
    // community's name. It previously defaulted a non-member to 'resident' and
    // mailed them anyway.
    //
    // Every path that legitimately reaches here creates the role row first
    // (residents POST, residents/invite, the onboarding wizard), so requiring
    // one costs nothing real.
    const role = await getUserRoleForInvitation(communityId, userId);
    if (!role) {
      throw new NotFoundError(`User ${userId} is not a member of community ${communityId}`);
    }

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = addDays(new Date(), ttlDays ?? 7);

    await createInvitation({
      communityId,
      userId,
      invitedBy: actorUserId,
      token,
      expiresAt,
    });

    const inviteUrl = `${getBaseUrl()}/auth/accept-invite?token=${encodeURIComponent(token)}&communityId=${communityId}`;

    await sendEmail({
      to: user.email,
      subject: `You're invited to ${community.name} on PropertyPro`,
      category: 'transactional',
      react: createElement(InvitationEmail, {
        branding: { communityName: community.name },
        inviteeName: user.fullName ?? 'there',
        inviterName:
          req.headers.get('x-user-full-name') ||
          req.headers.get('x-user-email') ||
          'Your administrator',
        role,
        inviteUrl,
        expiresInDays: ttlDays ?? 7,
      }),
    });

    // resourceId is the INVITED USER, never the token. compliance_audit_log is
    // readable by board members and managers via GET /api/v1/audit-trail, and a
    // live token is enough to complete the accept flow and set that user's
    // password. The table is append-only by trigger, so anything logged here is
    // permanent.
    await logAuditEvent({
      userId: actorUserId,
      action: 'user_invited',
      resourceType: 'invitation',
      resourceId: userId,
      communityId,
      newValues: { userId, expiresAt: expiresAt.toISOString() },
    });

    return { success: true as const };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(acceptInvitationContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { token, password } = body;

    const invitation = await findInvitationByToken(communityId, token);

    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new AppError(
        'This invitation link has already been used.',
        400,
        'TOKEN_USED',
      );
    }

    const expiresAt =
      invitation.expiresAt instanceof Date
        ? invitation.expiresAt
        : new Date(String(invitation.expiresAt));
    if (Date.now() >= expiresAt.getTime()) {
      throw new AppError(
        'This invitation link has expired.',
        400,
        'TOKEN_EXPIRED',
      );
    }

    const userId = invitation.userId;

    const user = await getUserForInvitation(communityId, userId);
    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    const result = await createSupabaseAuthUserFromInvitation({
      email: user.email,
      password,
      fullName: user.fullName,
      externalUserId: userId,
    });

    if (!result.ok) {
      // The client deliberately gets a fixed message, but the reason has to
      // reach the server log or an accept failure is undiagnosable in prod —
      // "already registered" and "id mismatch" need very different responses.
      // Safe to log: the reason carries user ids, never the token or password.
      // eslint-disable-next-line no-console
      console.error(
        `[invitations] accept failed for user ${userId} in community ${communityId}: ${result.error}`,
      );
      throw new ValidationError('Failed to create user');
    }

    await markInvitationConsumed(communityId, token, new Date());

    // Same rule as the POST branch: identify the invitation by its invitee, not
    // by the token. (The token is consumed by this point, but it is still a
    // secret that was valid, and the row is permanent.)
    await logAuditEvent({
      userId,
      action: 'update',
      resourceType: 'invitation',
      resourceId: userId,
      communityId,
      newValues: { consumedAt: new Date().toISOString() },
    });

    return { success: true as const, email: user.email };
  }),
);

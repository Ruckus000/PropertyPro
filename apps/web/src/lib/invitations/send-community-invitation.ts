/**
 * Mint and email one community invitation. Shared by POST /api/v1/invitations
 * and POST /api/v1/invitations/batch so both run the same membership check,
 * token, email and audit — a batch is never a weaker path.
 *
 * AUTHZ: caller MUST have verified residents:write for `communityId` and
 * resolved `communityId` from the request context.
 */
import { createElement } from 'react';
import { logAuditEvent } from '@propertypro/db';
import { InvitationEmail, sendEmail } from '@propertypro/email';
import { NotFoundError } from '@/lib/api/errors';
import {
  createInvitation,
  getUserForInvitation,
  getUserRoleForInvitation,
} from '@/lib/services/invitations-service';
import { getBaseUrl } from '@/lib/utils/url';

/** Shown in the invitation email ("X invited you"); headers set by middleware. */
export function inviterNameFrom(req: Request): string {
  return req.headers.get('x-user-full-name') || req.headers.get('x-user-email') || 'Your administrator';
}

export async function sendCommunityInvitation(params: {
  communityId: number;
  communityName: string;
  userId: string;
  actorUserId: string;
  inviterName: string;
  ttlDays?: number;
}): Promise<void> {
  const { communityId, communityName, userId, actorUserId, inviterName } = params;
  const ttlDays = params.ttlDays ?? 7;

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
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);

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
    subject: `You're invited to ${communityName} on PropertyPro`,
    category: 'transactional',
    react: createElement(InvitationEmail, {
      branding: { communityName },
      inviteeName: user.fullName ?? 'there',
      inviterName,
      role,
      inviteUrl,
      expiresInDays: ttlDays,
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
}

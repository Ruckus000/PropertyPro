/**
 * Onboarding service — P2-38
 *
 * Extracted resident and invitation creation logic for use during wizard completion.
 * This prevents HTTP self-calls and allows proper transaction handling.
 */

import {
  createScopedClient,
  users,
  userRoles,
  invitations as invitationsTable,
  communities,
  logAuditEvent,
  notificationPreferences,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createElement } from 'react';
import { InvitationEmail, sendEmail } from '@propertypro/email';
import type { CommunityType, CommunityRole } from '@propertypro/shared';
import { validateRoleAssignment } from '@/lib/utils/role-validator';
import { getBaseUrl } from '@/lib/utils/url';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireCommunityType } from '@/lib/utils/community-validators';

/**
 * Look up a community's `communityType` by id (single-row projection).
 * Returns the typed `CommunityType` enum or throws `NotFoundError` if no
 * row matches.
 *
 * Replaces the prior route-side anti-pattern of `scoped.query(communities)`
 * (full table fetch + JS .find()) — same class as drain #244's
 * `listMyPendingForActor` pre-fix.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified actor's
 * community membership.
 */
export async function getCommunityTypeForOnboarding(
  communityId: number,
): Promise<CommunityType> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    communities,
    { communityType: communities.communityType },
    eq(communities.id, communityId),
  )) as unknown as Array<{ communityType: unknown }>;
  const row = rows[0];
  if (!row) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }
  return requireCommunityType(
    row.communityType,
    `onboarding-service.getCommunityTypeForOnboarding(${communityId})`,
  );
}

/**
 * Create a resident (user + role) in a community.
 * Extracted from POST /api/v1/residents.
 */
export async function createOnboardingResident(params: {
  communityId: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: CommunityRole;
  unitId: number | null;
  actorUserId: string;
  communityType: CommunityType;
  isUnitOwner?: boolean;
}): Promise<{ userId: string; isNewUser: boolean }> {
  const { communityId, email, fullName, phone, role, unitId, actorUserId, communityType } = params;
  const scoped = createScopedClient(communityId);

  // Validate role assignment
  const validation = validateRoleAssignment(role, communityType, unitId);
  if (!validation.valid) {
    throw new ValidationError(validation.error ?? 'Invalid role assignment');
  }

  // Check if user exists
  const existingUsers = await scoped.query(users);
  const normalizedEmail = email.toLowerCase();

  let userRow = existingUsers.find(
    (row) => (row['email'] as string).toLowerCase() === normalizedEmail,
  );

  const isNewUser = !userRow;
  const userId = isNewUser ? crypto.randomUUID() : (userRow?.['id'] as string);

  if (isNewUser) {
    const insertedUsers = await scoped.insert(users, {
      id: userId,
      email: normalizedEmail,
      fullName,
      phone: phone ?? null,
    });

    userRow = insertedUsers[0] as Record<string, unknown>;
  }

  // Check for existing role
  const existingRoles = await scoped.query(userRoles);
  const existingRole = existingRoles.find((row) => row['userId'] === userId);

  if (existingRole) {
    throw new ValidationError(
      `User already has role "${existingRole['role']}" in this community.`,
    );
  }

  // Onboarding mints resident-tier rows only (owner/tenant). Manager-tier rows
  // are assigned from the root-only Roles & Access path.
  const isUnitOwner = role === 'resident' ? (params.isUnitOwner ?? false) : false;
  const displayTitle = resolveDisplayTitle(role, params.isUnitOwner);

  await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
    isUnitOwner,
    designation: null,
    displayTitle,
  });

  // Create notification preferences
  await scoped.insert(notificationPreferences, {
    userId,
  });

  // Audit log
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'user',
    resourceId: userId,
    communityId,
    newValues: {
      email: normalizedEmail,
      fullName,
      role,
      unitId,
    },
  });

  return { userId, isNewUser };
}

/**
 * Create an invitation and send email.
 * Extracted from POST /api/v1/invitations.
 */
export async function createOnboardingInvitation(params: {
  communityId: number;
  userId: string;
  ttlDays?: number;
  actorUserId: string;
  inviterName: string;
}): Promise<{ id: number; token: string; expiresAt: Date }> {
  const { communityId, userId, ttlDays = 7, actorUserId } = params;
  const scoped = createScopedClient(communityId);

  // Load community for branding
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((row) => row['id'] === communityId);
  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  // Load user and role
  const userRows = await scoped.query(users);
  const user = userRows.find((row) => row['id'] === userId);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  const roleRows = await scoped.query(userRoles);
  const roleRow = roleRows.find((row) => row['userId'] === userId);
  const role = (roleRow?.['role'] as string | undefined) ?? 'resident';

  // Generate token
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = addDays(new Date(), ttlDays);

  // Create invitation
  const insertedInvitations = await scoped.insert(invitationsTable, {
    userId,
    token,
    invitedBy: actorUserId,
    expiresAt,
  });
  const invitationId = (insertedInvitations[0] as Record<string, unknown>)?.id as number;

  // Send email
  const inviteUrl = `${getBaseUrl()}/auth/accept-invite?token=${encodeURIComponent(token)}&communityId=${communityId}`;

  await sendEmail({
    to: user['email'] as string,
    subject: `You're invited to ${community['name'] as string} on PropertyPro`,
    category: 'transactional',
    react: createElement(InvitationEmail, {
      branding: { communityName: community['name'] as string },
      inviteeName: (user['fullName'] as string) ?? 'there',
      inviterName: params.inviterName,
      role,
      inviteUrl,
      expiresInDays: ttlDays,
    }),
  });

  // Audit log — resourceId is the INVITED USER, never the token. See the same
  // note in app/api/v1/invitations/route.ts: compliance_audit_log is readable
  // by board members and managers via GET /api/v1/audit-trail, a live token
  // completes the accept flow (which sets the invitee's password), and the
  // table is append-only by trigger.
  await logAuditEvent({
    userId: actorUserId,
    action: 'user_invited',
    resourceType: 'invitation',
    resourceId: userId,
    communityId,
    newValues: { userId, expiresAt: expiresAt.toISOString() },
  });

  return { id: invitationId, token, expiresAt };
}

// --- Helpers ---

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function resolveDisplayTitle(
  role: CommunityRole,
  isUnitOwner?: boolean,
): string {
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Administrator'; // non-resident CommunityRole (not minted via onboarding)
}

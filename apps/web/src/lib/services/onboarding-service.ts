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
import { createElement } from 'react';
import { InvitationEmail, sendEmail } from '@propertypro/email';
import type { CommunityType, NewCommunityRole, PresetKey } from '@propertypro/shared';
import { getPresetPermissions, PRESET_METADATA } from '@propertypro/shared';
import { validateRoleAssignment } from '@/lib/utils/role-validator';
import { getBaseUrl } from '@/lib/utils/url';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

/**
 * Create a resident (user + role) in a community.
 * Extracted from POST /api/v1/residents.
 */
export async function createOnboardingResident(params: {
  communityId: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: NewCommunityRole;
  unitId: number | null;
  actorUserId: string;
  communityType: CommunityType;
  isUnitOwner?: boolean;
  presetKey?: PresetKey;
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

  // Create role with hybrid-model fields
  const isUnitOwner = role === 'resident' ? (params.isUnitOwner ?? false) : false;
  const permissions =
    role === 'manager' && params.presetKey
      ? getPresetPermissions(params.presetKey, communityType)
      : null;
  const presetKey = role === 'manager' ? (params.presetKey ?? null) : null;
  const displayTitle = resolveDisplayTitle(role, params.isUnitOwner, params.presetKey);

  await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
    isUnitOwner,
    permissions,
    presetKey,
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

  // Audit log
  await logAuditEvent({
    userId: actorUserId,
    action: 'user_invited',
    resourceType: 'invitation',
    resourceId: token,
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
  role: NewCommunityRole,
  isUnitOwner?: boolean,
  presetKey?: PresetKey,
): string {
  if (role === 'manager' && presetKey) return PRESET_METADATA[presetKey].displayTitle;
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Property Manager Admin';
}

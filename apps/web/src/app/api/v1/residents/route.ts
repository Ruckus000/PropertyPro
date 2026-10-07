/**
 * Residents CRUD API — manages users + role assignments per community.
 *
 * Plan A1 drain #134. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import crypto from 'node:crypto';
import { runRoute } from '@/lib/api/run-route';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import {
  COMMUNITY_ROLES,
  type CommunityRole,
  type CommunityType,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { revokeVisitorPassesForUser } from '@/lib/services/package-visitor-service';
import { requireCommunityType, requireCommunityRole } from '@/lib/utils/community-validators';
import { isResidentTierRole, validateRoleAssignment } from '@/lib/utils/role-validator';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { duplicateMemberConflict, withDuplicateMemberAsConflict } from '@/lib/services/duplicate-member';
import { assertUnitInCommunity } from '@/lib/services/scoped-fk-validators';
import { assertActorMayAttachExistingUser } from '@/lib/services/user-linking';
import {
  createResidentNotificationPreferences,
  createResidentRole,
  createResidentUser,
  deleteResidentRole,
  getResidentCommunityTypeValue,
  getResidentRoleByUserId,
  getResidentUserByEmail,
  getResidentUserById,
  listResidentsForCommunity,
  updateResidentRole,
  updateResidentUser,
} from '@/lib/services/resident-service';
import { withdrawNoticeConsent } from '@/lib/services/notice-consent-service';
import {
  residentsCreateContract,
  residentsDeleteContract,
  residentsListContract,
  residentsUpdateContract,
} from './contract';

const MANAGER_TIER_VIA_RESIDENTS_MSG =
  'Manager roles are assigned from Roles & Access (root only).';

async function getCommunityType(communityId: number): Promise<CommunityType> {
  const communityType = await getResidentCommunityTypeValue(communityId);

  if (!communityType) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  return requireCommunityType(communityType, `residents.getCommunityType(${communityId})`);
}

export const GET = withErrorHandler(
  runRoute(residentsListContract, async ({ req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'residents', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const validRoles = new Set(COMMUNITY_ROLES as unknown as string[]);
    const rolesParam = searchParams.get('roles');
    const roleParam = searchParams.get('role');

    let roleFilter: { role?: string; roles?: string[] } = {};
    if (rolesParam) {
      const roleList = rolesParam.split(',').map((r) => r.trim()).filter(Boolean);
      for (const r of roleList) {
        if (!validRoles.has(r)) throw new ValidationError(`Invalid role filter: ${r}`);
      }
      roleFilter = { roles: roleList };
    } else if (roleParam) {
      if (!validRoles.has(roleParam)) throw new ValidationError(`Invalid role filter: ${roleParam}`);
      roleFilter = { role: roleParam };
    }

    // Sign-in and invitation history is for management; residents also hold
    // residents:read (condo/HOA directories), and must not see neighbours'.
    return listResidentsForCommunity(communityId, roleFilter, {
      includePortalActivity: membership.isAdmin,
      includeNoticeConsent: membership.isAdmin,
    });
  }),
);

export const POST = withErrorHandler(
  runRoute(residentsCreateContract, async ({ body, communityId }) => {
    await assertNotDemoGrace(communityId);
    const { email, fullName, phone, role, unitId, isUnitOwner } = body;
    const actorUserId = await requireAuthenticatedUserId();
    const actorMembership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(actorMembership, 'residents', 'write');

    if (!isResidentTierRole(role)) {
      throw new ForbiddenError(MANAGER_TIER_VIA_RESIDENTS_MSG);
    }

    const communityType = await getCommunityType(communityId);

    const validation = validateRoleAssignment(role, communityType, unitId ?? null);
    if (!validation.valid) {
      throw new ValidationError(validation.error ?? 'Invalid role assignment');
    }

    // Reject foreign-tenant unit references before any write happens.
    await assertUnitInCommunity(createScopedClient(communityId), unitId);

    if (role === 'resident' && isUnitOwner && communityType === 'apartment') {
      throw new ValidationError('Owners are not allowed in apartment communities');
    }

    const normalizedEmail = email.toLowerCase();

    let userRow = await getResidentUserByEmail(communityId, normalizedEmail);

    const isNewUser = !userRow;
    const userId = isNewUser ? crypto.randomUUID() : (userRow?.['id'] as string);

    // `getResidentUserByEmail` is NOT tenant-filtered — `users` has no
    // `community_id`, so this matched against every user on the platform.
    // Before reusing a stranger's row, require that the actor already shares a
    // community with them; otherwise this is a way to harvest another
    // association's residents by guessing email addresses. See user-linking.ts.
    if (!isNewUser) {
      await assertActorMayAttachExistingUser({ actorUserId, targetUserId: userId, communityId });
    }

    if (isNewUser) {
      userRow = await withDuplicateMemberAsConflict(() =>
        createResidentUser(communityId, {
          id: userId,
          email: normalizedEmail,
          fullName,
          phone: phone ?? null,
        }),
      );
    }

    const existingRole = await getResidentRoleByUserId(communityId, userId);

    if (existingRole) {
      throw duplicateMemberConflict(existingRole['role']);
    }

    const effectiveIsUnitOwner = role === 'resident' ? (isUnitOwner ?? false) : false;
    const displayTitle = resolveDisplayTitle(role, effectiveIsUnitOwner);

    const insertedRole = await withDuplicateMemberAsConflict(() =>
      createResidentRole(communityId, {
        userId,
        role,
        unitId: unitId ?? null,
        isUnitOwner: effectiveIsUnitOwner,
        displayTitle,
      }),
    );

    await createResidentNotificationPreferences(communityId, userId);

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'resident',
      resourceId: userId,
      communityId,
      newValues: {
        email: normalizedEmail,
        fullName,
        phone: phone ?? null,
        role,
        unitId: unitId ?? null,
        isNewUser,
      },
    });

    return {
      userId,
      communityId,
      role,
      unitId: unitId ?? null,
      roleId: insertedRole['id'] as number,
      email: normalizedEmail,
      fullName,
      phone: phone ?? null,
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(residentsUpdateContract, async ({ body, communityId }) => {
    await assertNotDemoGrace(communityId);
    const {
      userId,
      fullName,
      phone,
      role,
      unitId,
      isUnitOwner: patchIsUnitOwner,
      expectedUpdatedAt,
    } = body;
    const actorUserId = await requireAuthenticatedUserId();
    const actorMembership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(actorMembership, 'residents', 'write');

    if (userId === actorUserId && role !== undefined) {
      throw new ForbiddenError('Cannot modify your own role');
    }

    if (role !== undefined && !isResidentTierRole(role)) {
      throw new ForbiddenError(MANAGER_TIER_VIA_RESIDENTS_MSG);
    }

    const existingRole = await getResidentRoleByUserId(communityId, userId);

    if (!existingRole) {
      throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
    }

    const oldRole = requireCommunityRole(existingRole['role'], `residents.PATCH existing role (userId=${userId})`);
    const oldUnitId = (existingRole['unitId'] as number | null) ?? null;

    // A manager-tier member's role configuration (role / unit / owner flag) is
    // managed exclusively from the root-only Roles & Access screen. The
    // residents path must not mutate it even when `role` is omitted. Only
    // contact fields (fullName / phone) remain editable here for these rows.
    if (
      !isResidentTierRole(oldRole) &&
      (role !== undefined ||
        unitId !== undefined ||
        patchIsUnitOwner !== undefined)
    ) {
      throw new ForbiddenError(MANAGER_TIER_VIA_RESIDENTS_MSG);
    }

    const newRole = role ?? oldRole;
    const newUnitId = unitId !== undefined ? (unitId ?? null) : oldUnitId;

    if (role !== undefined || unitId !== undefined) {
      const communityType = await getCommunityType(communityId);
      const validation = validateRoleAssignment(newRole, communityType, newUnitId);
      if (!validation.valid) {
        throw new ValidationError(validation.error ?? 'Invalid role assignment');
      }
      // Reject a foreign-tenant unit reference before any write happens.
      if (unitId !== undefined) {
        await assertUnitInCommunity(createScopedClient(communityId), unitId);
      }
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // Contact fields (platform-level `users` row). Only what actually changes
    // is written and audited: the edit form re-sends every field, and an audit
    // row reading "unit 4 → 4" is noise that hides real moves.
    const userUpdate: Record<string, unknown> = {};
    if (fullName !== undefined || phone !== undefined) {
      const currentUser = await getResidentUserById(communityId, userId);
      if (fullName !== undefined && fullName !== (currentUser?.['fullName'] ?? null)) {
        oldValues['fullName'] = currentUser?.['fullName'] ?? null;
        newValues['fullName'] = fullName;
        userUpdate['fullName'] = fullName;
      }
      if (phone !== undefined && (phone ?? null) !== (currentUser?.['phone'] ?? null)) {
        oldValues['phone'] = currentUser?.['phone'] ?? null;
        newValues['phone'] = phone;
        userUpdate['phone'] = phone;
      }
    }

    // Membership fields (`user_roles`), validated before anything is written.
    const roleUpdate: Record<string, unknown> = {};
    if (role !== undefined && role !== oldRole) {
      oldValues['role'] = oldRole;
      newValues['role'] = role;
      roleUpdate['role'] = role;
    }
    if (unitId !== undefined && (unitId ?? null) !== oldUnitId) {
      oldValues['unitId'] = oldUnitId;
      newValues['unitId'] = unitId ?? null;
      roleUpdate['unitId'] = unitId ?? null;
    }
    if (role !== undefined || patchIsUnitOwner !== undefined) {
      const effectiveIsUnitOwner = newRole === 'resident'
        ? (patchIsUnitOwner ?? (existingRole['isUnitOwner'] as boolean) ?? false)
        : false;
      if (newRole === 'resident' && effectiveIsUnitOwner && (await getCommunityType(communityId)) === 'apartment') {
        throw new ValidationError('Owners are not allowed in apartment communities');
      }
      const oldIsUnitOwner = existingRole['isUnitOwner'] === true;
      if (effectiveIsUnitOwner !== oldIsUnitOwner || 'role' in roleUpdate) {
        if (effectiveIsUnitOwner !== oldIsUnitOwner) {
          oldValues['isUnitOwner'] = oldIsUnitOwner;
          newValues['isUnitOwner'] = effectiveIsUnitOwner;
        }
        roleUpdate['isUnitOwner'] = effectiveIsUnitOwner;
        roleUpdate['displayTitle'] = resolveDisplayTitle(newRole as CommunityRole, effectiveIsUnitOwner);
      }
    }

    const changed = Object.keys(userUpdate).length > 0 || Object.keys(roleUpdate).length > 0;

    // The membership row is the version (`ResidentListRow.updatedAt`). With a
    // token, it is written first — conditionally, and even when only contact
    // fields change, which bumps its updatedAt — so of two managers saving from
    // the same read, the second is refused before touching anything.
    // ponytail: no transaction (the scoped client has none). A failure writing
    // `users` after this leaves the membership bumped; the retry then gets a
    // 409 and a refreshed form, which is safe. A resident editing their own
    // profile in between is not detected — their edits go through `users`
    // only, outside this version.
    if (changed && expectedUpdatedAt !== undefined) {
      const fresh = await updateResidentRole(communityId, userId, roleUpdate, expectedUpdatedAt);
      if (!fresh) {
        throw new ConflictError('Someone else changed this resident since you opened them. Reload to see their changes.');
      }
    } else if (Object.keys(roleUpdate).length > 0) {
      await updateResidentRole(communityId, userId, roleUpdate);
    }
    if (Object.keys(userUpdate).length > 0) {
      await updateResidentUser(communityId, userId, userUpdate);
    }

    if (!changed) {
      return { userId, communityId, role: oldRole, unitId: oldUnitId };
    }

    // Electronic-notice consent belongs to unit owners. When this edit ends
    // ownership, the consent ends with it, recorded as such rather than left
    // active on a tenant or manager.
    const wasOwner = oldRole === 'resident' && existingRole['isUnitOwner'] === true;
    const isOwnerNow =
      newRole === 'resident' && (roleUpdate['isUnitOwner'] ?? existingRole['isUnitOwner']) === true;
    if (wasOwner && !isOwnerNow) {
      await withdrawNoticeConsent(communityId, userId, { reason: 'ownership_ended', actorUserId });
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'resident',
      resourceId: userId,
      communityId,
      oldValues,
      newValues,
    });

    return {
      userId,
      communityId,
      role: newRole,
      unitId: newUnitId,
    };
  }),
);

export const DELETE = withErrorHandler(
  runRoute(residentsDeleteContract, async ({ body, communityId }) => {
    await assertNotDemoGrace(communityId);
    const { userId } = body;
    const actorUserId = await requireAuthenticatedUserId();
    const actorMembership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(actorMembership, 'residents', 'write');

    const existingRole = await getResidentRoleByUserId(communityId, userId);

    if (!existingRole) {
      throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
    }

    // Same rule as POST/PATCH: manager-tier rows are managed only from the
    // root-only Roles & Access screen. Without this, any holder of
    // residents:write (every property manager) could hard-delete the root
    // manager's role — a root-exclusive power under ADR-006.
    const existingRoleValue = requireCommunityRole(
      existingRole['role'],
      `residents.DELETE existing role (userId=${userId})`,
    );
    if (!isResidentTierRole(existingRoleValue)) {
      throw new ForbiddenError(MANAGER_TIER_VIA_RESIDENTS_MSG);
    }

    await deleteResidentRole(communityId, userId);
    await withdrawNoticeConsent(communityId, userId, { reason: 'membership_removed', actorUserId });

    const revokedCount = await revokeVisitorPassesForUser(communityId, userId);
    if (revokedCount > 0) {
      console.info(`Cascade-revoked ${revokedCount} visitor passes for removed user ${userId}`);
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'resident',
      resourceId: userId,
      communityId,
      oldValues: {
        role: existingRole['role'],
        unitId: existingRole['unitId'],
      },
    });

    return { success: true as const };
  }),
);

function resolveDisplayTitle(
  role: CommunityRole,
  isUnitOwner?: boolean,
): string {
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  // Unreachable from the residents path: manager-tier roles are rejected by
  // the isResidentTierRole guard before this runs.
  return 'Property Manager Admin';
}

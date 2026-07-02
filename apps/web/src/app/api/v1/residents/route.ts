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
  NEW_COMMUNITY_ROLES,
  type NewCommunityRole,
  type CommunityType,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { revokeVisitorPassesForUser } from '@/lib/services/package-visitor-service';
import { requireCommunityType, requireNewCommunityRole } from '@/lib/utils/community-validators';
import { isResidentTierRole, validateRoleAssignment } from '@/lib/utils/role-validator';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { assertUnitInCommunity } from '@/lib/services/scoped-fk-validators';
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

    const { searchParams } = new URL(req.url);
    const validRoles = new Set(NEW_COMMUNITY_ROLES as unknown as string[]);
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

    return listResidentsForCommunity(communityId, roleFilter);
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

    if (isNewUser) {
      userRow = await createResidentUser(communityId, {
        id: userId,
        email: normalizedEmail,
        fullName,
        phone: phone ?? null,
      });
    }

    const existingRole = await getResidentRoleByUserId(communityId, userId);

    if (existingRole) {
      throw new ValidationError(
        `User already has role "${existingRole['role']}" in this community. Use PATCH to update.`,
      );
    }

    const effectiveIsUnitOwner = role === 'resident' ? (isUnitOwner ?? false) : false;
    const displayTitle = resolveDisplayTitle(role, effectiveIsUnitOwner);

    const insertedRole = await createResidentRole(communityId, {
      userId,
      role,
      unitId: unitId ?? null,
      isUnitOwner: effectiveIsUnitOwner,
      displayTitle,
    });

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

    const oldRole = requireNewCommunityRole(existingRole['role'], `residents.PATCH existing role (userId=${userId})`);
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

    if (fullName !== undefined || phone !== undefined) {
      const currentUser = await getResidentUserById(communityId, userId);

      const userUpdate: Record<string, unknown> = {};

      if (fullName !== undefined) {
        oldValues['fullName'] = currentUser?.['fullName'] ?? null;
        newValues['fullName'] = fullName;
        userUpdate['fullName'] = fullName;
      }

      if (phone !== undefined) {
        oldValues['phone'] = currentUser?.['phone'] ?? null;
        newValues['phone'] = phone;
        userUpdate['phone'] = phone;
      }

      if (Object.keys(userUpdate).length > 0) {
        await updateResidentUser(communityId, userId, userUpdate);
      }
    }

    if (role !== undefined || unitId !== undefined || patchIsUnitOwner !== undefined) {
      const communityType = await getCommunityType(communityId);
      const roleUpdate: Record<string, unknown> = {};

      if (role !== undefined) {
        oldValues['role'] = oldRole;
        newValues['role'] = role;
        roleUpdate['role'] = role;
      }

      if (unitId !== undefined) {
        oldValues['unitId'] = oldUnitId;
        newValues['unitId'] = unitId ?? null;
        roleUpdate['unitId'] = unitId ?? null;
      }

      if (role !== undefined || patchIsUnitOwner !== undefined) {
        const effectiveIsUnitOwner = newRole === 'resident'
          ? (patchIsUnitOwner ?? (existingRole['isUnitOwner'] as boolean) ?? false)
          : false;
        roleUpdate['isUnitOwner'] = effectiveIsUnitOwner;

        if (newRole === 'resident' && effectiveIsUnitOwner && communityType === 'apartment') {
          throw new ValidationError('Owners are not allowed in apartment communities');
        }

        roleUpdate['displayTitle'] = resolveDisplayTitle(
          newRole as NewCommunityRole,
          effectiveIsUnitOwner,
        );
      }

      if (Object.keys(roleUpdate).length > 0) {
        await updateResidentRole(communityId, userId, roleUpdate);
      }
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

    await deleteResidentRole(communityId, userId);

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
  role: NewCommunityRole,
  isUnitOwner?: boolean,
): string {
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  // Unreachable from the residents path: manager-tier roles are rejected by
  // the isResidentTierRole guard before this runs.
  return 'Property Manager Admin';
}

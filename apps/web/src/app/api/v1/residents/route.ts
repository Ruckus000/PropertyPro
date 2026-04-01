/**
 * Residents CRUD API — manages users + role assignments per community.
 *
 * GET    /api/v1/residents?communityId=N  — list residents for a community
 * POST   /api/v1/residents               — create resident + assign role
 * PATCH  /api/v1/residents               — update resident info or role
 * DELETE /api/v1/residents               — remove resident role from community
 *
 * All routes use:
 * - withErrorHandler (AGENTS #43)
 * - createScopedClient for tenant isolation (AGENTS #7, #14)
 * - logAuditEvent for mutations (P1-27)
 * - Zod validation
 * - ADR-001 role constraints via role-validator
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
import {
  NEW_COMMUNITY_ROLES,
  PRESET_KEYS,
  type NewCommunityRole,
  type CommunityType,
  type PresetKey,
  getPresetPermissions,
  PRESET_METADATA,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { revokeVisitorPassesForUser } from '@/lib/services/package-visitor-service';
import { requireCommunityType, requireNewCommunityRole } from '@/lib/utils/community-validators';
import { validateRoleAssignment } from '@/lib/utils/role-validator';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const communityIdSchema = z.coerce.number().int().positive();

const createResidentSchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(NEW_COMMUNITY_ROLES) as z.ZodType<NewCommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional().default(false),
  presetKey: (z.enum(PRESET_KEYS as unknown as [string, ...string[]]) as z.ZodType<PresetKey>).optional(),
});

const updateResidentSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: (z.enum(NEW_COMMUNITY_ROLES) as z.ZodType<NewCommunityRole>).optional(),
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional(),
  presetKey: (z.enum(PRESET_KEYS as unknown as [string, ...string[]]) as z.ZodType<PresetKey>).nullable().optional(),
});

const deleteResidentSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
});

async function getCommunityType(communityId: number): Promise<CommunityType> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === communityId);

  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  return requireCommunityType(community['communityType'], `residents.getCommunityType(${communityId})`);
}

// ---------------------------------------------------------------------------
// GET — list residents for a community
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');

  const communityIdResult = communityIdSchema.safeParse(rawCommunityId);
  if (!communityIdResult.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(communityIdResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, communityIdResult.data);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'residents', 'read');
  const scoped = createScopedClient(communityId);

  // Optional role filters pushed to the DB — avoids fetching and discarding unneeded rows
  const validRoles = new Set(NEW_COMMUNITY_ROLES as unknown as string[]);
  const rolesParam = searchParams.get('roles');
  const roleParam = searchParams.get('role');

  let roleRows: Record<string, unknown>[];
  if (rolesParam) {
    const roleList = rolesParam.split(',').map((r) => r.trim()).filter(Boolean);
    for (const r of roleList) {
      if (!validRoles.has(r)) throw new ValidationError(`Invalid role filter: ${r}`);
    }
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, roleList as unknown as ('resident' | 'manager' | 'pm_admin')[]),
    ) as unknown as Record<string, unknown>[];
  } else if (roleParam) {
    if (!validRoles.has(roleParam)) throw new ValidationError(`Invalid role filter: ${roleParam}`);
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      eq(userRoles.role, roleParam as 'resident' | 'manager' | 'pm_admin'),
    ) as unknown as Record<string, unknown>[];
  } else {
    roleRows = await scoped.query(userRoles) as unknown as Record<string, unknown>[];
  }

  if (roleRows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const userIds = new Set(roleRows.map((row) => row['userId'] as string));
  const userRows = await scoped.query(users);

  const userMap = new Map<string, Record<string, unknown>>();
  for (const row of userRows) {
    const userId = row['id'] as string;
    if (userIds.has(userId)) {
      userMap.set(userId, row as Record<string, unknown>);
    }
  }

  const residents = roleRows.map((roleRow) => {
    const userId = roleRow['userId'] as string;
    const userRow = userMap.get(userId);

    return {
      userId,
      communityId,
      roleId: roleRow['id'] as number,
      role: roleRow['role'] as string,
      unitId: (roleRow['unitId'] as number | null) ?? null,
      email: (userRow?.['email'] as string | undefined) ?? null,
      fullName: (userRow?.['fullName'] as string | undefined) ?? null,
      phone: (userRow?.['phone'] as string | undefined) ?? null,
      createdAt: roleRow['createdAt'] as string,
    };
  });

  return NextResponse.json({ data: residents });
});

// ---------------------------------------------------------------------------
// POST — create a resident (user + role) in a community
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = createResidentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { email, fullName, phone, role, unitId, isUnitOwner, presetKey } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const actorMembership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(actorMembership, 'residents', 'write');
  const scoped = createScopedClient(communityId);

  const communityType = await getCommunityType(communityId);

  const validation = validateRoleAssignment(role, communityType, unitId ?? null);
  if (!validation.valid) {
    throw new ValidationError(validation.error ?? 'Invalid role assignment');
  }

  // Validate hybrid-model invariants
  if (role === 'manager' && !presetKey) {
    throw new ValidationError('presetKey is required when role is "manager"');
  }
  if (role === 'resident' && isUnitOwner && communityType === 'apartment') {
    throw new ValidationError('Owners are not allowed in apartment communities');
  }

  // users table is global; scoped query applies only deleted_at filtering here.
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

  const existingRoles = await scoped.query(userRoles);
  const existingRole = existingRoles.find((row) => row['userId'] === userId);

  if (existingRole) {
    throw new ValidationError(
      `User already has role "${existingRole['role']}" in this community. Use PATCH to update.`,
    );
  }

  // Derive hybrid-model fields
  const effectiveIsUnitOwner = role === 'resident' ? (isUnitOwner ?? false) : false;
  const permissions =
    role === 'manager' && presetKey
      ? getPresetPermissions(presetKey, communityType)
      : null;
  const displayTitle = resolveDisplayTitle(role, effectiveIsUnitOwner, presetKey);

  const insertedRoles = await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
    isUnitOwner: effectiveIsUnitOwner,
    permissions,
    presetKey: role === 'manager' ? (presetKey ?? null) : null,
    displayTitle,
  });

  // Acceptance criterion: create notification_preferences when user role is created.
  await scoped.insert(notificationPreferences, {
    userId,
  });

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

  return NextResponse.json(
    {
      data: {
        userId,
        communityId,
        role,
        unitId: unitId ?? null,
        roleId: insertedRoles[0]?.['id'] as number,
        email: normalizedEmail,
        fullName,
        phone: phone ?? null,
      },
    },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// PATCH — update resident info or role
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = updateResidentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const {
    userId,
    fullName,
    phone,
    role,
    unitId,
    isUnitOwner: patchIsUnitOwner,
    presetKey: patchPresetKey,
  } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const actorMembership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(actorMembership, 'residents', 'write');

  if (userId === actorUserId && role !== undefined) {
    throw new ForbiddenError('Cannot modify your own role');
  }

  const scoped = createScopedClient(communityId);

  const roleRows = await scoped.query(userRoles);
  const existingRole = roleRows.find((row) => row['userId'] === userId);

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  const oldRole = requireNewCommunityRole(existingRole['role'], `residents.PATCH existing role (userId=${userId})`);
  const oldUnitId = (existingRole['unitId'] as number | null) ?? null;

  const newRole = role ?? oldRole;
  const newUnitId = unitId !== undefined ? (unitId ?? null) : oldUnitId;

  if (role !== undefined || unitId !== undefined) {
    const communityType = await getCommunityType(communityId);
    const validation = validateRoleAssignment(newRole, communityType, newUnitId);
    if (!validation.valid) {
      throw new ValidationError(validation.error ?? 'Invalid role assignment');
    }
  }

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  if (fullName !== undefined || phone !== undefined) {
    const userRows = await scoped.query(users);
    const currentUser = userRows.find((row) => row['id'] === userId);

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
      await scoped.update(users, userUpdate, eq(users.id, userId));
    }
  }

  if (role !== undefined || unitId !== undefined || patchIsUnitOwner !== undefined || patchPresetKey !== undefined) {
    const communityType = await getCommunityType(communityId);
    const roleUpdate: Record<string, unknown> = {};

    // Validate manager role requires preset
    if (newRole === 'manager') {
      const effectivePreset = patchPresetKey ?? (existingRole['presetKey'] as string | null);
      if (!effectivePreset) {
        throw new ValidationError('presetKey is required when role is "manager"');
      }
    }

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

    // Update hybrid-model fields when role changes
    if (role !== undefined || patchIsUnitOwner !== undefined) {
      const effectiveIsUnitOwner = newRole === 'resident'
        ? (patchIsUnitOwner ?? (existingRole['isUnitOwner'] as boolean) ?? false)
        : false;
      roleUpdate['isUnitOwner'] = effectiveIsUnitOwner;

      if (newRole === 'resident' && effectiveIsUnitOwner && communityType === 'apartment') {
        throw new ValidationError('Owners are not allowed in apartment communities');
      }
    }

    if (role !== undefined || patchPresetKey !== undefined) {
      const effectivePreset = newRole === 'manager'
        ? (patchPresetKey ?? (existingRole['presetKey'] as PresetKey | null))
        : null;
      roleUpdate['presetKey'] = effectivePreset;

      // Recalculate permissions and displayTitle
      roleUpdate['permissions'] = newRole === 'manager' && effectivePreset
        ? getPresetPermissions(effectivePreset as PresetKey, communityType)
        : null;
      roleUpdate['displayTitle'] = resolveDisplayTitle(
        newRole as NewCommunityRole,
        roleUpdate['isUnitOwner'] as boolean | undefined,
        effectivePreset as PresetKey | undefined,
      );
    }

    if (Object.keys(roleUpdate).length > 0) {
      await scoped.update(userRoles, roleUpdate, eq(userRoles.userId, userId));
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

  return NextResponse.json({
    data: {
      userId,
      communityId,
      role: newRole,
      unitId: newUnitId,
    },
  });
});

// ---------------------------------------------------------------------------
// DELETE — remove a resident's role from a community
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = deleteResidentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { userId } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const actorMembership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(actorMembership, 'residents', 'write');
  const scoped = createScopedClient(communityId);

  const roleRows = await scoped.query(userRoles);
  const existingRole = roleRows.find((row) => row['userId'] === userId);

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  await scoped.hardDelete(userRoles, eq(userRoles.userId, userId));

  // Cascade: revoke active recurring/permanent visitor passes registered by this user.
  // Coupling note: this is the only resident removal code path in the codebase.
  // If additional removal paths are added, they must also cascade visitor revocations.
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

  return NextResponse.json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDisplayTitle(
  role: NewCommunityRole,
  isUnitOwner?: boolean,
  presetKey?: PresetKey | null,
): string {
  if (role === 'manager' && presetKey) return PRESET_METADATA[presetKey].displayTitle;
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Property Manager Admin';
}

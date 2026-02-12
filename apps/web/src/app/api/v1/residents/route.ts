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
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
} from '@propertypro/db';
import { COMMUNITY_ROLES, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { validateRoleAssignment } from '@/lib/utils/role-validator';

const communityIdSchema = z.coerce.number().int().positive();

const createResidentSchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(COMMUNITY_ROLES) as z.ZodType<CommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
});

const updateResidentSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: (z.enum(COMMUNITY_ROLES) as z.ZodType<CommunityRole>).optional(),
  unitId: z.number().int().positive().nullable().optional(),
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

  return community['communityType'] as CommunityType;
}

// ---------------------------------------------------------------------------
// GET — list residents for a community
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');

  const communityIdResult = communityIdSchema.safeParse(rawCommunityId);
  if (!communityIdResult.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(communityIdResult.error),
    });
  }

  const communityId = communityIdResult.data;
  const scoped = createScopedClient(communityId);

  const roleRows = await scoped.query(userRoles);
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

  const { communityId, email, fullName, phone, role, unitId } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, actorUserId);
  const scoped = createScopedClient(communityId);

  const communityType = await getCommunityType(communityId);

  const validation = validateRoleAssignment(role, communityType, unitId ?? null);
  if (!validation.valid) {
    throw new ValidationError(validation.error ?? 'Invalid role assignment');
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

  const insertedRoles = await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
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

  const { communityId, userId, fullName, phone, role, unitId } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, actorUserId);
  const scoped = createScopedClient(communityId);

  const roleRows = await scoped.query(userRoles);
  const existingRole = roleRows.find((row) => row['userId'] === userId);

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  const oldRole = existingRole['role'] as CommunityRole;
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

  if (role !== undefined || unitId !== undefined) {
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

  const { communityId, userId } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, actorUserId);
  const scoped = createScopedClient(communityId);

  const roleRows = await scoped.query(userRoles);
  const existingRole = roleRows.find((row) => row['userId'] === userId);

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  await scoped.hardDelete(userRoles, eq(userRoles.userId, userId));

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

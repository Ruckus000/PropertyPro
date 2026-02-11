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
import { eq } from 'drizzle-orm';
import {
  createScopedClient,
  logAuditEvent,
  users,
  userRoles,
  communities,
} from '@propertypro/db';
import { COMMUNITY_ROLES, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { validateRoleAssignment } from '@/lib/utils/role-validator';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const communityIdSchema = z.coerce.number().int().positive();

const createResidentSchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(COMMUNITY_ROLES as unknown as [string, ...string[]]) as z.ZodType<CommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
});

const updateResidentSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(COMMUNITY_ROLES as unknown as [string, ...string[]]).optional() as z.ZodType<CommunityRole | undefined>,
  unitId: z.number().int().positive().nullable().optional(),
});

const deleteResidentSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
});

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

  // Fetch user_roles scoped to this community
  const roles = await scoped.query(userRoles);

  // Fetch user details for each role
  // Users table has no communityId — use scoped client on communities table
  // to verify community exists, then query users by IDs from roles
  const userIds = roles.map((r) => r['userId'] as string);

  if (userIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Fetch all users who have roles in this community
  // users table doesn't have communityId, so we query it via the unscoped
  // result set from userRoles (which is already scoped)
  const allUsers = await scoped.query(users);
  const userMap = new Map(
    (allUsers as Array<Record<string, unknown>>)
      .filter((u) => userIds.includes(u['id'] as string))
      .map((u) => [u['id'] as string, u]),
  );

  const residents = roles.map((role) => {
    const userId = role['userId'] as string;
    const user = userMap.get(userId);
    return {
      userId,
      communityId,
      role: role['role'] as string,
      unitId: (role['unitId'] as number | null) ?? null,
      roleId: role['id'] as number,
      email: user ? (user['email'] as string) : null,
      fullName: user ? (user['fullName'] as string) : null,
      phone: user ? (user['phone'] as string | null) : null,
      createdAt: role['createdAt'] as string,
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
  const scoped = createScopedClient(communityId);

  // Look up community to get communityType for role constraint validation
  const communityRows = await scoped.query(communities);
  // communities table doesn't have communityId column so scoped query
  // returns all non-deleted communities. Filter by the actual id.
  const community = communityRows.find(
    (c) => (c['id'] as number) === communityId,
  );
  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  const communityType = community['communityType'] as CommunityType;

  // Validate role assignment per ADR-001
  const validation = validateRoleAssignment(role, communityType, unitId ?? null);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }

  // Check if user already exists by email
  const existingUsers = await scoped.query(users);
  let user = existingUsers.find(
    (u) => (u['email'] as string).toLowerCase() === email.toLowerCase(),
  );

  let userId: string;
  let isNewUser = false;

  if (user) {
    userId = user['id'] as string;

    // Check if user already has a role in this community
    const existingRoles = await scoped.query(userRoles);
    const existingRole = existingRoles.find(
      (r) => (r['userId'] as string) === userId,
    );

    if (existingRole) {
      throw new ValidationError(
        `User already has role "${existingRole['role']}" in this community. Use PATCH to update.`,
      );
    }
  } else {
    // Create new user
    isNewUser = true;
    const newUserId = crypto.randomUUID();
    const inserted = await scoped.insert(users, {
      id: newUserId,
      email: email.toLowerCase(),
      fullName,
      phone: phone ?? null,
    });
    userId = inserted[0]!['id'] as string;
  }

  // Assign role in this community
  const roleInserted = await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
  });

  // Audit log
  await logAuditEvent({
    userId,
    action: 'create',
    resourceType: 'resident',
    resourceId: userId,
    communityId,
    newValues: { email, fullName, role, unitId: unitId ?? null, isNewUser },
  });

  return NextResponse.json(
    {
      data: {
        userId,
        communityId,
        role,
        unitId: unitId ?? null,
        roleId: roleInserted[0]!['id'] as number,
        email: email.toLowerCase(),
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
  const scoped = createScopedClient(communityId);

  // Find the existing role for this user in this community
  const existingRoles = await scoped.query(userRoles);
  const existingRole = existingRoles.find(
    (r) => (r['userId'] as string) === userId,
  );

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  const oldRole = existingRole['role'] as CommunityRole;
  const oldUnitId = existingRole['unitId'] as number | null;

  // Determine final role and unitId for validation
  const newRole = role ?? oldRole;
  const newUnitId = unitId !== undefined ? (unitId ?? null) : oldUnitId;

  // If role or unitId are changing, validate the new assignment
  if (role !== undefined || unitId !== undefined) {
    const communityRows = await scoped.query(communities);
    const community = communityRows.find(
      (c) => (c['id'] as number) === communityId,
    );
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const communityType = community['communityType'] as CommunityType;
    const validation = validateRoleAssignment(newRole, communityType, newUnitId);
    if (!validation.valid) {
      throw new ValidationError(validation.error!);
    }
  }

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  // Update user fields if provided
  if (fullName !== undefined || phone !== undefined) {
    const userUpdate: Record<string, unknown> = {};
    if (fullName !== undefined) {
      oldValues['fullName'] = undefined; // We don't have old value readily
      newValues['fullName'] = fullName;
      userUpdate['fullName'] = fullName;
    }
    if (phone !== undefined) {
      newValues['phone'] = phone;
      userUpdate['phone'] = phone;
    }

    await scoped.update(users, userUpdate, eq(users.id, userId));
  }

  // Update role assignment if role or unitId changed
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

    await scoped.update(
      userRoles,
      roleUpdate,
      eq(userRoles.userId, userId),
    );
  }

  // Audit log
  await logAuditEvent({
    userId,
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
  const scoped = createScopedClient(communityId);

  // Find the existing role
  const existingRoles = await scoped.query(userRoles);
  const existingRole = existingRoles.find(
    (r) => (r['userId'] as string) === userId,
  );

  if (!existingRole) {
    throw new NotFoundError(`User ${userId} has no role in community ${communityId}`);
  }

  // user_roles has no deletedAt — use hardDelete
  await scoped.hardDelete(userRoles, eq(userRoles.userId, userId));

  // Audit log
  await logAuditEvent({
    userId,
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

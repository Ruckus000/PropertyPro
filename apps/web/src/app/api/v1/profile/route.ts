/**
 * Profile API
 *
 * PATCH /api/v1/profile — update the current user's name and/or phone
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Auth via requireAuthenticatedUserId
 * - Community membership verified for tenant context
 * - Users table is NOT tenant-scoped — uses createUnscopedClient
 * - Syncs full_name to Supabase user_metadata via admin client
 * - Audit log on updates with action 'profile.updated'
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAdminClient,
  users,
  logAuditEvent,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().nullable().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid profile update payload');
  }

  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const { fullName, phone } = result.data;

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (fullName !== undefined) {
    updateValues['fullName'] = fullName;
  }
  if (phone !== undefined) {
    updateValues['phone'] = phone;
  }

  // Users table has no community_id — use unscoped client
  const db = createUnscopedClient();
  await db
    .update(users)
    .set(updateValues)
    .where(eq(users.id, userId));

  // Sync full_name to Supabase user_metadata for auth display
  if (fullName) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName },
    });
  }

  await logAuditEvent({
    userId,
    action: 'profile.updated',
    resourceType: 'user',
    resourceId: userId,
    communityId,
    newValues: updateValues,
  });

  return NextResponse.json({
    data: { userId, ...updateValues },
  });
});

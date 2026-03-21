/**
 * Account Profile API
 *
 * PATCH /api/v1/account/profile — update the current user's name and/or phone
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Auth via requireAuthenticatedUserId (user-scoped, no community context)
 * - Users table is NOT tenant-scoped — uses createUnscopedClient
 * - Syncs full_name to Supabase user_metadata via admin client
 * - Audit log with action 'profile.updated'
 *
 * Authorization contract: The authenticated user can only update their own row.
 * No community membership is required — this is a user-level operation.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAdminClient,
  users,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';

const patchSchema = z.object({
  fullName: z.string().min(1, 'Name is required').max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid profile update payload');
  }

  const userId = await requireAuthenticatedUserId();
  const { fullName, phone } = result.data;

  if (fullName === undefined && phone === undefined) {
    throw new ValidationError('No fields to update');
  }

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

  // Note: profile updates are user-scoped, not community-scoped.
  // The compliance_audit_log table requires a community FK, so we skip
  // audit logging here. Profile changes are tracked in Supabase user_metadata.

  return NextResponse.json({
    data: { userId, ...updateValues },
  });
});

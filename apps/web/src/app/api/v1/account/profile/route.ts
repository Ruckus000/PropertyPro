/**
 * Account Profile API
 *
 * PATCH /api/v1/account/profile — update the current user's name and/or phone
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Auth via requireAuthenticatedUserId (user-scoped, no community context)
 * - Users table is NOT tenant-scoped — service uses createUnscopedClient
 * - Syncs full_name to Supabase user_metadata via admin client (route concern)
 * - No audit log: profile updates are user-scoped, not community-scoped, and
 *   the compliance_audit_log table requires a community FK. Profile changes
 *   are tracked in Supabase user_metadata.
 *
 * Authorization contract: The authenticated user can only update their own row.
 * No community membership is required — this is a user-level operation.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { updateUserProfile } from '@/lib/services/user-profile-service';

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

  const { updatedAt, changedFields } = await updateUserProfile(userId, {
    fullName,
    phone,
  });

  // Sync full_name to Supabase user_metadata for auth display
  if (fullName) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName },
    });
  }

  return NextResponse.json({
    data: { userId, updatedAt, ...changedFields },
  });
});

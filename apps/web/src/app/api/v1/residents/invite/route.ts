/**
 * POST /api/v1/residents/invite — atomically create resident + send invitation
 *
 * Combines the two-step "create resident then send invitation" flow into a
 * single request to prevent orphaned users who have no way to log in.
 *
 * If resident creation succeeds but the invitation email fails, the endpoint
 * still returns the created user with `invitationFailed: true` so the UI can
 * prompt a retry.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { NEW_COMMUNITY_ROLES, PRESET_KEYS, type NewCommunityRole, type CommunityType, type PresetKey } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireCommunityType } from '@/lib/utils/community-validators';
import {
  createOnboardingResident,
  createOnboardingInvitation,
} from '@/lib/services/onboarding-service';

const createAndInviteSchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(NEW_COMMUNITY_ROLES) as z.ZodType<NewCommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional().default(false),
  presetKey: (z.enum(PRESET_KEYS as unknown as [string, ...string[]]) as z.ZodType<PresetKey>).optional(),
  ttlDays: z.number().int().positive().default(7),
  sendInvitation: z.boolean().optional().default(true),
});

async function getCommunityType(communityId: number): Promise<CommunityType> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === communityId);

  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  return requireCommunityType(community['communityType'], `residents/invite.getCommunityType(${communityId})`);
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = createAndInviteSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const {
    email,
    fullName,
    phone,
    role,
    unitId,
    isUnitOwner,
    presetKey,
    ttlDays,
    sendInvitation,
  } = parseResult.data;

  // Auth + authz
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'residents', 'write');

  // Subscription check
  await requireActiveSubscriptionForMutation(communityId);

  // Validate hybrid-model invariants
  if (role === 'manager' && !presetKey) {
    throw new ValidationError('presetKey is required when role is "manager"');
  }

  const communityType = await getCommunityType(communityId);

  if (role === 'resident' && isUnitOwner && communityType === 'apartment') {
    throw new ValidationError('Owners are not allowed in apartment communities');
  }

  // Step 1: Create resident (user + role)
  const { userId, isNewUser } = await createOnboardingResident({
    communityId,
    email,
    fullName,
    phone: phone ?? null,
    role,
    unitId: unitId ?? null,
    actorUserId,
    communityType,
    isUnitOwner,
    presetKey,
  });

  // Step 2: Send invitation (best-effort — don't fail the whole request)
  let invitationToken: string | null = null;
  let invitationExpiresAt: Date | null = null;
  let invitationFailed = false;

  if (sendInvitation) {
    try {
      const invitation = await createOnboardingInvitation({
        communityId,
        userId,
        ttlDays,
        actorUserId,
      });
      invitationToken = invitation.token;
      invitationExpiresAt = invitation.expiresAt;
    } catch (inviteError) {
      invitationFailed = true;
      // Log but don't throw — the resident was created successfully
      console.error('[residents/invite] Invitation failed after resident created:', inviteError);

      await logAuditEvent({
        userId: actorUserId,
        action: 'create',
        resourceType: 'invitation_failed',
        resourceId: userId,
        communityId,
        newValues: {
          error: inviteError instanceof Error ? inviteError.message : 'Unknown error',
        },
      });
    }
  }

  return NextResponse.json(
    {
      data: {
        userId,
        isNewUser,
        invitationFailed,
        ...(invitationToken && { token: invitationToken }),
        ...(invitationExpiresAt && { expiresAt: invitationExpiresAt.toISOString() }),
      },
    },
    { status: 201 },
  );
});

/**
 * POST /api/v1/residents/invite — atomically create resident + send invitation
 *
 * Combines the two-step "create resident then send invitation" flow into a
 * single request to prevent orphaned users who have no way to log in.
 *
 * If resident creation succeeds but the invitation email fails, the endpoint
 * still returns the created user with `invitationFailed: true` so the UI can
 * prompt a retry.
 *
 * Plan A1 drain #140. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createOnboardingResident,
  createOnboardingInvitation,
  getCommunityTypeForOnboarding,
} from '@/lib/services/onboarding-service';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { residentsInvitePostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(residentsInvitePostContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);

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
    } = body;

    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'residents', 'write');

    await requireActiveSubscriptionForMutation(communityId);

    if (role === 'manager' && !presetKey) {
      throw new ValidationError('presetKey is required when role is "manager"');
    }

    const communityType = await getCommunityTypeForOnboarding(communityId);

    if (role === 'resident' && isUnitOwner && communityType === 'apartment') {
      throw new ValidationError('Owners are not allowed in apartment communities');
    }

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

    let invitationToken: string | null = null;
    let invitationExpiresAt: Date | null = null;
    let invitationFailed = false;

    if (sendInvitation) {
      try {
        const inviterName =
          req.headers.get('x-user-full-name') ||
          req.headers.get('x-user-email') ||
          'Your administrator';
        const invitation = await createOnboardingInvitation({
          communityId,
          userId,
          ttlDays,
          actorUserId,
          inviterName,
        });
        invitationToken = invitation.token;
        invitationExpiresAt = invitation.expiresAt;
      } catch (inviteError) {
        invitationFailed = true;
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

    void tryAutoComplete(communityId, actorUserId, 'invite_first_member');

    return {
      userId,
      isNewUser,
      invitationFailed,
      ...(invitationToken && { token: invitationToken }),
      ...(invitationExpiresAt && { expiresAt: invitationExpiresAt.toISOString() }),
    };
  }),
);

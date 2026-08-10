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
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { isResidentTierRole } from '@/lib/utils/role-validator';
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
      ttlDays,
      sendInvitation,
    } = body;

    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'residents', 'write');

    await requireActiveSubscriptionForMutation(communityId);

    // Role-v3 invariant 3: this path may only mint resident-tier roles. The
    // contract already narrows `role` to 'resident'; this guard keeps the
    // invariant even if the contract enum is ever widened again.
    if (!isResidentTierRole(role)) {
      throw new ForbiddenError('Manager roles are assigned from Roles & Access (root only).');
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
    });

    // The token is deliberately NOT captured for the response — see the return
    // statement below. Only whether the send succeeded is reported.
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

    // The invitation token is NEVER returned to the caller.
    //
    // A live token is enough to complete the accept flow and SET THAT USER'S
    // PASSWORD. Handing it back put it in reach of whoever called this route,
    // and `users` is not tenant-scoped (no `community_id` column, so
    // `createScopedClient` applies no filter — see `hasTenantIsolation` in
    // packages/db/src/scoped-client.ts). `createOnboardingResident` therefore
    // matches an invitee by email across the WHOLE platform and reuses that
    // row's id, so a manager of any community could name a resident of another
    // community by email address and be handed a working credential for them.
    //
    // Emailing it is what binds acceptance to control of the mailbox. Nothing
    // in the UI ever read this field — only `invitationFailed`.
    return {
      userId,
      isNewUser,
      invitationFailed,
      ...(invitationExpiresAt && { expiresAt: invitationExpiresAt.toISOString() }),
    };
  }),
);

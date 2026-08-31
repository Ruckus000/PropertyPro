import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requirePaymentsEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createPaymentIntentForLineItem, listActorUnitIdsForFinance } from '@/lib/services/finance-service';
import { createPaymentIntentContract } from './contract';

export const POST = withErrorHandler(
  runRoute(createPaymentIntentContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Legal gate — online payments ship disabled. Placed HERE, before the
    // subscription guard, so it is independent of that guard's deliberate
    // resident-self-service bypass below: a resident self-paying must be blocked
    // too, since the exposure is the destination-charge fund flow, not who is
    // paying. See docs/audits/2026-08-09-legal-risk-audit.md F-15.
    requirePaymentsEnabled(membership);
    // A3: a resident paying their own dues/rent must not be blocked when the
    // community's own PropertyPro subscription is soft-locked — dues collect via
    // the community's Stripe Connect account, not the platform subscription.
    // Admin-initiated charges keep the full guard.
    const isResidentSelfPay = membership.role === 'resident';
    await requireActiveSubscriptionForMutation(communityId, {
      allowResidentSelfService: isResidentSelfPay,
    });

    const payableType = body.payableType ?? 'assessment_line_item';
    const allowApartmentTenantRentSelfService =
      membership.role === 'resident' && !membership.isUnitOwner && payableType === 'rent_obligation';
    if (!allowApartmentTenantRentSelfService) {
      requireFinanceWritePermission(membership);
    }

    if (payableType === 'rent_obligation') {
      if (membership.communityType !== 'apartment') {
        throw new UnprocessableEntityError('rent_obligation payables are only supported for apartment communities');
      }
      if (body.payableId === undefined) {
        throw new BadRequestError('payableId is required for payableType rent_obligation');
      }
      if (body.lineItemId !== undefined) {
        throw new UnprocessableEntityError('lineItemId cannot be used with payableType rent_obligation');
      }
    }

    let allowedUnitId: number | undefined;
    if (membership.role === 'resident' && membership.isUnitOwner) {
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      const requestedUnitId = body.unitId;
      if (requestedUnitId !== undefined) {
        if (!actorUnitIds.includes(requestedUnitId)) {
          throw new ForbiddenError('Owners can only create payment intents for their own units');
        }
        allowedUnitId = requestedUnitId;
      } else if (actorUnitIds.length === 1) {
        const onlyUnitId = actorUnitIds[0];
        if (onlyUnitId === undefined) {
          throw new ForbiddenError('No unit association found for this owner');
        }
        allowedUnitId = onlyUnitId;
      } else {
        throw new BadRequestError('unitId is required when you are associated with multiple units');
      }
    } else if (membership.role === 'resident') {
      if (payableType !== 'rent_obligation') {
        requireFinanceAdminWrite(membership);
      }
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError('No unit association found for this resident');
      }
      const requestedUnitId = body.unitId;
      if (requestedUnitId !== undefined) {
        if (!actorUnitIds.includes(requestedUnitId)) {
          throw new ForbiddenError('Residents can only create payment intents for their own units');
        }
        allowedUnitId = requestedUnitId;
      } else if (actorUnitIds.length === 1) {
        const onlyUnitId = actorUnitIds[0];
        if (onlyUnitId === undefined) {
          throw new ForbiddenError('No unit association found for this resident');
        }
        allowedUnitId = onlyUnitId;
      } else {
        throw new BadRequestError('unitId is required when you are associated with multiple units');
      }
    } else {
      requireFinanceAdminWrite(membership);
    }

    return createPaymentIntentForLineItem(communityId, {
      lineItemId: body.lineItemId ?? body.payableId!,
      payableId: body.payableId,
      payableType,
      actorUserId,
      allowedUnitId,
      requestId: req.headers.get('x-request-id'),
    });
  }),
);

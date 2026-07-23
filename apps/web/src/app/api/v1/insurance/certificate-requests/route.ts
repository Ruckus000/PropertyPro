/**
 * Certificate-request relay API (spec #3).
 *
 * Owner-callable (insurance:read; tenants are excluded by the RBAC cell).
 * PropertyPro NEVER issues certificates — the POST relays the owner's request
 * to the agent of record with Reply-To set to the owner, so the agent replies
 * directly and PropertyPro exits the loop (§626.854 line). Rate-limited because
 * it emails an external party on user input.
 */
import { createElement } from 'react';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { CertificateRequestEmail, sendEmail } from '@propertypro/email';
import { buildCertificateRequestEmail } from '@/lib/constants/insurance-disclaimers';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, RateLimitError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import {
  createCertificateRequest,
  getInsurancePolicyById,
  getRequesterContact,
  listCertificateRequests,
} from '@/lib/services/insurance-service';
import {
  certificateRequestsCreateContract,
  certificateRequestsListContract,
} from '../contract';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function requireInsuranceHubCommunity(communityType: CommunityType): void {
  if (!getFeaturesForCommunity(communityType).hasInsuranceHub) {
    throw new ForbiddenError('The insurance hub is only available for condo and HOA communities');
  }
}

export const GET = withErrorHandler(
  runRoute(certificateRequestsListContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    // RLS scopes non-admins to their own rows; admin-tier sees all.
    const scoped = createScopedClient(communityId);
    const requests = await listCertificateRequests(scoped);
    return { requests };
  }),
);

export const POST = withErrorHandler(
  runRoute(certificateRequestsCreateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'read');

    // Emails an external party on user input — rate-limit per user.
    const rate = getRateLimiter().check(
      `certificate-request:${actorUserId}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rate.allowed) {
      throw new RateLimitError(
        `You've sent too many certificate requests today. Try again in ${rate.retryAfter}s.`,
      );
    }

    const scoped = createScopedClient(communityId);
    const policy = await getInsurancePolicyById(scoped, body.policyId);
    if (!policy) throw new ValidationError('Policy not found in this community');
    const agentEmail = policy.agentEmail;
    if (typeof agentEmail !== 'string' || agentEmail.length === 0) {
      throw new ValidationError(
        'This policy has no insurance agent on file yet — ask your board to add the agent of record.',
      );
    }

    // Requester identity for Reply-To + confirmation.
    const { email: requesterEmail, fullName: requesterName } = await getRequesterContact(
      scoped,
      actorUserId,
    );

    const email = buildCertificateRequestEmail({
      communityName: membership.communityName,
      carrierName: String(policy.carrierName),
      policyNumber: typeof policy.policyNumber === 'string' ? policy.policyNumber : null,
      unitLabel: body.unitLabel,
      requesterName,
      requesterEmail,
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
      loanNumber: body.loanNumber ?? null,
    });

    let status: 'sent' | 'failed' = 'sent';
    try {
      // Relay to the agent — Reply-To the owner so the agent responds directly.
      await sendEmail({
        to: agentEmail,
        replyTo: requesterEmail || undefined,
        subject: email.agentSubject,
        react: createElement(CertificateRequestEmail, { body: email.agentBody }),
        category: 'transactional',
      });
      // Confirmation to the requesting owner.
      if (requesterEmail) {
        await sendEmail({
          to: requesterEmail,
          subject: email.confirmationSubject,
          react: createElement(CertificateRequestEmail, { body: email.confirmationBody }),
          category: 'transactional',
        });
      }
    } catch {
      status = 'failed';
    }

    const created = await createCertificateRequest(scoped, {
      communityId,
      policyId: body.policyId,
      requestedBy: actorUserId,
      unitLabel: body.unitLabel,
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
      loanNumber: body.loanNumber ?? null,
      status,
    });

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'insurance_certificate_request',
      resourceId: String(created?.id ?? ''),
      communityId,
      newValues: { policyId: body.policyId, recipientEmail: body.recipientEmail, status },
    });

    if (status === 'failed') {
      throw new ValidationError('We couldn’t send the request right now. Please try again.');
    }

    return { status, id: created?.id };
  }),
);

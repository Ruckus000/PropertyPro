/**
 * Insurance policies API — master-policy summary CRUD (spec #3).
 *
 * Read is open to owners + admin-tier (tenants excluded by the `insurance`
 * RBAC cell per the 2026-07-17 legal review); writes are admin-tier.
 * `policyNumber` is stripped for non-admin readers (mildly sensitive; owners
 * don't need it). Insurance hub is condo/HOA-only via hasInsuranceHub.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity, isAdminRole, type CommunityType } from '@propertypro/shared';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { classifyInsurancePolicyExpiry } from '@/lib/services/insurance-policy-expiry';
import {
  createInsurancePolicy,
  getInsuranceDocumentById,
  getInsurancePolicyById,
  listInsurancePolicies,
  softDeleteInsurancePolicyById,
  updateInsurancePolicyById,
} from '@/lib/services/insurance-service';
import {
  insurancePoliciesCreateContract,
  insurancePoliciesDeleteContract,
  insurancePoliciesListContract,
  insurancePoliciesUpdateContract,
} from '../contract';

function requireInsuranceHubCommunity(communityType: CommunityType): void {
  if (!getFeaturesForCommunity(communityType).hasInsuranceHub) {
    throw new ForbiddenError('The insurance hub is only available for condo and HOA communities');
  }
}

/** Attach the computed expiry band; strip policyNumber for non-admin readers. */
function presentPolicy(row: Record<string, unknown>, isAdmin: boolean): Record<string, unknown> {
  const { band, daysUntilExpiry } = classifyInsurancePolicyExpiry(String(row.expiresAt));
  const presented: Record<string, unknown> = { ...row, expiryBand: band, daysUntilExpiry };
  if (!isAdmin) delete presented.policyNumber;
  return presented;
}

async function requireOwnedDocument(
  scoped: ReturnType<typeof createScopedClient>,
  documentId: number,
): Promise<void> {
  if (!(await getInsuranceDocumentById(scoped, documentId))) {
    throw new NotFoundError('Document not found in this community');
  }
}

export const GET = withErrorHandler(
  runRoute(insurancePoliciesListContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const scoped = createScopedClient(communityId);
    const policies = await listInsurancePolicies(scoped);
    const isAdmin = isAdminRole(membership.role);

    return { policies: policies.map((p) => presentPolicy(p, isAdmin)) };
  }),
);

export const POST = withErrorHandler(
  runRoute(insurancePoliciesCreateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    if (body.documentId != null) await requireOwnedDocument(scoped, body.documentId);

    const created = await createInsurancePolicy(scoped, {
      communityId,
      policyType: body.policyType,
      carrierName: body.carrierName,
      policyNumber: body.policyNumber ?? null,
      coverageSummary: body.coverageSummary ?? null,
      deductibleSummary: body.deductibleSummary ?? null,
      effectiveAt: body.effectiveAt ?? null,
      expiresAt: body.expiresAt,
      agentName: body.agentName ?? null,
      agentEmail: body.agentEmail ?? null,
      agentPhone: body.agentPhone ?? null,
      documentId: body.documentId ?? null,
      createdBy: actorUserId,
    });
    if (!created) throw new ValidationError('Failed to create insurance policy');

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'insurance_policy',
      resourceId: String(created.id),
      communityId,
      newValues: created,
    });

    return presentPolicy(created, true);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(insurancePoliciesUpdateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const { id, communityId: _ignored, ...updates } = body;
    const scoped = createScopedClient(communityId);
    const existing = await getInsurancePolicyById(scoped, id);
    if (!existing) throw new NotFoundError('Insurance policy not found');

    if (updates.documentId != null) await requireOwnedDocument(scoped, updates.documentId);

    // A changed expiry restarts the renewal-alert ladder.
    const expiryChanged = updates.expiresAt !== undefined && updates.expiresAt !== existing.expiresAt;
    const updated = await updateInsurancePolicyById(scoped, id, {
      ...updates,
      ...(expiryChanged ? { lastAlertBand: null } : {}),
    });
    if (!updated) throw new NotFoundError('Insurance policy not found');

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'insurance_policy',
      resourceId: String(id),
      communityId,
      oldValues: existing,
      newValues: updated,
    });

    return presentPolicy(updated, true);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(insurancePoliciesDeleteContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    const existing = await getInsurancePolicyById(scoped, query.id);
    if (!existing) throw new NotFoundError('Insurance policy not found');

    await softDeleteInsurancePolicyById(scoped, query.id);
    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'insurance_policy',
      resourceId: String(query.id),
      communityId,
      oldValues: existing,
    });

    return { deleted: true as const, id: query.id };
  }),
);

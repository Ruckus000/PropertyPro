/**
 * Wind-mitigation locker API — CRUD for building-level wind-mitigation
 * inspection records (Wave 1 insurance hub).
 *
 * The board posts the building's inspection report once; every owner reads it
 * and hands it to their own HO-6/wind insurer for mitigation credits
 * (§627.0629). Hence the asymmetry enforced here: `insurance:read` is open to
 * every community role, `insurance:write` is admin-tier.
 *
 * Patterns (see ./contract.ts for the full auth-chain rationale):
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - logAuditEvent on every mutation
 * - Insurance hub is condo/HOA-only via hasInsuranceHub (AGENTS #34)
 * - `runRoute` imported from `@/lib/api/run-route` (tenantScope is declared)
 *
 * NOTE ON DISCLAIMERS: this route returns factual record data only. Any
 * savings/discount language belongs to the UI layer and must come from the
 * attorney-reviewed constants in `@/lib/constants/insurance-disclaimers`.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { classifyWindMitigationExpiry } from '@/lib/services/wind-mitigation-expiry';
import {
  createWindMitigationReportForCommunity,
  getWindMitigationDocumentById,
  getWindMitigationReportById,
  listWindMitigationReportsForCommunity,
  softDeleteWindMitigationReportById,
  updateWindMitigationReportById,
} from '@/lib/services/wind-mitigation-service';
import {
  windMitigationCreateContract,
  windMitigationDeleteContract,
  windMitigationListContract,
  windMitigationUpdateContract,
} from './contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apartments have no owner-occupied units and no association master policy to
 * share, so the insurance hub is condo/HOA-only. Gate on the feature flag, not
 * a community-type comparison (AGENTS #34).
 */
function requireInsuranceHubCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasInsuranceHub) {
    throw new ForbiddenError(
      'The insurance hub is only available for condo and HOA communities',
    );
  }
}

/**
 * A report's validity window must be coherent, or the expiry banding and the
 * board's re-inspection alerts are meaningless. Deliberately NOT enforcing a
 * 5-year span: the exact validity period is the insurer's call, and boards
 * occasionally record a shorter window on purpose.
 */
function validateInspectionWindow(inspectedAt: string, expiresAt: string): void {
  if (expiresAt <= inspectedAt) {
    // ISO YYYY-MM-DD strings compare lexicographically — no Date needed.
    throw new ValidationError('expiresAt must be after inspectedAt');
  }
}

/**
 * Confirm the referenced document exists in THIS community. The scoped client
 * makes a cross-tenant reference unrepresentable (the row simply won't be
 * found), so this doubles as the cross-tenant guard.
 */
async function requireOwnedDocument(
  scoped: ReturnType<typeof createScopedClient>,
  documentId: number,
): Promise<void> {
  const document = await getWindMitigationDocumentById(scoped, documentId);
  if (!document) {
    throw new NotFoundError('Document not found in this community');
  }
}

/** Attach the computed expiry band so UI and emails never re-derive it. */
function withExpiryStatus(row: Record<string, unknown>): Record<string, unknown> {
  const expiresAt = String(row.expiresAt);
  const { band, daysUntilExpiry } = classifyWindMitigationExpiry(expiresAt);
  return { ...row, expiryBand: band, daysUntilExpiry };
}

// ---------------------------------------------------------------------------
// GET — list reports (every community role)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(
  runRoute(windMitigationListContract, async ({ communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'read');

    const scoped = createScopedClient(communityId);
    const reports = await listWindMitigationReportsForCommunity(scoped);

    return { reports: reports.map(withExpiryStatus) };
  }),
);

// ---------------------------------------------------------------------------
// POST — create a report (admin-tier)
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(windMitigationCreateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    validateInspectionWindow(body.inspectedAt, body.expiresAt);

    const scoped = createScopedClient(communityId);
    await requireOwnedDocument(scoped, body.documentId);

    const created = await createWindMitigationReportForCommunity(scoped, {
      communityId,
      documentId: body.documentId,
      formType: body.formType,
      formVersion: body.formVersion ?? 'pre_2026',
      buildingLabel: body.buildingLabel ?? null,
      inspectedAt: body.inspectedAt,
      expiresAt: body.expiresAt,
      inspectorName: body.inspectorName ?? null,
      inspectorLicense: body.inspectorLicense ?? null,
      notes: body.notes ?? null,
      createdBy: actorUserId,
    });

    if (!created) {
      throw new ValidationError('Failed to create wind-mitigation report');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'wind_mitigation_report',
      resourceId: String(created.id),
      communityId,
      newValues: created,
    });

    return withExpiryStatus(created);
  }),
);

// ---------------------------------------------------------------------------
// PATCH — update a report (admin-tier)
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(
  runRoute(windMitigationUpdateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const { id, communityId: _ignored, ...updates } = body;

    const scoped = createScopedClient(communityId);
    const existing = await getWindMitigationReportById(scoped, id);
    if (!existing) {
      throw new NotFoundError('Wind-mitigation report not found');
    }

    // Validate the resulting window, not just the supplied fields — a PATCH
    // that moves only one endpoint can still invert the window.
    validateInspectionWindow(
      updates.inspectedAt ?? String(existing.inspectedAt),
      updates.expiresAt ?? String(existing.expiresAt),
    );

    if (updates.documentId !== undefined) {
      await requireOwnedDocument(scoped, updates.documentId);
    }

    // A changed validity window restarts the alert ladder: a board that
    // re-inspects must be able to receive the 180/30-day alerts again.
    const datesChanged =
      (updates.expiresAt !== undefined && updates.expiresAt !== existing.expiresAt) ||
      (updates.inspectedAt !== undefined && updates.inspectedAt !== existing.inspectedAt);

    const updated = await updateWindMitigationReportById(scoped, id, {
      ...updates,
      ...(datesChanged ? { lastAlertBand: null } : {}),
    });

    if (!updated) {
      throw new NotFoundError('Wind-mitigation report not found');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'wind_mitigation_report',
      resourceId: String(id),
      communityId,
      oldValues: existing,
      newValues: updated,
    });

    return withExpiryStatus(updated);
  }),
);

// ---------------------------------------------------------------------------
// DELETE — supersede a report (admin-tier, soft delete)
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  runRoute(windMitigationDeleteContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireInsuranceHubCommunity(membership.communityType);
    requirePermission(membership, 'insurance', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    const existing = await getWindMitigationReportById(scoped, query.id);
    if (!existing) {
      throw new NotFoundError('Wind-mitigation report not found');
    }

    await softDeleteWindMitigationReportById(scoped, query.id);

    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'wind_mitigation_report',
      resourceId: String(query.id),
      communityId,
      oldValues: existing,
    });

    return { deleted: true as const, id: query.id };
  }),
);

/**
 * Reserve-transparency register API — CRUD for the association's major
 * physical-asset register (Wave 1 differentiation, ships DARK behind
 * hasReserveTransparency).
 *
 * The board registers each major component (roof, elevator, pool, …); every
 * member reads the transparent register with a remaining-useful-life countdown.
 * Hence the asymmetry enforced here: `reserve_assets:read` is open to every
 * community member, `reserve_assets:write` is admin-tier.
 *
 * Patterns (see ./contract.ts for the full auth-chain rationale):
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - GET lists via the canonical `paginate()` keyset helper (ADR-003)
 * - logAuditEvent on every mutation
 * - Reserve transparency is condo/HOA-only via hasReserveTransparency
 * - `runRoute` imported from `@/lib/api/run-route` (tenantScope is declared)
 *
 * COMPLIANCE POSTURE: this route returns factual record data only. The RUL band
 * is a neutral time-remaining bucket computed from the entered install year +
 * useful life — never an adequacy assessment. All framing copy lives in the
 * attorney-reviewed constants in `@/lib/constants/reserve-disclaimers`.
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
import { classifyReserveAssetRul } from '@/lib/services/reserve-asset-rul';
import {
  createReserveAssetForCommunity,
  getReserveAssetById,
  paginateReserveAssetsForCommunity,
  softDeleteReserveAssetById,
  updateReserveAssetById,
} from '@/lib/services/reserve-asset-service';
import {
  reserveAssetCreateContract,
  reserveAssetDeleteContract,
  reserveAssetUpdateContract,
  reserveAssetsListContract,
} from './contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reserve transparency is a condo/HOA statutory-reserve concept (HB 913 /
 * SIRS); apartments have no owner reserves to disclose. Gate on the feature
 * flag, not a community-type comparison (AGENTS #34).
 */
function requireReserveTransparencyCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasReserveTransparency) {
    throw new ForbiddenError(
      'The reserve-transparency register is only available for condo and HOA communities',
    );
  }
}

/**
 * A useful-life window must be coherent, or the remaining-useful-life countdown
 * is meaningless. The install year cannot be in the (implausible) far future.
 */
function validateAssetTiming(yearInstalled: number, referenceYear: number): void {
  if (yearInstalled > referenceYear + 1) {
    // Allow "next year" for a component being installed imminently; reject a
    // typo'd install year decades out that would render an absurd countdown.
    throw new ValidationError('yearInstalled cannot be in the far future');
  }
}

/**
 * Attach the computed remaining-useful-life so UI never re-derives it. Pure
 * arithmetic over the entered fields — not a condition or adequacy assessment.
 */
function withRul(row: Record<string, unknown>): Record<string, unknown> {
  const yearInstalled = Number(row.yearInstalled);
  const usefulLifeYears = Number(row.usefulLifeYears);
  const { band, yearsRemaining, endOfLifeYear } = classifyReserveAssetRul(
    yearInstalled,
    usefulLifeYears,
  );
  return { ...row, rulBand: band, yearsRemaining, endOfLifeYear };
}

// ---------------------------------------------------------------------------
// GET — list assets (every community member, paginated)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(
  runRoute(reserveAssetsListContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireReserveTransparencyCommunity(membership.communityType);
    requirePermission(membership, 'reserve_assets', 'read');

    const scoped = createScopedClient(communityId);
    const result = await paginateReserveAssetsForCommunity(scoped, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    return {
      data: result.data.map(withRul),
      pagination: result.pagination,
    };
  }),
);

// ---------------------------------------------------------------------------
// POST — create an asset (admin-tier)
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(reserveAssetCreateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireReserveTransparencyCommunity(membership.communityType);
    requirePermission(membership, 'reserve_assets', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    validateAssetTiming(body.yearInstalled, new Date().getUTCFullYear());

    const scoped = createScopedClient(communityId);
    const created = await createReserveAssetForCommunity(scoped, {
      communityId,
      name: body.name,
      category: body.category,
      yearInstalled: body.yearInstalled,
      usefulLifeYears: body.usefulLifeYears,
      replacementCostCents: body.replacementCostCents ?? null,
      currentReserveCents: body.currentReserveCents ?? null,
      notes: body.notes ?? null,
    });

    if (!created) {
      throw new ValidationError('Failed to create reserve asset');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'reserve_asset',
      resourceId: String(created.id),
      communityId,
      newValues: created,
    });

    return withRul(created);
  }),
);

// ---------------------------------------------------------------------------
// PATCH — update an asset (admin-tier)
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(
  runRoute(reserveAssetUpdateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireReserveTransparencyCommunity(membership.communityType);
    requirePermission(membership, 'reserve_assets', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const { id, communityId: _ignored, ...updates } = body;

    const scoped = createScopedClient(communityId);
    const existing = await getReserveAssetById(scoped, id);
    if (!existing) {
      throw new NotFoundError('Reserve asset not found');
    }

    if (updates.yearInstalled !== undefined) {
      validateAssetTiming(updates.yearInstalled, new Date().getUTCFullYear());
    }

    const updated = await updateReserveAssetById(scoped, id, updates);
    if (!updated) {
      throw new NotFoundError('Reserve asset not found');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'reserve_asset',
      resourceId: String(id),
      communityId,
      oldValues: existing,
      newValues: updated,
    });

    return withRul(updated);
  }),
);

// ---------------------------------------------------------------------------
// DELETE — remove an asset (admin-tier, soft delete)
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  runRoute(reserveAssetDeleteContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireReserveTransparencyCommunity(membership.communityType);
    requirePermission(membership, 'reserve_assets', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    const existing = await getReserveAssetById(scoped, query.id);
    if (!existing) {
      throw new NotFoundError('Reserve asset not found');
    }

    await softDeleteReserveAssetById(scoped, query.id);

    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'reserve_asset',
      resourceId: String(query.id),
      communityId,
      oldValues: existing,
    });

    return { deleted: true as const, id: query.id };
  }),
);

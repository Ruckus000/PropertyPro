/**
 * Storm-damage intake API — post-storm damage records for the association
 * (Wave 1 differentiation).
 *
 * Any resident files a report about damage they observed; the board and
 * management see every report and move it through a status. RLS scopes a
 * resident's reads/edits to their own rows and lets admin-tier see all.
 *
 * ⚠️ This RECORDS damage for the association. It is NOT an insurance claim and
 * PropertyPro is not a public adjuster (§626.854). Any claim/coverage language
 * belongs to the UI layer and must come from the attorney-reviewed constants in
 * `@/lib/constants/storm-disclaimers`.
 *
 * Patterns (see ./contract.ts for the full auth-chain rationale):
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - logAuditEvent on every mutation
 * - Storm tools gated via hasStormTools (AGENTS #34)
 * - `runRoute` imported from `@/lib/api/run-route` (tenantScope is declared)
 * - list paginates via paginate() (ADR-003)
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
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import {
  createStormDamageReport,
  getStormDamageDocumentById,
  getStormDamageReportById,
  paginateStormDamageReports,
  updateStormDamageReportById,
} from '@/lib/services/storm-damage-service';
import {
  stormDamageCreateContract,
  stormDamageListContract,
  stormDamageUpdateContract,
} from './contract';

// Reports are user-generated content filed on demand; cap per user to blunt
// accidental double-submits and abuse. A storm may legitimately produce several
// reports from one resident, so the window is generous.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Storm tools are available to every community type but ship dark behind the
 * per-community feature flag. Gate on the flag, not a community-type comparison
 * (AGENTS #34).
 */
function requireStormToolsCommunity(communityType: CommunityType): void {
  if (!getFeaturesForCommunity(communityType).hasStormTools) {
    throw new ForbiddenError('Storm tools are not enabled for this community');
  }
}

/**
 * Confirm every referenced photo document exists in THIS community. The scoped
 * client makes a cross-tenant reference unrepresentable (the row won't be
 * found), so this doubles as the cross-tenant guard.
 */
async function requireOwnedDocuments(
  scoped: ReturnType<typeof createScopedClient>,
  documentIds: number[],
): Promise<void> {
  for (const id of documentIds) {
    const doc = await getStormDamageDocumentById(scoped, id);
    if (!doc) {
      throw new ValidationError(`Photo document ${id} not found in this community`);
    }
  }
}

// ---------------------------------------------------------------------------
// GET — list reports (residents see own via RLS, admin-tier sees all)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(
  runRoute(stormDamageListContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireStormToolsCommunity(membership.communityType);
    requirePermission(membership, 'storm_damage', 'read');

    const scoped = createScopedClient(communityId);
    const result = await paginateStormDamageReports(scoped, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    // Canonical double-wrap: handler wraps paginate's output in the outer
    // { data: ... } envelope; requestJson unwraps the outer .data.
    return { data: result.data, pagination: result.pagination };
  }),
);

// ---------------------------------------------------------------------------
// POST — file a report (any resident; RLS scopes ownership)
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(stormDamageCreateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireStormToolsCommunity(membership.communityType);
    requirePermission(membership, 'storm_damage', 'write');

    const rate = getRateLimiter().check(
      `storm-damage:${actorUserId}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rate.allowed) {
      throw new ValidationError(
        `You've filed too many reports in a short time. Try again in ${rate.retryAfter}s.`,
      );
    }

    const scoped = createScopedClient(communityId);

    const photoDocumentIds = body.photoDocumentIds ?? [];
    if (photoDocumentIds.length > 0) {
      await requireOwnedDocuments(scoped, photoDocumentIds);
    }

    const created = await createStormDamageReport(scoped, {
      communityId,
      unitId: body.unitId ?? null,
      reportedBy: actorUserId,
      occurredAt: body.occurredAt ?? null,
      locationLabel: body.locationLabel,
      category: body.category,
      severity: body.severity,
      description: body.description,
      photoDocumentIds,
      status: 'submitted',
    });

    if (!created) {
      throw new ValidationError('Failed to file storm-damage report');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'storm_damage_report',
      resourceId: String(created.id),
      communityId,
      newValues: {
        category: body.category,
        severity: body.severity,
        locationLabel: body.locationLabel,
      },
    });

    return created;
  }),
);

// ---------------------------------------------------------------------------
// PATCH — update status (admin-tier only)
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(
  runRoute(stormDamageUpdateContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireStormToolsCommunity(membership.communityType);
    requirePermission(membership, 'storm_damage', 'write');

    // Two-tier model: any resident may WRITE (file) a report, but only
    // admin-tier may move a report through the workflow. `isAdmin` is the
    // management tier (property_manager / root_manager). Board members are
    // residents with a designation (ADR-006) and are intentionally NOT status
    // editors in this MVP.
    if (!membership.isAdmin) {
      throw new ForbiddenError('Only management can update a report status');
    }

    const scoped = createScopedClient(communityId);
    const existing = await getStormDamageReportById(scoped, body.id);
    if (!existing) {
      throw new NotFoundError('Storm-damage report not found');
    }

    const updated = await updateStormDamageReportById(scoped, body.id, { status: body.status });
    if (!updated) {
      throw new NotFoundError('Storm-damage report not found');
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'storm_damage_report',
      resourceId: String(body.id),
      communityId,
      oldValues: { status: existing.status },
      newValues: { status: body.status },
    });

    return updated;
  }),
);

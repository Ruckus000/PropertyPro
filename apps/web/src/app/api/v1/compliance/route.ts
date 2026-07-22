/**
 * Compliance Checklist API — condo/HOA only.
 *
 * GET   /api/v1/compliance?communityId=N — list checklist items + derived status
 * POST  /api/v1/compliance                — generate checklist from template
 * PATCH /api/v1/compliance                — apply a per-item action
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the three schemas and rationale. Auth chains preserved
 * verbatim — note the mutating methods (POST/PATCH) run `assertNotDemoGrace`
 * BEFORE `requireCommunityMembership`, and the sync feature-gate
 * `requireCondoCommunity` + sync `requirePermission` run AFTER membership.
 *
 * Wire shapes are byte-identical to pre-migration (the handler returns the
 * inner payload; the runner wraps `{ data: <payload> }`):
 *   - GET   → `{ data: [...] }`
 *   - POST  → `{ data: inserted }` (success) OR
 *             `{ data: { data, meta } }` (already-generated / race / empty)
 *   - PATCH → `{ data: result }`
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import {
  getComplianceTemplate,
  getFeaturesForCommunity,
  type CommunityType,
} from '@propertypro/shared';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
} from '@/lib/utils/compliance-calculator';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { assertDocumentInCommunity } from '@/lib/services/scoped-fk-validators';
import { getDocumentDeletedAtByIds } from '@/lib/services/documents-service';
import {
  insertComplianceChecklistItems,
  listComplianceChecklistItems,
  updateComplianceChecklistItem,
} from '@/lib/services/compliance-service';
import {
  complianceGetContract,
  complianceGenerateContract,
  compliancePatchContract,
} from './contract';

/**
 * Feature gate: Require condo/HOA community for compliance features
 */
function requireCondoCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasCompliance) {
    throw new ForbiddenError('Compliance features are only available for condo/HOA communities');
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === '23505';
}

/**
 * Decorate a checklist row with its derived compliance status.
 *
 * `documentDeletedAtById` maps a linked document id to its `deleted_at` (or
 * null when live). A soft-deleted linked document must not keep the item
 * satisfied, so the deletion timestamp is threaded into the calculator.
 */
function withDerivedStatus(
  row: Record<string, unknown>,
  documentDeletedAtById: Map<number, Date | null> = new Map(),
): Record<string, unknown> {
  const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
  const documentPostedAt = row['documentPostedAt']
    ? new Date(row['documentPostedAt'] as string)
    : null;

  const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
  const rollingWindowMonths =
    typeof rollingWindowRecord?.months === 'number' ? rollingWindowRecord.months : null;

  const documentId = (row['documentId'] as number | null) ?? null;
  const documentDeletedAt =
    documentId != null ? documentDeletedAtById.get(documentId) ?? null : null;

  return {
    ...row,
    status: calculateComplianceStatus({
      isApplicable: row['isApplicable'] as boolean | undefined,
      documentId,
      documentPostedAt,
      documentDeletedAt,
      deadline,
      rollingWindowMonths,
    }),
  };
}

export const GET = withErrorHandler(
  runRoute(complianceGetContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requireCondoCommunity(membership.communityType);
    requirePermission(membership, 'compliance', 'read');

    const rows = await listComplianceChecklistItems(communityId);

    // Resolve `documents.deleted_at` for the linked documents so a
    // soft-deleted document does not silently keep its checklist item
    // satisfied. Targeted inArray lookup over just the linked ids — this is
    // a hot route, so it must never become a full-table read.
    const linkedDocumentIds = [
      ...new Set(
        rows
          .map((r) => r['documentId'] as number | null)
          .filter((v): v is number => typeof v === 'number'),
      ),
    ];
    const documentDeletedAtById = await getDocumentDeletedAtByIds(
      communityId,
      linkedDocumentIds,
    );

    const data = rows.map((row) => withDerivedStatus(row, documentDeletedAtById));

    if (data.length > 0) {
      void tryAutoComplete(communityId, userId, 'review_compliance');
      // B2: board members' checklist carries `check_compliance` (distinct from the
      // admin `review_compliance`). Firing it here lets board roles reach 100%.
      void tryAutoComplete(communityId, userId, 'check_compliance');
    }

    return data;
  }),
);

export const POST = withErrorHandler(
  runRoute(complianceGenerateContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);

    // Feature gate: compliance is only available for condo/HOA communities
    requireCondoCommunity(membership.communityType);
    requirePermission(membership, 'compliance', 'write');

    const existing = await listComplianceChecklistItems(communityId);
    if (existing.length > 0) {
      return { data: existing, meta: { alreadyGenerated: true } };
    }

    const template = getComplianceTemplate(membership.communityType);
    if (template.length === 0) {
      console.warn(
        `[compliance] Empty template for community type "${membership.communityType}" despite hasCompliance=true. Skipping checklist generation.`,
      );
      return { data: [], meta: { emptyTemplate: true } };
    }

    const now = new Date();
    const rows = template.map((item) => ({
      templateKey: item.templateKey,
      title: item.title,
      description: item.description,
      category: item.category,
      statuteReference: item.statuteReference,
      deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
      rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
      isConditional: item.isConditional ?? false,
      documentId: null,
      documentPostedAt: null,
      lastModifiedBy: userId,
    }));

    try {
      await insertComplianceChecklistItems(communityId, rows);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const raced = await listComplianceChecklistItems(communityId);
      return { data: raced, meta: { alreadyGenerated: true } };
    }

    const inserted = await listComplianceChecklistItems(communityId);
    if (inserted.length < template.length) {
      console.warn(
        `[compliance] Expected ${template.length} checklist items for community ${communityId}, `
        + `but found ${inserted.length}. Possible data inconsistency.`,
      );
    }

    await logAuditEvent({
      userId,
      action: 'create',
      resourceType: 'compliance_checklist',
      resourceId: String(communityId),
      communityId,
      newValues: {
        communityType: membership.communityType,
        itemCount: inserted.length,
        templateKeys: template.map((item) => item.templateKey),
      },
    });

    return inserted;
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/compliance — link/unlink documents, mark applicable/not-applicable
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(
  runRoute(compliancePatchContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();

    const { id, action: patchAction, documentId } = body;
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requireCondoCommunity(membership.communityType);
    requirePermission(membership, 'compliance', 'write');

    // Reject a foreign-tenant document reference before any write happens.
    if (patchAction === 'link_document') {
      await assertDocumentInCommunity(createScopedClient(communityId), documentId);
    }

    // Build the update payload based on the action
    let updateData: Record<string, unknown>;
    switch (patchAction) {
      case 'link_document':
        updateData = {
          documentId: documentId!,
          documentPostedAt: new Date(),
          lastModifiedBy: userId,
        };
        break;
      case 'unlink_document':
        updateData = {
          documentId: null,
          documentPostedAt: null,
          lastModifiedBy: userId,
        };
        break;
      case 'mark_not_applicable':
        updateData = {
          isApplicable: false,
          lastModifiedBy: userId,
        };
        break;
      case 'mark_applicable':
        updateData = {
          isApplicable: true,
          lastModifiedBy: userId,
        };
        break;
    }

    const row = await updateComplianceChecklistItem(communityId, id, updateData);
    if (!row) {
      throw new ValidationError('Checklist item not found or does not belong to this community');
    }

    const result = withDerivedStatus(row);

    await logAuditEvent({
      userId,
      action: patchAction,
      resourceType: 'compliance_checklist_item',
      resourceId: String(id),
      communityId,
      metadata: { itemTitle: row['title'] as string },
      newValues: { documentId: documentId ?? null },
    });

    return result;
  }),
);

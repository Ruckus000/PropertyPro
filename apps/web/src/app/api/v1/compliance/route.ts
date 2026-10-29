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
 *
 * PATCH `link_document` answers 409 when the document already fills another
 * record, or when the record already has a different file and the body does not
 * say `replace: true` (only the Compliance page's re-link flow does).
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import {
  getComplianceTemplate,
  getFeaturesForCommunity,
  type CommunityType,
} from '@propertypro/shared';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { calculatePostingDeadline } from '@/lib/utils/compliance-calculator';
import { loadChecklistWithStatus, withDerivedStatus } from '@/lib/compliance/load-checklist-with-status';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { assertDocumentInCommunity } from '@/lib/services/scoped-fk-validators';
import {
  findChecklistLinkConflict,
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

export const GET = withErrorHandler(
  runRoute(complianceGetContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requireCondoCommunity(membership.communityType);
    requirePermission(membership, 'compliance', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const data = await loadChecklistWithStatus(communityId, membership.communityType);

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
      if (!isNamedUniqueViolation(error, 'compliance_checklist_community_template_key_active')) {
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

    const { id, action: patchAction, documentId, reason, replace } = body;
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requireCondoCommunity(membership.communityType);
    requirePermission(membership, 'compliance', 'write');

    // Reject a foreign-tenant document reference before any write happens.
    if (patchAction === 'link_document') {
      await assertDocumentInCommunity(createScopedClient(communityId), documentId);
      // One file fills one record, and a record's file is replaced only on
      // purpose (`replace`, sent by the Compliance page's re-link flow).
      const conflict = await findChecklistLinkConflict(communityId, id, documentId!, { replace: replace === true });
      if (conflict === 'document_fills_another_record') {
        throw new ConflictError('This file is already posted as another record.');
      }
      if (conflict === 'record_has_another_document') {
        throw new ConflictError('This record already has a file. Remove it first to replace it.');
      }
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
          // The contract's refinement guarantees a reason for this action.
          notApplicableReason: reason!,
          lastModifiedBy: userId,
        };
        break;
      case 'mark_applicable':
        updateData = {
          isApplicable: true,
          notApplicableReason: null,
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
      // "Doesn't apply" is audited with its reason and nothing else.
      newValues:
        patchAction === 'mark_not_applicable' ? { reason } : { documentId: documentId ?? null },
    });

    return result;
  }),
);

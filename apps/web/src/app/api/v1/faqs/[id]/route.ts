/**
 * FAQ Detail API
 *
 * PATCH   /api/v1/faqs/[id]  — update a FAQ (admin only)
 * DELETE  /api/v1/faqs/[id]  — soft-delete a FAQ (admin only)
 *
 * Plan A1 drain #112 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 *
 * Invariants:
 * - Tenant isolation via faq-service (createScopedClient inside)
 * - Admin-only mutations
 * - Audit log on all changes (route concern)
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { softDeleteFaq, updateFaq } from '@/lib/services/faq-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { faqsDeleteContract, faqsUpdateContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(faqsUpdateContract, async ({ params, body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can update FAQs');
    }

    const updated = await updateFaq(communityId, params.id, {
      question: body.question,
      answer: body.answer,
    });
    if (!updated) {
      throw new NotFoundError('FAQ not found');
    }

    await logAuditEvent({
      userId,
      action: 'faq.updated',
      resourceType: 'faq',
      resourceId: String(params.id),
      communityId,
      newValues: updated.updateData,
    });

    return updated.row;
  }),
);

export const DELETE = withErrorHandler(
  runRoute(faqsDeleteContract, async ({ params, query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can delete FAQs');
    }

    const ok = await softDeleteFaq(communityId, params.id);
    if (!ok) {
      throw new NotFoundError('FAQ not found');
    }

    await logAuditEvent({
      userId,
      action: 'faq.deleted',
      resourceType: 'faq',
      resourceId: String(params.id),
      communityId,
    });

    return { id: params.id };
  }),
);

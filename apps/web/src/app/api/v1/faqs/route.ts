/**
 * FAQs API
 *
 * GET   /api/v1/faqs?communityId=N  — paginated visible FAQs for a community
 * POST  /api/v1/faqs                — create a new FAQ (admin only)
 *
 * Plan A1 drain #104 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 *
 * Invariants:
 * - Tenant isolation via faq-service (createScopedClient inside)
 * - Lazy-seeds default FAQs on first GET via ensureFaqsExist
 * - Audit log on POST mutations (route concern, not service concern)
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  createFaq,
  ensureFaqsExist,
  listVisibleFaqsPage,
} from '@/lib/services/faq-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
import { faqsCreateContract, faqsListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(faqsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    await ensureFaqsExist(communityId);

    const viewerRole = resolveHelpViewerRoleFromMembership(membership);
    const result = await listVisibleFaqsPage(communityId, viewerRole, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(faqsCreateContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can create FAQs');
    }

    const { row, sortOrder } = await createFaq(communityId, {
      question: body.question,
      answer: body.answer,
    });

    await logAuditEvent({
      userId,
      action: 'faq.created',
      resourceType: 'faq',
      resourceId: String((row as Record<string, unknown>)?.['id'] ?? 'unknown'),
      communityId,
      newValues: { question: body.question, answer: body.answer, sortOrder },
    });

    return row;
  }),
);

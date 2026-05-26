/**
 * FAQ Reorder API
 *
 * PATCH /api/v1/faqs/reorder — reorder all FAQs for a community (admin only)
 *
 * Plan A1 drain #73. Input validation, output validation, and canonical
 * envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`; the contract lives in `./contract.ts`.
 *
 * Wire-level response shape is unchanged — the runner produces
 * `{ data: { ids } }`, exactly as the pre-migration handler did via
 * `NextResponse.json({ data: { ids } })`.
 *
 * Authorization invariants (preserved verbatim, error messages
 * byte-identical):
 *   - `resolveEffectiveCommunityId(req, body.communityId)` reconciles
 *     `x-community-id` header with body
 *   - `assertNotDemoGrace(communityId)` blocks demo-grace tenants
 *   - `requireAuthenticatedUserId` resolves the session user
 *   - `requireCommunityMembership` enforces tenant membership
 *   - `if (!membership.isAdmin)` → `ForbiddenError('Only admins can
 *     reorder FAQs')`
 *
 * Business validations (preserved verbatim):
 *   - duplicate ids → `ValidationError('Duplicate FAQ IDs in reorder list')`
 *   - missing id (via `reorderFaqs` callback) → `ValidationError(\`FAQ with
 *     id ${id} not found or not active in this community\`)`
 *
 * Audit log call ordering preserved: `logAuditEvent` runs AFTER
 * `reorderFaqs` resolves.
 *
 * Behavior changes vs. pre-migration:
 *   - 400 body shape becomes the runner's canonical `VALIDATION_ERROR`
 *     envelope with per-field details (was a hand-constructed
 *     `ValidationError('Invalid reorder payload')`). Status unchanged.
 *   - Auth ordering: under the runner, body Zod validation runs before
 *     any handler code (so `resolveEffectiveCommunityId`/grace/membership
 *     gates fire AFTER body parse). Pre-migration also did `safeParse`
 *     first, so behavior is equivalent.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { reorderFaqs } from '@/lib/services/faq-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { faqsReorderContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(faqsReorderContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can reorder FAQs');
    }

    // Validate no duplicate IDs
    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      throw new ValidationError('Duplicate FAQ IDs in reorder list');
    }

    await reorderFaqs(communityId, body.ids, (id) => {
      throw new ValidationError(`FAQ with id ${id} not found or not active in this community`);
    });

    await logAuditEvent({
      userId,
      action: 'faq.reordered',
      resourceType: 'faq',
      resourceId: 'bulk',
      communityId,
      newValues: { ids: body.ids },
    });

    return { ids: body.ids };
  }),
);

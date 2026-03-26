/**
 * FAQ Reorder API
 *
 * PATCH  /api/v1/faqs/reorder  — reorder all FAQs for a community (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin-only
 * - Validates all IDs exist and belong to the community
 * - Audit log on reorder
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, faqs, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const reorderSchema = z.object({
  communityId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = reorderSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid reorder payload');
  }

  const { ids } = result.data;
  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  await assertNotDemoGrace(communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can reorder FAQs');
  }

  // Validate no duplicate IDs
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new ValidationError('Duplicate FAQ IDs in reorder list');
  }

  // Fetch all active FAQs for this community
  const scoped = createScopedClient(communityId);
  const activeFaqs = await scoped.query(faqs);
  const activeIds = new Set(activeFaqs.map((f) => f['id'] as number));

  // Validate all provided IDs exist in active FAQs
  for (const id of ids) {
    if (!activeIds.has(id)) {
      throw new ValidationError(`FAQ with id ${id} not found or not active in this community`);
    }
  }

  // Update sort_order for each FAQ
  for (let i = 0; i < ids.length; i++) {
    await scoped.update(
      faqs,
      { sortOrder: i, updatedAt: new Date() },
      eq(faqs.id, ids[i]!),
    );
  }

  await logAuditEvent({
    userId,
    action: 'faq.reordered',
    resourceType: 'faq',
    resourceId: 'bulk',
    communityId,
    newValues: { ids },
  });

  return NextResponse.json({ data: { ids } });
});

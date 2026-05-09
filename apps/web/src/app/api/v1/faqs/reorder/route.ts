/**
 * FAQ Reorder API
 *
 * PATCH  /api/v1/faqs/reorder  — reorder all FAQs for a community (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via the faq-service (createScopedClient inside)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin-only
 * - Validates all IDs exist and belong to the community
 * - Audit log on reorder (route concern)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { reorderFaqs } from '@/lib/services/faq-service';
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

  await reorderFaqs(communityId, ids, (id) => {
    throw new ValidationError(`FAQ with id ${id} not found or not active in this community`);
  });

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

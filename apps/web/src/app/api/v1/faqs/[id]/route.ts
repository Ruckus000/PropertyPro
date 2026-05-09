/**
 * FAQ Detail API
 *
 * PATCH   /api/v1/faqs/[id]  — update a FAQ (admin only)
 * DELETE  /api/v1/faqs/[id]  — soft-delete a FAQ (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via the faq-service (createScopedClient inside)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin-only mutations
 * - Audit log on all changes (route concern)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { softDeleteFaq, updateFaq } from '@/lib/services/faq-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const communityIdSchema = z.coerce.number().int().positive();

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(5000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, context?: RouteContext) => {
  const { id: rawId } = await context!.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id < 1) {
    throw new ValidationError('Invalid FAQ id');
  }

  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid FAQ update payload');
  }

  const { question, answer } = result.data;
  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  await assertNotDemoGrace(communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can update FAQs');
  }

  const updated = await updateFaq(communityId, id, { question, answer });
  if (!updated) {
    throw new NotFoundError('FAQ not found');
  }

  await logAuditEvent({
    userId,
    action: 'faq.updated',
    resourceType: 'faq',
    resourceId: String(id),
    communityId,
    newValues: updated.updateData,
  });

  return NextResponse.json({ data: updated.row });
});

export const DELETE = withErrorHandler(async (req: NextRequest, context?: RouteContext) => {
  const { id: rawId } = await context!.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id < 1) {
    throw new ValidationError('Invalid FAQ id');
  }

  const { searchParams } = new URL(req.url);
  const parsed = communityIdSchema.safeParse(searchParams.get('communityId'));
  if (!parsed.success) {
    throw new ValidationError('Invalid or missing communityId');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data);
  await assertNotDemoGrace(communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can delete FAQs');
  }

  const ok = await softDeleteFaq(communityId, id);
  if (!ok) {
    throw new NotFoundError('FAQ not found');
  }

  await logAuditEvent({
    userId,
    action: 'faq.deleted',
    resourceType: 'faq',
    resourceId: String(id),
    communityId,
  });

  return NextResponse.json({ data: { id } });
});

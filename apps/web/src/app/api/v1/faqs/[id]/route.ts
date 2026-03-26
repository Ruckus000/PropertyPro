/**
 * FAQ Detail API
 *
 * PATCH   /api/v1/faqs/[id]  — update a FAQ (admin only)
 * DELETE  /api/v1/faqs/[id]  — soft-delete a FAQ (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin-only mutations
 * - Audit log on all changes
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, faqs, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
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

  // Build update object from provided fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (question !== undefined) updateData['question'] = question;
  if (answer !== undefined) updateData['answer'] = answer;

  const scoped = createScopedClient(communityId);
  const updated = await scoped.update(faqs, updateData, eq(faqs.id, id));

  if (!updated.length) {
    throw new NotFoundError('FAQ not found');
  }

  await logAuditEvent({
    userId,
    action: 'faq.updated',
    resourceType: 'faq',
    resourceId: String(id),
    communityId,
    newValues: updateData,
  });

  return NextResponse.json({ data: updated[0] });
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

  const scoped = createScopedClient(communityId);
  const deleted = await scoped.update(faqs, { deletedAt: new Date() }, eq(faqs.id, id));

  if (!deleted.length) {
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

/**
 * FAQs API
 *
 * GET   /api/v1/faqs?communityId=N  — list all active FAQs for a community
 * POST  /api/v1/faqs                — create a new FAQ (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via the faq-service (createScopedClient inside)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Lazy-seeds default FAQs on first GET via ensureFaqsExist
 * - Audit log on mutations (route concern, not service concern)
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
import {
  createFaq,
  ensureFaqsExist,
  filterFaqsForRole,
  listFaqs,
} from '@/lib/services/faq-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const communityIdSchema = z.coerce.number().int().positive();

const postSchema = z.object({
  communityId: z.number().int().positive(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = communityIdSchema.safeParse(searchParams.get('communityId'));
  if (!parsed.success) {
    throw new ValidationError('Invalid or missing communityId');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  // Lazy-seed default FAQs if none exist
  await ensureFaqsExist(communityId);

  const rows = await listFaqs(communityId);
  const visibleFaqs = filterFaqsForRole(rows, membership.role);

  return NextResponse.json({ data: visibleFaqs });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = postSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid FAQ payload');
  }

  const { question, answer } = result.data;
  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  await assertNotDemoGrace(communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can create FAQs');
  }

  const { row, sortOrder } = await createFaq(communityId, { question, answer });

  await logAuditEvent({
    userId,
    action: 'faq.created',
    resourceType: 'faq',
    resourceId: String((row as Record<string, unknown>)?.['id'] ?? 'unknown'),
    communityId,
    newValues: { question, answer, sortOrder },
  });

  return NextResponse.json({ data: row }, { status: 201 });
});

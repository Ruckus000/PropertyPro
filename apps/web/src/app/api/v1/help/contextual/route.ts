/**
 * Help Contextual API
 *
 * GET /api/v1/help/contextual?path=/compliance&communityId=N
 *
 * Returns up to 3 platform articles relevant to the given route path,
 * filtered by the user's role.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getContextualArticles } from '@/lib/services/help-article-service';

const querySchema = z.object({
  path: z.string().min(1),
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    path: searchParams.get('path'),
    communityId: searchParams.get('communityId'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid contextual help parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const effectiveRole = membership.presetKey ?? membership.role;

  const articles = getContextualArticles(parsed.data.path, effectiveRole, 3);

  return NextResponse.json({
    data: articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    })),
  });
});

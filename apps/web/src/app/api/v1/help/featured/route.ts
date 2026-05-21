/**
 * Help Featured Articles API
 *
 * GET /api/v1/help/featured?communityId=N
 *
 * Returns featured articles for the viewer's role. Used by the
 * HelpDocsModalSearchPanel empty-state when no contextual article
 * matches the current route.
 *
 * Wraps the server-only getFeaturedForRole() so it can be consumed
 * by client components.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getFeaturedForRole } from '@/lib/services/help-article-service';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId') || undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid featured help parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const effectiveRole = membership.presetKey ?? membership.role;

  const articles = getFeaturedForRole(effectiveRole);

  return NextResponse.json({
    data: articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    })),
  });
});

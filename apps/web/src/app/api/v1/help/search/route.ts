/**
 * Help Search API
 *
 * GET /api/v1/help/search?q=...&communityId=N
 *
 * Searches platform articles (filesystem) and community FAQs (DB) in parallel.
 * Returns two separate arrays — no cross-source ranking.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, faqs } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getAllArticles, searchArticles } from '@/lib/services/help-article-service';

const searchSchema = z.object({
  q: z.string().min(2).max(200),
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = searchSchema.safeParse({
    q: searchParams.get('q'),
    communityId: searchParams.get('communityId'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid search parameters');
  }

  const { q } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  // Search both sources in parallel
  const allArticles = getAllArticles();
  const articleResults = searchArticles(allArticles, q);

  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs); // FAQs per community are small (< 100)
  const qLower = q.toLowerCase();
  const faqResults = faqRows
    .filter((f) => {
      const question = String(f['question'] ?? '').toLowerCase();
      const answer = String(f['answer'] ?? '').toLowerCase();
      return question.includes(qLower) || answer.includes(qLower);
    })
    .slice(0, 10);

  return NextResponse.json({
    data: {
      articles: articleResults.map((a) => ({
        title: a.title,
        description: a.description,
        category: a.category,
        slug: a.slug,
        roles: a.roles,
        readTimeMinutes: a.readTimeMinutes,
      })),
      faqs: faqResults.map((f) => ({
        id: f['id'] as number,
        question: f['question'] as string,
        answer: f['answer'] as string,
      })),
    },
  });
});

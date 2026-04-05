/**
 * Public Community Search — GET /api/v1/public/communities/search
 *
 * Discovery endpoint used by the Join-Community page. Returns only minimal,
 * non-sensitive metadata (name, city, state, type, rounded member count) so
 * that unauthenticated users can find a community to request access to.
 *
 * Security:
 * - Rate-limited by IP (30 req/min) to deter scraping.
 * - Intentionally queries across all communities via the unsafe client,
 *   but projects only public columns. Street addresses, contact info,
 *   billing data, and admin identities are NEVER returned.
 * - Member count is rounded to the nearest 10 to avoid exact head-count leaks.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { RateLimitError } from '@/lib/api/errors/RateLimitError';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities } from '@propertypro/db';
import { and, ilike, isNull, sql } from '@propertypro/db/filters';

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  city: z.string().trim().max(100).optional(),
});

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Per-IP rate limit
  const ip = resolveClientIp(req);
  const result = getRateLimiter().check(
    `community-search:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!result.allowed) {
    throw new RateLimitError(
      `Too many search requests. Try again in ${result.retryAfter}s.`,
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get('q'),
    city: searchParams.get('city') ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid search query');
  }

  const db = createUnscopedClient();

  const conditions = [
    ilike(communities.name, `%${parsed.data.q}%`),
    isNull(communities.deletedAt),
  ];
  if (parsed.data.city) {
    conditions.push(ilike(communities.city, `%${parsed.data.city}%`));
  }

  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      city: communities.city,
      state: communities.state,
      communityType: communities.communityType,
      memberCount: sql<number>`(
        SELECT COUNT(*)::int FROM user_roles ur
        WHERE ur.community_id = ${communities.id}
      )`,
    })
    .from(communities)
    .where(and(...conditions))
    .limit(20);

  // Round member count to nearest 10 for privacy
  const results = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    communityType: r.communityType,
    memberCount: Math.floor(r.memberCount / 10) * 10,
  }));

  return NextResponse.json({ data: results });
});

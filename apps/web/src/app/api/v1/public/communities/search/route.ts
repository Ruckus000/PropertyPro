/**
 * Public Community Search — GET /api/v1/public/communities/search
 *
 * Discovery endpoint used by the Join-Community page. Returns only minimal,
 * non-sensitive metadata (name, city, state, type, rounded member count) so
 * that unauthenticated users can find a community to request access to.
 *
 * Security:
 * - Rate-limited by IP (30 req/min) to deter scraping.
 * - Cross-tenant search + public projection live in
 *   `community-search-service` so the unsafe-client surface is encapsulated
 *   behind a single AUTHZ-documented entry point.
 * - Member count is rounded to the nearest 10 to avoid exact head-count leaks.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, RateLimitError } from '@/lib/api/errors';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { searchPublicCommunities } from '@/lib/services/community-search-service';

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

  const data = await searchPublicCommunities({
    q: parsed.data.q,
    city: parsed.data.city,
  });

  return NextResponse.json({ data });
});

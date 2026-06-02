/**
 * Public Community Search — GET /api/v1/public/communities/search
 *
 * Discovery endpoint used by the Join-Community page. Returns only minimal,
 * non-sensitive metadata so unauthenticated users can find a community.
 *
 * Plan A1 drain #153. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Per-IP rate limit runs before contract validation so
 * malformed queries cannot bypass the scrape throttle.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { RateLimitError } from '@/lib/api/errors';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { searchPublicCommunities } from '@/lib/services/community-search-service';
import { publicCommunitiesSearchGetContract } from './contract';

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

const searchHandler = runRoute(
  publicCommunitiesSearchGetContract,
  async ({ query }) =>
    searchPublicCommunities({
      q: query.q,
      city: query.city,
    }),
);

export const GET = withErrorHandler(async (req, ctx) => {
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

  return searchHandler(req, ctx);
});

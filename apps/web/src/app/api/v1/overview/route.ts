import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  getCommunityCards,
  getActivityFeed,
  getUpcomingEvents,
} from '@/lib/queries/cross-community';

/**
 * GET /api/v1/overview
 *
 * Returns aggregated per-community cards, activity feed, and upcoming
 * events for the authenticated user across every community they
 * belong to.
 *
 * Authorization: user is resolved via session (requireAuthenticatedUserId).
 * Data is scoped to the user's own user_roles rows — cross-community
 * helpers apply createScopedClient per community internally.
 */
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const [cards, activity, events] = await Promise.all([
    getCommunityCards(userId),
    getActivityFeed(userId, 30),
    getUpcomingEvents(userId, 30),
  ]);
  return NextResponse.json({ data: { cards, activity, events } });
});

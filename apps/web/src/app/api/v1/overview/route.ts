/**
 * GET /api/v1/overview
 *
 * Returns aggregated per-community cards, activity feed, and upcoming
 * events for the authenticated user across every community they belong
 * to.
 *
 * Plan A1 drain #8: input validation is a no-op (no params / query /
 * body) and output validation + canonical envelope wrapping are delegated
 * to `runRoute()` from `@propertypro/api-contract`. The wire response is
 * the canonical single-payload envelope and is BYTE-IDENTICAL to the
 * pre-migration shape:
 *
 *     { data: { cards: [...], activity: [...], events: [...] } }
 *
 * No consumer changes required — `use-overview.ts` reads
 * `requestJson<OverviewPayload>(...)` which strips the outer `{ data }`
 * envelope and receives `{ cards, activity, events }` directly.
 *
 * Authorization: user is resolved via session
 * (`requireAuthenticatedUserId`). Data is scoped to the user's own
 * `user_roles` rows — the cross-community helpers apply
 * `createScopedClient` per community internally.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  getCommunityCards,
  getActivityFeed,
  getUpcomingEvents,
} from '@/lib/queries/cross-community';
import { overviewContract } from './contract';

export const GET = withErrorHandler(
  runRoute(overviewContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const [cards, activity, events] = await Promise.all([
      getCommunityCards(userId),
      getActivityFeed(userId, 30),
      getUpcomingEvents(userId, 30),
    ]);
    return { cards, activity, events };
  }),
);

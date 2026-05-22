/**
 * Route contract for `GET /api/v1/overview`.
 *
 * Plan A1 drain #8 — mirrors drain #1's no-input session-anchored shape
 * (`/api/v1/me/communities`). Differs in that the response is an object
 * with three cross-community aggregate arrays (`cards`, `activity`,
 * `events`) instead of a single array.
 *
 * Authorization: session-anchored, no community context. The actor IS the
 * anchor — `requireAuthenticatedUserId` resolves the user, and the
 * cross-community service helpers (`getCommunityCards`, `getActivityFeed`,
 * `getUpcomingEvents`) apply `createScopedClient` per community internally
 * based on the user's own `user_roles` rows. No RBAC matrix lookup
 * applies.
 *
 * NOTE on per-item shapes: each sub-array is declared as
 * `z.array(z.unknown())`. This is deliberate:
 *   1. These are aggregate cross-community payloads that combine
 *      `CommunityCard`, `ActivityItem`, and `UpcomingEvent` rows whose
 *      shapes can evolve additively as features land.
 *   2. The consumer hook (`use-overview.ts`) already has a strongly typed
 *      `OverviewPayload` interface — the TypeScript type is the source of
 *      truth for the UI.
 *   3. Tightening to per-field `z.object({...})` schemas would risk 500s
 *      on benign additive field changes in the underlying services.
 * Same philosophy as drain #1's `role: z.string()` ("DB varchar; tightening
 * would 500 on live data if a new role ships").
 *
 * NOTE on permission: `{ resource: 'settings', action: 'read' }` is a
 * placeholder — `RBAC_RESOURCES` has no "self" / "overview" resource and
 * this endpoint isn't gated by the RBAC matrix. The contract runner does
 * not enforce `permission` today (Plan A1 foundation; metadata only).
 * `settings` is the closest semantic match and consistent with drain #1.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const overviewContract = defineRoute({
  method: 'GET',
  path: '/api/v1/overview',
  request: {},
  response: z.object({
    cards: z.array(z.unknown()),
    activity: z.array(z.unknown()),
    events: z.array(z.unknown()),
  }),
  permission: { resource: 'settings', action: 'read' },
});

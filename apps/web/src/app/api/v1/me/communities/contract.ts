/**
 * Route contract for `GET /api/v1/me/communities`.
 *
 * Lives in its own file so consumers (`useUserCommunities`) can
 * `import type` from here without dragging Next.js or the service module
 * into the client bundle. The handler in `./route.ts` is the only value
 * consumer.
 *
 * Authorization shape: the actor IS the anchor — no `communityId` is
 * required because the route returns the actor's OWN community
 * memberships. No RBAC check applies (the user can always see which
 * communities they belong to).
 *
 * NOTE: `permission: { resource: 'settings', action: 'read' }` is a
 * placeholder — `RBAC_RESOURCES` doesn't have a "me" / "self" resource and
 * this endpoint isn't gated by the RBAC matrix at all. Any value-typed
 * field from `RBAC_RESOURCES` satisfies the contract's structural typing;
 * `settings` is the closest semantic match. The contract runner does not
 * enforce `permission` today (Plan A1 foundation; metadata only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Per-item shape. Mirrors the projection in `./route.ts`: `id`, `name`,
 * `slug`, `role`, `displayTitle`, `communityType`. We do NOT expose the
 * full `UserCommunityRow` (which also carries `city`, `state`, `logoPath`,
 * `isUnitOwner`) because the only in-app consumer is the community-switcher
 * dropdown which renders name + link only.
 */
export const userCommunityItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  role: z.string(),
  displayTitle: z.string().nullable(),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
});

export type UserCommunityItem = z.infer<typeof userCommunityItemSchema>;

export const meCommunitiesContract = defineRoute({
  method: 'GET',
  path: '/api/v1/me/communities',
  request: {},
  response: z.array(userCommunityItemSchema),
  permission: { resource: 'settings', action: 'read' },
});

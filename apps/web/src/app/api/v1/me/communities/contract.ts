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
 * `slug`, `role`, `displayTitle`, `communityType`, `logoUrl`. We do NOT
 * expose the full `UserCommunityRow` — the source row also carries `city`,
 * `state`, `logoPath`, `isUnitOwner`, `subscriptionStatus`,
 * `subscriptionPlan`, `freeAccessExpiresAt`, `isDemo`, `trialEndsAt`,
 * `demoExpiresAt` and the raw branding logo paths. Those are intentionally
 * dropped because the in-app consumers (the sidebar switcher and the
 * community picker dialog) render a name, a link and an avatar only.
 * (Server-side consumers — `select-community/page.tsx`,
 * `community-picker-grid.tsx`, `page-context.ts` — use
 * `listCommunitiesForUser` directly and have access to the full row.)
 */
export const userCommunityItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  role: z.string(),
  displayTitle: z.string().nullable(),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  /**
   * Public URL of the community's square logo for the switcher's avatar, or
   * null (the switcher shows the initial). Never signed: see
   * `publicCommunityLogoUrl`.
   */
  logoUrl: z.string().nullable(),
});

export type UserCommunityItem = z.infer<typeof userCommunityItemSchema>;

export const meCommunitiesContract = defineRoute({
  method: 'GET',
  path: '/api/v1/me/communities',
  request: {},
  response: z.array(userCommunityItemSchema),
  permission: { resource: 'settings', action: 'read' },
});

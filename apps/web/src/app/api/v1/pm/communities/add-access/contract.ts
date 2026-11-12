/**
 * Route contract for `GET /api/v1/pm/communities/add-access`.
 *
 * Whether the caller may add a community, and the billing group it would join
 * (null when their first add sets one up). The account menu and the
 * Communities page ask this before showing Add Community; the POST asks the
 * same question again (`requireAddCommunityAccess`).
 *
 * Read-only on purpose: asking must never create or claim a billing group.
 * The group is set up by the first add (`POST /api/v1/pm/communities`).
 *
 * `permission` is metadata only; the runner does not enforce it.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const addCommunityAccessSchema = z.object({
  allowed: z.boolean(),
  billingGroupId: z.number().int().positive().nullable(),
});

export type AddCommunityAccessResponse = z.infer<typeof addCommunityAccessSchema>;

export const pmCommunitiesAddAccessContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/communities/add-access',
  request: {},
  response: addCommunityAccessSchema,
  permission: { resource: 'settings', action: 'read' },
});

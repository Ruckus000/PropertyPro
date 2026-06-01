/**
 * Route contracts for `GET` and `POST /api/v1/pm/communities`.
 *
 * Plan A1 drain #165. PM portfolio list + add-community Stripe Checkout.
 *
 * Authorization: session-anchored — no `communityId`. The PM gate
 * (`isPmAdminInAnyCommunity`) runs inside each handler; contracts are
 * metadata only.
 *
 * GET response uses `z.array(z.unknown())` (loose aggregate) because
 * `PmCommunityPortfolioCard` can gain additive KPI fields; the hook and
 * page components pin the client-side shape.
 *
 * POST subdomain-unavailable errors stay route-level `ValidationError`
 * after body validation (business rule, not Zod shape).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { COMMUNITY_TYPES } from '@propertypro/shared';

export const pmCommunitiesGetQuerySchema = z.object({
  communityType: z.enum(COMMUNITY_TYPES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const pmCommunitiesCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  communityType: z.enum(COMMUNITY_TYPES),
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(2),
  zipCode: z.string().trim().min(5).max(10),
  subdomain: z.string().trim().min(3).max(63),
  timezone: z.string().trim().min(1).default('America/New_York'),
  unitCount: z.number().int().min(1).max(10000),
});

export const pmCommunitiesGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/communities',
  request: {
    query: pmCommunitiesGetQuerySchema,
  },
  response: z.array(z.unknown()),
  permission: { resource: 'settings', action: 'read' },
});

export const pmCommunitiesPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/communities',
  request: {
    body: pmCommunitiesCreateBodySchema,
  },
  response: z.object({
    clientSecret: z.string(),
    pendingSignupId: z.number().int().positive(),
    billingGroupId: z.number().int().positive(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

/**
 * GET /api/v1/stripe/connect/status — Stripe Connect onboarding status for a
 * community.
 *
 * Query: { communityId }. No body.
 *
 * Auth chain (5 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * (via parseCommunityIdFromQuery pre-migration; identical effect) →
 * requireCommunityMembership → requireFinanceEnabled →
 * requireFinanceReadPermission → CONNECT_STATUS_ROLES role check
 * (manager | pm_admin) → getConnectStatus.
 *
 * Response modeling: loose z.unknown() — `getConnectStatus` returns a
 * complex object whose shape (Stripe Connect account fields, possibly Date
 * values for capability/payouts timestamps) may evolve and the runner's
 * safeParse runs BEFORE NextResponse.json serializes (drain #14/#18 lesson).
 * Tight modeling would risk safeParse failures.
 *
 * Closest precedent: drain #20 (PR #428) — /api/v1/esign/my-pending,
 * query-only GET with an extra permission gate beyond plain membership.
 *
 * permission.action must be 'read' — RBAC_ACTIONS only has 'read' | 'write'.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const stripeConnectStatusGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/stripe/connect/status',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'read' },
});

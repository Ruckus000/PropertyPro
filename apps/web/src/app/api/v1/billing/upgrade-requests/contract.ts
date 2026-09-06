/**
 * Route contract for `POST /api/v1/billing/upgrade-requests`.
 *
 * Plan A1 drain #146. Non-billing members notify billing-capable users of a
 * plan upgrade request (in-app notifications only).
 *
 * Tenant: `resolveEffectiveCommunityId(req, null)` — communityId is NOT in
 * the request body. `canRequestUpgrade` role gate stays in-handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import {
  COMMUNITY_FEATURE_KEYS,
  PLAN_FEATURES,
  type CommunityFeatures,
  type PlanId,
} from '@propertypro/shared';

const PLAN_ID_VALUES = Object.keys(PLAN_FEATURES) as PlanId[];

type FeatureKey = keyof CommunityFeatures;
const FEATURE_KEY_VALUES = COMMUNITY_FEATURE_KEYS as readonly FeatureKey[];

const bodySchema = z.object({
  /*
   * Enumerated, not a free string.
   *
   * This field used to be `z.string().min(1).max(64)` while `requestedPlan`
   * one line below was strictly enumerated — an asymmetry with two
   * consequences. A key that names no real feature round-tripped silently and
   * resolved to the "unknown feature" fallback, so a caller could not tell a
   * typo from a working request (a phantom `hasContracts` lived in the test
   * suite for exactly that reason). And the value reaches two sinks in the
   * handler: it is humanized into a notification body delivered to OTHER
   * users, and concatenated into the dedup `sourceId`. Neither is a privilege
   * boundary — no authorization decision reads `featureKey` — but an
   * unvalidated caller-chosen string landing in someone else's notification
   * feed is worth closing on principle.
   *
   * Derived from the interface, so a new feature flag needs no edit here.
   */
  featureKey: z
    .enum(FEATURE_KEY_VALUES as [FeatureKey, ...FeatureKey[]])
    .nullable()
    .optional(),
  requestedPlan: z.enum(PLAN_ID_VALUES as [PlanId, ...PlanId[]]).nullable().optional(),
});

export const billingUpgradeRequestPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/billing/upgrade-requests',
  request: {
    body: bodySchema,
  },
  response: z.object({
    ok: z.literal(true),
    notified: z.number().int().nonnegative(),
  }),
});

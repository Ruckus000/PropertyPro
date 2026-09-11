/**
 * POST /api/admin/communities/[id]/billing/extend-trial
 *
 * Pushes the trial end out by 7, 14 or 30 days — measured from the LATER of now
 * and the current trial end, so extending an already-expired trial does not
 * produce a date in the past (which Stripe reads as "end the trial now").
 * `proration_behavior: 'none'` — this must not invoice anybody.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, via `billingActionRoute`.
 */
import { z } from 'zod';

import { billingActionRoute, confirmedActionSchema } from '@/lib/api/billing-action-route';
import { extendTrial } from '@/lib/server/billing-actions';

/**
 * A closed set, not a bounded integer.
 *
 * A free-form `days` is how a fat-fingered `300` becomes ten months of free
 * service, and there is no operator need this does not cover — a longer grant goes
 * through the access-plan surface, which is audited as a grant rather than as a
 * trial tweak. `z.union` of literals rather than `z.enum`, because the wire value
 * is a NUMBER and coercing it from a string would accept `"7"` from a form that
 * forgot to parse its own input.
 */
const schema = confirmedActionSchema({
  days: z.union([z.literal(7), z.literal(14), z.literal(30)], {
    error: 'days must be 7, 14 or 30.',
  }),
});

export const POST = billingActionRoute({
  schema,
  auditAction: 'subscription_trial_extended',
  run: (communityId, input) => extendTrial(communityId, { days: input.days }),
});

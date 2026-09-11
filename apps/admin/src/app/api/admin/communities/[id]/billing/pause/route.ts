/**
 * POST /api/admin/communities/[id]/billing/pause
 *
 * Pauses collection (`mark_uncollectible`) or resumes it. One route for both
 * directions because they are one Stripe field, and an operator reversing a pause
 * should not need a different endpoint from the one that set it.
 *
 * `resume` is REQUIRED, not defaulted. A default would make an empty body mean
 * one of the two directions, and a caller that forgot the field would silently get
 * whichever we picked — on a control whose two outcomes are "stop billing this
 * customer" and "start billing them again".
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, via `billingActionRoute`.
 */
import { z } from 'zod';

import { billingActionRoute, confirmedActionSchema } from '@/lib/api/billing-action-route';
import { pauseSubscription } from '@/lib/server/billing-actions';

const schema = confirmedActionSchema({
  resume: z.boolean({ error: 'resume must be true (resume collection) or false (pause it).' }),
});

export const POST = billingActionRoute({
  schema,
  auditAction: 'subscription_paused',
  run: (communityId, input, actor) =>
    pauseSubscription(communityId, { resume: input.resume }, actor),
});

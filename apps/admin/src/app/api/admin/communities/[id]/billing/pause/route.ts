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
  // Two names for two directions. One name for both meant a query filtering on
  // `action = 'subscription_paused'` returned resumes as well, in a table that
  // is append-only — so the row could never be relabelled afterwards. The
  // `newValues.paused` boolean did distinguish them, but a boolean inside a
  // payload is not something an operator filters or alerts on.
  auditAction: (input) => (input.resume ? 'subscription_resumed' : 'subscription_paused'),
  run: (communityId, input) => pauseSubscription(communityId, { resume: input.resume }),
});

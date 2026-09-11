/**
 * POST /api/admin/communities/[id]/billing/cancel
 *
 * Cancels the subscription — at period end (reversible) or immediately
 * (terminal). `atPeriodEnd` is REQUIRED: the two outcomes are materially
 * different, one of them cannot be undone from this console, and a default would
 * let a caller that omitted the field get the one we happened to choose.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, via `billingActionRoute`.
 */
import { z } from 'zod';

import { billingActionRoute, confirmedActionSchema } from '@/lib/api/billing-action-route';
import { cancelSubscription } from '@/lib/server/billing-actions';

const schema = confirmedActionSchema({
  atPeriodEnd: z.boolean({
    error: 'atPeriodEnd must be true (cancel at period end) or false (cancel immediately).',
  }),
});

export const POST = billingActionRoute({
  schema,
  auditAction: 'subscription_canceled',
  run: (communityId, input, actor) =>
    cancelSubscription(communityId, { atPeriodEnd: input.atPeriodEnd }, actor),
});

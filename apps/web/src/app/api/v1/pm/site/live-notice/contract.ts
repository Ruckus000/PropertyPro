/**
 * Route contract for `/api/v1/pm/site/live-notice` (website builder, D5).
 *
 * Publishing never emails anyone. Once the site is live, the website home
 * offers the manager one **Email owners** action:
 *
 *   - POST sends "Our community website is live" to owners only, at most once
 *     per community. The send is claimed first (`claimSiteLiveNotice`), so a
 *     second request, or a second manager, is a 409 and sends nothing. It
 *     answers how the send went: `sent` (with the recipient count), `partial`
 *     (the announcement is in owners' feeds but the email did not go; the claim
 *     is kept) or `failed` (nothing was recorded; the claim is released so the
 *     manager can try again).
 *   - PATCH `{ dismissed: true }` retires the offer without sending.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const communityId = z.number().int().positive();

export const siteLiveNoticePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/live-notice',
  request: { body: z.object({ communityId }).strict() },
  response: z.object({
    status: z.enum(['sent', 'partial', 'failed']),
    recipientCount: z.number().int().nonnegative().optional(),
    reason: z.string().optional(),
  }),
  permission: { resource: 'announcements', action: 'write' },
  tenantScope: { in: 'body' },
});

export const siteLiveNoticePatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/live-notice',
  request: { body: z.object({ communityId, dismissed: z.literal(true) }).strict() },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});

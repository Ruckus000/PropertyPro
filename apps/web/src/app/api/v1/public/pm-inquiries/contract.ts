/**
 * Route contract for `POST /api/v1/public/pm-inquiries`.
 *
 * The property-manager inbound form. Separate from `/public/leads` rather than a
 * `source` discriminator on it, for three reasons:
 *
 *  1. The leads limiter is 5/60s keyed per IP and runs before validation. A
 *     visitor who plays with the compliance checker and then finds this form
 *     would hit a silent 429 on the highest-value form on the site.
 *  2. `source` becomes server-set. A client-supplied discriminator lets anyone
 *     stuff the table with rows labelled as portfolio inquiries — poisoning the
 *     one signal worth dropping everything for.
 *  3. The two forms share almost no fields. One merged schema would make every
 *     field optional and validate nothing.
 *
 * No `permission` block: `defineRoute` treats it as optional and the runner does
 * not enforce it, so asserting one on an unauthenticated route is just
 * misleading.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const publicPmInquiriesPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/public/pm-inquiries',
  request: {
    body: z.object({
      email: z.string().trim().email().max(254),
      contactName: z.string().trim().max(200).optional(),
      companyName: z.string().trim().max(200).optional(),
      communityCount: z.number().int().positive().max(10_000).optional(),
      unitCount: z.number().int().positive().max(1_000_000).optional(),
      message: z.string().trim().max(2000).optional(),
    }),
  },
  response: z.object({ ok: z.boolean() }),
});

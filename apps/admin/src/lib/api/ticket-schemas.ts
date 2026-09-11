/**
 * Zod schemas for the support-ticket routes.
 *
 * The plan put these "in the route files", and they started there. They had to
 * move, and the reason is structural rather than stylistic: `[id]/route.ts`'s
 * update schema is `createTicketSchema.partial().extend(…)`, so it needs the
 * create schema as a VALUE — and Next's generated route type
 * (`.next/types/app/api/admin/tickets/route.ts`) asserts
 * `Diff<{GET?,POST?,…,dynamic?,revalidate?,…}, typeof entry, ''>`, which makes
 * ANY export from a `route.ts` beyond the handlers and the known segment config
 * a type error at `next build`. Exporting the schema to share it would have
 * failed the build; re-declaring it in both files would have let the create and
 * update contracts drift apart silently, which is the exact failure a `.strict()`
 * update schema exists to prevent.
 *
 * They are still validated at the boundary, on the first thing each handler does
 * with the request after the platform-admin gate.
 */
import { z } from 'zod';

import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_TITLE_MAX_LENGTH,
  SUPPORT_TICKET_TITLE_MIN_LENGTH,
} from '@propertypro/shared';

/**
 * `title`'s bounds come from `@propertypro/shared`, which is also where the
 * migration's `support_tickets_title_check` got them — so the form rejects
 * exactly what the database would, rather than surfacing a 23514 as a 500.
 */
export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(SUPPORT_TICKET_TITLE_MIN_LENGTH)
    .max(SUPPORT_TICKET_TITLE_MAX_LENGTH),
  description: z.string().max(5000).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('medium'),
  category: z.enum(SUPPORT_TICKET_CATEGORIES).default('other'),
  communityId: z.number().int().positive().nullable().optional(),
  threadId: z.number().int().positive().nullable().optional(),
  externalRef: z.string().max(200).nullable().optional(),
  assignToMe: z.boolean().optional(),
});

/**
 * `.strict()` so an unknown key is a 400 rather than a silently ignored field.
 *
 * Without it, a client typo (`stat: 'resolved'`) would return 200 having
 * changed nothing, and the operator would believe the ticket was closed.
 *
 * `.omit({ assignToMe: true })` is the other half of that promise, and it was
 * missing. `assignToMe` is a CREATE-only affordance: `.partial()` carried it
 * through, `.strict()` therefore ACCEPTED it, and `UpdateTicketInput` has no
 * such field — so `PATCH` with `{"assignToMe": true}` returned 200 having
 * changed nothing, which is verbatim the failure this docblock claims to
 * prevent. (Excess-property checking does not catch it: `parsed` is a variable,
 * not an object literal.) On update the equivalent is an explicit
 * `assigneeUserId`, which is unambiguous about who the assignee becomes.
 */
export const updateTicketSchema = createTicketSchema
  .omit({ assignToMe: true })
  .partial()
  .extend({
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const ticketNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) });

/** Query filters for `GET /api/admin/tickets`. */
export const ticketListQuerySchema = z.object({
  status: z.union([z.enum(SUPPORT_TICKET_STATUSES), z.literal('all')]).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  communityId: z.coerce.number().int().positive().optional(),
});

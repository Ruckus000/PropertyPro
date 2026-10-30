/**
 * Route contracts for `/api/v1/pm/site/records-alert` (website builder, D11).
 *
 * The website home's "records still missing" alert, from one manager's side:
 *
 *   - GET reads how many Florida records the website still lacks, and until
 *     when this manager has snoozed the alert.
 *   - PATCH snoozes the alert for this manager for seven days.
 *
 * `missingCount` is what `missingRecordItems` lists: a covered association's
 * applicable, non-conditional items without a posted, current record. It is 0
 * below the website rule's size threshold and for apartments, where nothing is
 * owed. It ignores the snooze: the navigation badge reads this count and
 * shows it whether or not the alert is snoozed.
 *
 * `snoozedUntil` is null when the manager never snoozed or the snooze has run
 * out, so a caller never compares dates to decide whether to show the alert.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const communityId = z.number().int().positive();

export const recordsAlertSchema = z.object({
  /** ISO 8601, in the future; null when there is no snooze in force. */
  snoozedUntil: z.string().nullable(),
  missingCount: z.number().int().nonnegative(),
});

export type RecordsAlert = z.infer<typeof recordsAlertSchema>;

export const recordsAlertGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/records-alert',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: recordsAlertSchema,
  permission: { resource: 'compliance', action: 'read' },
  tenantScope: { in: 'query' },
});

export const recordsAlertPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/records-alert',
  request: {
    // Seven days is the only snooze there is (D11); a literal keeps it that way.
    body: z.object({ communityId, snoozeDays: z.literal(7) }).strict(),
  },
  response: z.object({ snoozedUntil: z.string() }),
  permission: { resource: 'compliance', action: 'read' },
  tenantScope: { in: 'body' },
});

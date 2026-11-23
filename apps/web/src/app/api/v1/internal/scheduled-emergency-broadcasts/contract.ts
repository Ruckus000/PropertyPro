/**
 * Route contract for `GET /api/v1/internal/scheduled-emergency-broadcasts`.
 *
 * Contracted, like `internal/inbox-spam-scan`, rather than added to the closed
 * `guard:contracts` allowlist: the job takes no input and returns one JSON
 * object with a 200, so nothing about it is runner-blocked. `requireCronSecret`
 * runs inside the handler.
 *
 * `method: 'GET'` is load-bearing. Vercel cron issues GET, and the route also
 * exports POST for manual invocation and the admin Health board's Retry. The
 * runner reads `contract.method` only to decide whether to parse a body;
 * declaring POST would make it try to parse one on the scheduled GET.
 *
 * `permission` is a placeholder: this route is not gated by the RBAC matrix and
 * the runner does not enforce the field.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const count = z.number().int().nonnegative();

export const scheduledEmergencyBroadcastsResponseSchema = z.object({
  /** Due alerts the scan found this run. */
  due: count,
  sent: count,
  /** Not sent: more than 60 minutes late, or the community was deleted. */
  missed: count,
  /** Claimed, then the send threw. `withCronJob` reports a non-zero value. */
  failed: count,
  /** Claimed by another run, or canceled, between the scan and our claim. */
  claimedElsewhere: count,
});

export const scheduledEmergencyBroadcastsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/internal/scheduled-emergency-broadcasts',
  request: {},
  response: scheduledEmergencyBroadcastsResponseSchema,
  permission: { resource: 'emergency_broadcasts', action: 'write' },
});

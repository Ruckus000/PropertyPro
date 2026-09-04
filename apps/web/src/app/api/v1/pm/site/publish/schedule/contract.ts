/**
 * Route contracts for the scheduled-publish endpoints (launch blocker #7).
 *
 * Three verbs on one path:
 *   GET    — the community's pending schedule, or null.
 *   POST   — schedule (or reschedule) a publish.
 *   DELETE — cancel the pending schedule.
 *
 * POST replaces rather than conflicts. `site_publish_schedules_one_pending_idx`
 * makes "one pending schedule per community" a database invariant, and a PM
 * changing the time is the ordinary case — requiring a cancel first would make
 * the common path two round trips with a window of no schedule in between.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { SITE_PUBLISH_SUMMARY_MAX_LENGTH } from '@/lib/site-editor/publish-notification';

const scheduleShape = z.object({
  id: z.number().int().positive(),
  scheduledFor: z.string(),
  notifySummary: z.string().nullable(),
});

export const getSitePublishScheduleContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/publish/schedule',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.object({ schedule: scheduleShape.nullable() }),
  permission: { resource: 'settings', action: 'read' },
});

export const createSitePublishScheduleContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/publish/schedule',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      /**
       * ISO-8601. Bounds are enforced in the handler rather than here because
       * "in the future" and "within 90 days" are relative to the request
       * instant, which a static schema cannot express.
       */
      scheduledFor: z.string().datetime(),
      /**
       * Opt-in resident notification, applied when the schedule fires. Absent
       * means the scheduled publish is quiet — the same default as an
       * immediate one.
       */
      notifyResidents: z
        .object({
          summary: z.string().trim().min(1).max(SITE_PUBLISH_SUMMARY_MAX_LENGTH),
        })
        .optional(),
    }),
  },
  response: z.object({ schedule: scheduleShape }),
  permission: { resource: 'settings', action: 'write' },
});

export const cancelSitePublishScheduleContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/publish/schedule',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.object({ canceled: z.boolean() }),
  permission: { resource: 'settings', action: 'write' },
});

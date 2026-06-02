/**
 * Route contracts for `GET` and `POST /api/v1/visitors`.
 *
 * Plan A1 drain #127. Paginated visitor list + create visitor pass.
 *
 * GET: `communityId` in contract query; `hostUnitId`, `active`, `guestType`,
 * `status`, `cursor`, and `pageSize` parsed manually in-handler (tri-state /
 * enum filters + empty-string pagination — work-orders #108 / denied #94).
 *
 * POST: `superRefine` guest-type conditional fields live in contract (not
 * duplicated in handler). Runtime uses `parseCommunityIdFromBody` (not
 * `resolveEffectiveCommunityId`) — preserved from pre-migration.
 *
 * Response: loose `z.unknown()` — rows may include `Date` / `passCode`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createVisitorBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    visitorName: z.string().trim().min(1).max(240),
    purpose: z.string().trim().min(1).max(240),
    hostUnitLabel: z.string().trim().min(1).max(100),
    expectedArrival: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    guestType: z
      .enum(['one_time', 'recurring', 'permanent', 'vendor'])
      .optional()
      .default('one_time'),
    validFrom: z.string().datetime({ offset: true }).nullable().optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    recurrenceRule: z
      .enum(['weekdays', 'weekends', 'mon_wed_fri', 'tue_thu', 'custom'])
      .nullable()
      .optional(),
    expectedDurationMinutes: z.number().int().min(15).max(1440).nullable().optional(),
    vehicleMake: z.string().max(100).nullable().optional(),
    vehicleModel: z.string().max(100).nullable().optional(),
    vehicleColor: z.string().max(50).nullable().optional(),
    vehiclePlate: z.string().max(20).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const gt = data.guestType;

    if (gt === 'one_time') {
      if (!data.expectedArrival) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedArrival'],
          message: 'expectedArrival is required for one-time passes',
        });
      }
    }

    if (gt === 'recurring') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for recurring passes',
        });
      }
      if (!data.validUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil is required for recurring passes',
        });
      }
      if (!data.recurrenceRule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recurrenceRule'],
          message: 'recurrenceRule is required for recurring passes',
        });
      }
      if (data.expectedDurationMinutes == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedDurationMinutes'],
          message: 'expectedDurationMinutes is required for recurring passes',
        });
      }
    }

    if (gt === 'permanent') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for permanent passes',
        });
      }
      if (data.validUntil != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil must not be set for permanent passes',
        });
      }
      if (data.expectedDurationMinutes != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedDurationMinutes'],
          message: 'expectedDurationMinutes must not be set for permanent passes',
        });
      }
    }

    if (gt === 'vendor') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for vendor passes',
        });
      }
      if (!data.validUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil is required for vendor passes',
        });
      }
    }

    if (data.validFrom && data.validUntil) {
      if (new Date(data.validUntil) <= new Date(data.validFrom)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil must be after validFrom',
        });
      }
    }
  });

export const visitorsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/visitors',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'visitors', action: 'read' },
});

export const visitorsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/visitors',
  request: {
    body: createVisitorBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'write' },
});

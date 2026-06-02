/**
 * Route contract for `GET /api/v1/pm/reports/[reportType]`.
 *
 * Plan A1 drain #159. Cross-community PM portfolio reports. Session-anchored
 * — no tenant context; `isPmAdminInAnyCommunity` is the real gate (same as
 * drain #12 dashboard/summary).
 *
 * Response is `z.unknown()` — each report type returns a distinct aggregate
 * shape; the consumer hook (`use-pm-reports.ts`) pins types client-side.
 *
 * `permission: { resource: 'settings', action: 'read' }` is a placeholder.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const PM_REPORT_TYPES = [
  'maintenance',
  'compliance',
  'occupancy',
  'violations',
  'delinquency',
] as const;

export type PmReportType = (typeof PM_REPORT_TYPES)[number];

export const pmReportQuerySchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    communityIds: z
      .string()
      .transform((s) => s.split(',').map(Number).filter((n) => !isNaN(n) && n > 0))
      .optional(),
  })
  .refine(
    (data) => {
      if (data.dateFrom && !data.dateTo) return false;
      if (!data.dateFrom && data.dateTo) return false;
      return true;
    },
    { message: 'Both dateFrom and dateTo must be provided together', path: ['dateFrom'] },
  )
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) return data.dateFrom <= data.dateTo;
      return true;
    },
    { message: 'dateFrom must be before or equal to dateTo', path: ['dateFrom'] },
  );

export const pmReportGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/reports/[reportType]',
  request: {
    params: z.object({
      reportType: z.enum(PM_REPORT_TYPES),
    }),
    query: pmReportQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});

/**
 * GET /api/v1/pm/reports/[reportType]
 *
 * Cross-community portfolio reports for property managers.
 *
 * Plan A1 drain #159. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: PM portfolio route — cross-community aggregation by design.
import {
  isPmAdminInAnyCommunity,
  getMaintenanceVolumeReport,
  getComplianceStatusReport,
  getOccupancyTrendsReport,
  getViolationSummaryReport,
  getDelinquencyAgingReport,
} from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { pmReportGetContract, type PmReportType } from './contract';

export const GET = withErrorHandler(
  runRoute(pmReportGetContract, async ({ params, query }) => {
    const userId = await requireAuthenticatedUserId();

    const isPm = await isPmAdminInAnyCommunity(userId);
    if (!isPm) {
      throw new ForbiddenError('This endpoint is only available to property managers');
    }

    const { dateFrom, dateTo, communityIds } = query;
    const dateRange = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;

    switch (params.reportType as PmReportType) {
      case 'maintenance':
        return getMaintenanceVolumeReport(userId, communityIds, dateRange);
      case 'compliance':
        return getComplianceStatusReport(userId, communityIds);
      case 'occupancy':
        return getOccupancyTrendsReport(userId, communityIds, dateRange);
      case 'violations':
        return getViolationSummaryReport(userId, communityIds, dateRange);
      case 'delinquency':
        return getDelinquencyAgingReport(userId, communityIds);
    }
  }),
);

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  isPmAdminInAnyCommunity,
  getMaintenanceVolumeReport,
  getComplianceStatusReport,
  getOccupancyTrendsReport,
  getViolationSummaryReport,
  getDelinquencyAgingReport,
} from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';

const REPORT_TYPES = ['maintenance', 'compliance', 'occupancy', 'violations', 'delinquency'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const querySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  communityIds: z
    .string()
    .transform((s) => s.split(',').map(Number).filter((n) => !isNaN(n) && n > 0))
    .optional(),
}).refine(
  (data) => {
    if (data.dateFrom && !data.dateTo) return false;
    if (!data.dateFrom && data.dateTo) return false;
    return true;
  },
  { message: 'Both dateFrom and dateTo must be provided together', path: ['dateFrom'] },
).refine(
  (data) => {
    if (data.dateFrom && data.dateTo) return data.dateFrom <= data.dateTo;
    return true;
  },
  { message: 'dateFrom must be before or equal to dateTo', path: ['dateFrom'] },
);

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ reportType: string }> }) => {
    const userId = await requireAuthenticatedUserId();

    const isPm = await isPmAdminInAnyCommunity(userId);
    if (!isPm) {
      throw new ForbiddenError('This endpoint is only available to property managers');
    }

    const { reportType } = await params;
    if (!REPORT_TYPES.includes(reportType as ReportType)) {
      throw new ValidationError(`Invalid report type: ${reportType}. Valid types: ${REPORT_TYPES.join(', ')}`);
    }

    const { searchParams } = new URL(req.url);
    const rawQuery = {
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      communityIds: searchParams.get('communityIds') ?? undefined,
    };

    const parseResult = querySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new ValidationError('Invalid report query', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const { dateFrom, dateTo, communityIds } = parseResult.data;
    const dateRange = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;

    let data: unknown;

    switch (reportType as ReportType) {
      case 'maintenance':
        data = await getMaintenanceVolumeReport(userId, communityIds, dateRange);
        break;
      case 'compliance':
        data = await getComplianceStatusReport(userId, communityIds);
        break;
      case 'occupancy':
        data = await getOccupancyTrendsReport(userId, communityIds, dateRange);
        break;
      case 'violations':
        data = await getViolationSummaryReport(userId, communityIds, dateRange);
        break;
      case 'delinquency':
        data = await getDelinquencyAgingReport(userId, communityIds);
        break;
    }

    return NextResponse.json({ data });
  },
);

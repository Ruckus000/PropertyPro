/**
 * Route unit test — `GET /api/v1/pm/reports/[reportType]` (A1 drain #159).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  getMaintenanceVolumeReportMock,
  getComplianceStatusReportMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  getMaintenanceVolumeReportMock: vi.fn(),
  getComplianceStatusReportMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  getMaintenanceVolumeReport: getMaintenanceVolumeReportMock,
  getComplianceStatusReport: getComplianceStatusReportMock,
  getOccupancyTrendsReport: vi.fn(),
  getViolationSummaryReport: vi.fn(),
  getDelinquencyAgingReport: vi.fn(),
}));

import { GET } from '../../src/app/api/v1/pm/reports/[reportType]/route';

const SAMPLE_REPORT = {
  kpis: { totalRequests: { label: 'Total', value: 10 } },
  chartData: [],
  tableData: [],
};

describe('GET /api/v1/pm/reports/[reportType]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-user');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    getMaintenanceVolumeReportMock.mockResolvedValue(SAMPLE_REPORT);
    getComplianceStatusReportMock.mockResolvedValue(SAMPLE_REPORT);
  });

  it('returns maintenance report data', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/reports/maintenance?dateFrom=2026-01-01&dateTo=2026-01-31&communityIds=1,2',
    );
    const res = await GET(req, { params: Promise.resolve({ reportType: 'maintenance' }) });
    const json = (await res.json()) as { data: unknown };

    expect(res.status).toBe(200);
    expect(json.data).toEqual(SAMPLE_REPORT);
    expect(getMaintenanceVolumeReportMock).toHaveBeenCalledWith(
      'pm-user',
      [1, 2],
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
  });

  it('returns compliance report without date range', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/pm/reports/compliance');
    const res = await GET(req, { params: Promise.resolve({ reportType: 'compliance' }) });
    const json = (await res.json()) as { data: unknown };

    expect(res.status).toBe(200);
    expect(json.data).toEqual(SAMPLE_REPORT);
    expect(getComplianceStatusReportMock).toHaveBeenCalledWith('pm-user', undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/pm/reports/maintenance');
    const res = await GET(req, { params: Promise.resolve({ reportType: 'maintenance' }) });

    expect(res.status).toBe(401);
    expect(getMaintenanceVolumeReportMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a PM admin', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const req = new NextRequest('http://localhost:3000/api/v1/pm/reports/maintenance');
    const res = await GET(req, { params: Promise.resolve({ reportType: 'maintenance' }) });
    const json = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(403);
    expect(json.error.message).toBe('This endpoint is only available to property managers');
    expect(getMaintenanceVolumeReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid report type', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/pm/reports/not-a-report');
    const res = await GET(req, { params: Promise.resolve({ reportType: 'not-a-report' }) });
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getMaintenanceVolumeReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 when only dateFrom is provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/pm/reports/maintenance?dateFrom=2026-01-01');
    const res = await GET(req, { params: Promise.resolve({ reportType: 'maintenance' }) });
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getMaintenanceVolumeReportMock).not.toHaveBeenCalled();
  });
});

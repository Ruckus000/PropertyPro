/**
 * Route unit test — `GET /api/v1/pm/dashboard/summary`.
 *
 * Added alongside Plan A1 drain #12 (combines drain #6's PM-only
 * session-anchored auth with drain #2's rich query schema). Covers:
 *
 *   - happy path with empty query (default filter)
 *   - happy path with full query (assertions on all filter / sort / pagination
 *     params being forwarded verbatim to `getPortfolioDashboard`)
 *   - 401 path (`requireAuthenticatedUserId` rejects → PM gate not invoked)
 *   - 403 path (`isPmAdminInAnyCommunity` false → literal ForbiddenError
 *     message preserved, service not invoked)
 *   - 400 validation errors for each query field that has a constraint:
 *     `sortBy` enum, `sortDir` enum, `limit` upper bound, `offset` lower
 *     bound, `communityType` enum.
 *
 * The runner wraps the service result in the canonical `{ data: <result> }`
 * envelope; the response schema is `z.unknown()` (see contract.ts docblock
 * — loose-aggregate philosophy, same as drain #8).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  getPortfolioDashboardMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  getPortfolioDashboardMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  getPortfolioDashboard: getPortfolioDashboardMock,
}));

import { GET } from '../../src/app/api/v1/pm/dashboard/summary/route';

interface EnvelopeJson {
  data: unknown;
}

interface ErrorJson {
  error: { code: string; message: string };
}

const SAMPLE_RESULT = {
  kpis: {
    totalUnits: 100,
    occupancyRate: 92,
    occupancyDelta: 3,
    openMaintenance: 7,
    maintenanceDelta: -2,
    complianceScore: 88,
    complianceDelta: 1,
    delinquencyTotal: 12500,
    delinquencyDelta: null,
    expiringLeases: 4,
  },
  communities: [
    {
      communityId: 1,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
      totalUnits: 50,
      residentCount: 88,
      occupancyRate: null,
      occupiedUnits: null,
      openMaintenanceRequests: 3,
      complianceScore: 90,
      outstandingBalance: 0,
      outstandingBalanceCents: 0,
      expiringLeases: 2,
    },
  ],
  totalCount: 1,
};

describe('pm/dashboard/summary route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-pm-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    getPortfolioDashboardMock.mockResolvedValue(SAMPLE_RESULT);
  });

  it('returns { data: <result> } for a PM with no query params (happy path)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/pm/dashboard/summary');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: SAMPLE_RESULT });
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('user-pm-1');
    // Empty query: the runner passes an object with all-undefined fields.
    expect(getPortfolioDashboardMock).toHaveBeenCalledTimes(1);
    expect(getPortfolioDashboardMock).toHaveBeenCalledWith('user-pm-1', {
      communityType: undefined,
      search: undefined,
      sortBy: undefined,
      sortDir: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it('forwards every filter / sort / pagination param to getPortfolioDashboard', async () => {
    const url =
      'http://localhost:3000/api/v1/pm/dashboard/summary' +
      '?communityType=condo_718' +
      '&search=Sunset' +
      '&sortBy=totalUnits' +
      '&sortDir=desc' +
      '&limit=25' +
      '&offset=50';
    const req = new NextRequest(url);
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: SAMPLE_RESULT });
    expect(getPortfolioDashboardMock).toHaveBeenCalledTimes(1);
    expect(getPortfolioDashboardMock).toHaveBeenCalledWith('user-pm-1', {
      communityType: 'condo_718',
      search: 'Sunset',
      sortBy: 'totalUnits',
      sortDir: 'desc',
      limit: 25,
      offset: 50,
    });
  });

  it('returns 401 when unauthenticated and never invokes the PM gate or service', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/pm/dashboard/summary');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 403 with the literal PM-only message when the user is not a PM admin', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const req = new NextRequest('http://localhost:3000/api/v1/pm/dashboard/summary');
    const res = await GET(req);
    const json = (await res.json()) as ErrorJson;

    expect(res.status).toBe(403);
    expect(json.error.message).toBe('This endpoint is only available to property managers');
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid sortBy enum value', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/dashboard/summary?sortBy=notAColumn',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid sortDir enum value', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/dashboard/summary?sortDir=sideways',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds the upper bound (>100)', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/dashboard/summary?limit=101',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a negative offset', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/dashboard/summary?offset=-1',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid communityType enum value', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/dashboard/summary?communityType=mansion',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(getPortfolioDashboardMock).not.toHaveBeenCalled();
  });
});

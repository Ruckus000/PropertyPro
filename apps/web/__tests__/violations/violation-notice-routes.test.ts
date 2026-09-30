/**
 * Route unit tests: GET /api/v1/violations/[id]/notice and /hearing-notice.
 *
 * Pins what the routes hand the PDF generator: the unit NUMBER (both printed
 * the database id until 2026-09-30), the community's time zone, and a notice
 * date that is "today" in the community rather than in UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getViolationForCommunityMock,
  getViolationNoticeCommunityHeaderMock,
  getUnitLabelMapMock,
  generateViolationNoticePdfMock,
  generateHearingNoticePdfMock,
} = vi.hoisted(() => ({
  getViolationForCommunityMock: vi.fn(),
  getViolationNoticeCommunityHeaderMock: vi.fn(),
  getUnitLabelMapMock: vi.fn(),
  generateViolationNoticePdfMock: vi.fn(() => new Uint8Array([37])),
  generateHearingNoticePdfMock: vi.fn(() => new Uint8Array([37])),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: vi.fn().mockResolvedValue({
    fineCaps: { perFineCents: 100_00, aggregateCents: 1_000_00 },
  }),
}));
vi.mock('@/lib/finance/request', () => ({ parseCommunityIdFromQuery: () => 42 }));
vi.mock('@/lib/finance/common', () => ({ parsePositiveInt: (value: string) => Number(value) }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn() }));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn(),
}));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@/lib/violations/common', () => ({
  requireNoticePdfEnabled: vi.fn(),
  requireViolationAdminWrite: vi.fn(),
  requireViolationsEnabled: vi.fn(),
}));
vi.mock('@/lib/services/violations-service', () => ({
  getViolationForCommunity: getViolationForCommunityMock,
  getViolationNoticeCommunityHeader: getViolationNoticeCommunityHeaderMock,
}));
vi.mock('@/lib/services/units-lookup', () => ({ getUnitLabelMap: getUnitLabelMapMock }));
vi.mock('@/lib/utils/violation-notice-pdf', () => ({
  generateViolationNoticePdf: generateViolationNoticePdfMock,
  generateHearingNoticePdf: generateHearingNoticePdfMock,
}));

import { GET as noticeGET } from '../../src/app/api/v1/violations/[id]/notice/route';
import { GET as hearingGET } from '../../src/app/api/v1/violations/[id]/hearing-notice/route';

const VIOLATION = {
  id: 7,
  unitId: 17,
  category: 'noise',
  description: 'Loud.',
  severity: 'minor',
  createdAt: new Date('2026-03-10T15:00:00Z'),
  noticeDate: null,
  hearingDate: new Date('2026-04-01T00:30:00Z'),
};

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/violations/7/${path}?communityId=42`);
}
const ctx = { params: Promise.resolve({ id: '7' }) };

beforeEach(() => {
  vi.clearAllMocks();
  // 9:30pm Eastern on March 18 is already March 19 in UTC.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-19T01:30:00Z'));
  getViolationForCommunityMock.mockResolvedValue(VIOLATION);
  getViolationNoticeCommunityHeaderMock.mockResolvedValue({
    name: 'Sunset Condos',
    address: '1 Ocean Dr',
    found: true,
    timeZone: 'America/New_York',
  });
  getUnitLabelMapMock.mockResolvedValue(new Map([[17, '204']]));
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ['notice', noticeGET, generateViolationNoticePdfMock],
  ['hearing-notice', hearingGET, generateHearingNoticePdfMock],
] as const)('GET /violations/[id]/%s', (path, GET, generate) => {
  it('prints the unit number, the community time zone, and the community-local date', async () => {
    const res = await GET(request(path), ctx);
    expect(res.status).toBe(200);
    expect(getUnitLabelMapMock).toHaveBeenCalledWith(42, [17]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        unitNumber: '204',
        timeZone: 'America/New_York',
        noticeDate: '2026-03-18',
      }),
    );
  });

  it('says the unit was removed rather than print an id that reads as a unit number', async () => {
    getUnitLabelMapMock.mockResolvedValue(new Map());
    await GET(request(path), ctx);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ unitNumber: '#17 (unit removed)' }),
    );
  });
});

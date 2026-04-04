import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB modules before importing the function under test
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: mockSelect,
  }),
}));

vi.mock('@propertypro/db', () => ({
  demoInstances: {
    slug: 'demoInstances.slug',
    demoBoardUserId: 'demoInstances.demoBoardUserId',
    demoResidentUserId: 'demoInstances.demoResidentUserId',
    seededCommunityId: 'demoInstances.seededCommunityId',
    deletedAt: 'demoInstances.deletedAt',
  },
  communities: {
    id: 'communities.id',
    demoExpiresAt: 'communities.demoExpiresAt',
    trialEndsAt: 'communities.trialEndsAt',
    communityType: 'communities.communityType',
    deletedAt: 'communities.deletedAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ type: 'and', args }),
  eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
  isNull: (a: unknown) => ({ type: 'isNull', a }),
  or: (...args: unknown[]) => ({ type: 'or', args }),
}));

import { detectDemoInfo } from '@/lib/demo/detect-demo-info';

function setupChain(result: unknown[]) {
  mockLimit.mockResolvedValue(result);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe('detectDemoInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null immediately when isDemo is false (no DB call)', async () => {
    const result = await detectDemoInfo(false, 'user-123', 1);
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null when userId is empty (no DB call)', async () => {
    const result = await detectDemoInfo(true, '', 1);
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns { currentRole: "board" } when demoBoardUserId matches', async () => {
    const boardUserId = 'board-user-uuid';
    setupChain([
      {
        slug: 'demo-acme-a1b2c3',
        demoBoardUserId: boardUserId,
        demoResidentUserId: 'resident-user-uuid',
        demoExpiresAt: new Date(Date.now() + 86400000 * 21),
        trialEndsAt: new Date(Date.now() + 86400000 * 14),
        communityType: 'condo_718',
        deletedAt: null,
      },
    ]);

    const result = await detectDemoInfo(true, boardUserId, 42);

    expect(result).toMatchObject({
      isDemoMode: true,
      currentRole: 'board',
      slug: 'demo-acme-a1b2c3',
      status: 'active_trial',
      communityType: 'condo_718',
    });
    expect(result!.trialEndsAt).toBeInstanceOf(Date);
    expect(result!.demoExpiresAt).toBeInstanceOf(Date);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('returns { currentRole: "resident" } when demoResidentUserId matches', async () => {
    const residentUserId = 'resident-user-uuid';
    setupChain([
      {
        slug: 'demo-acme-a1b2c3',
        demoBoardUserId: 'board-user-uuid',
        demoResidentUserId: residentUserId,
        demoExpiresAt: new Date(Date.now() + 86400000 * 21),
        trialEndsAt: new Date(Date.now() + 86400000 * 14),
        communityType: 'hoa_720',
        deletedAt: null,
      },
    ]);

    const result = await detectDemoInfo(true, residentUserId, 42);

    expect(result).toMatchObject({
      isDemoMode: true,
      currentRole: 'resident',
      slug: 'demo-acme-a1b2c3',
      communityType: 'hoa_720',
    });
  });

  it('returns null when no demo instance matches', async () => {
    setupChain([]);

    const result = await detectDemoInfo(true, 'unknown-user-uuid', 42);

    expect(result).toBeNull();
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

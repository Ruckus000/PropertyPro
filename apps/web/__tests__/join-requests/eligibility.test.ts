import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  select: vi.fn(),
};

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

vi.mock('@propertypro/db', () => ({
  userRoles: {
    id: 'userRoles.id',
    userId: 'userRoles.userId',
    communityId: 'userRoles.communityId',
  },
  communityJoinRequests: {
    id: 'communityJoinRequests.id',
    userId: 'communityJoinRequests.userId',
    communityId: 'communityJoinRequests.communityId',
    status: 'communityJoinRequests.status',
    reviewedAt: 'communityJoinRequests.reviewedAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ gte: [a, b] }),
}));

import { checkJoinRequestEligibility } from '@/lib/join-requests/eligibility';

function makeQuery(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(rows) }),
    }),
  };
}

describe('checkJoinRequestEligibility', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it('rejects if user already has a role', async () => {
    mockDb.select.mockReturnValueOnce(makeQuery([{ id: 1 }]));

    const result = await checkJoinRequestEligibility({
      userId: 'user-1',
      communityId: 1,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('already_member');
  });

  it('rejects if pending request exists', async () => {
    mockDb.select
      .mockReturnValueOnce(makeQuery([]))
      .mockReturnValueOnce(makeQuery([{ id: 1 }]));

    const result = await checkJoinRequestEligibility({
      userId: 'user-1',
      communityId: 1,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('pending_request');
  });

  it('rejects if denied in last 30 days', async () => {
    mockDb.select
      .mockReturnValueOnce(makeQuery([]))
      .mockReturnValueOnce(makeQuery([]))
      .mockReturnValueOnce(makeQuery([{ id: 1 }]));

    const result = await checkJoinRequestEligibility({
      userId: 'user-1',
      communityId: 1,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('recently_denied');
  });

  it('accepts when no blockers', async () => {
    mockDb.select
      .mockReturnValueOnce(makeQuery([]))
      .mockReturnValueOnce(makeQuery([]))
      .mockReturnValueOnce(makeQuery([]));

    const result = await checkJoinRequestEligibility({
      userId: 'user-1',
      communityId: 1,
    });

    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

/**
 * Route unit tests — `GET/POST /api/v1/polls`.
 *
 * Added alongside Plan A1 drain #95. Covers the contracted runRoute envelope:
 * paginated GET (service args, boolean query filters, empty-string cursor/pageSize),
 * POST create (auth chain, null coalescing, x-request-id forwarding), 401, and
 * 403 gates. Fixtures use `PollRecord` fields only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePollsEnabledMock,
  requirePollReadPermissionMock,
  requirePollWritePermissionMock,
  requirePollCreatorRoleMock,
  assertNotDemoGraceMock,
  paginatePollsForCommunityMock,
  createPollForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePollsEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  requirePollWritePermissionMock: vi.fn(),
  requirePollCreatorRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  paginatePollsForCommunityMock: vi.fn(),
  createPollForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/polls/common', () => ({
  requirePollsEnabled: requirePollsEnabledMock,
  requirePollReadPermission: requirePollReadPermissionMock,
  requirePollWritePermission: requirePollWritePermissionMock,
  requirePollCreatorRole: requirePollCreatorRoleMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  paginatePollsForCommunity: paginatePollsForCommunityMock,
  createPollForCommunity: createPollForCommunityMock,
}));

import { GET, POST } from '../../src/app/api/v1/polls/route';

const MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const POLL_RECORD = {
  id: 7,
  communityId: 42,
  title: 'Pool hours',
  description: null,
  pollType: 'single_choice' as const,
  options: ['8am - 6pm', '9am - 7pm'],
  endsAt: null,
  createdByUserId: 'user-admin',
  isActive: true,
  createdAt: new Date('2026-05-23T00:00:00.000Z'),
  updatedAt: new Date('2026-05-23T00:00:00.000Z'),
};

/** Wire shape after `NextResponse.json` ISO-serializes Date fields. */
const POLL_RECORD_JSON = {
  ...POLL_RECORD,
  createdAt: '2026-05-23T00:00:00.000Z',
  updatedAt: '2026-05-23T00:00:00.000Z',
};

interface PaginatedJson {
  data: {
    data: unknown[];
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

interface EnvelopeJson {
  data: unknown;
}

function getReq(url: string): NextRequest {
  return new NextRequest(url);
}

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/polls', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/polls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePollsEnabledMock.mockReturnValue(undefined);
    requirePollReadPermissionMock.mockReturnValue(undefined);
    paginatePollsForCommunityMock.mockResolvedValue({
      data: [POLL_RECORD],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns paginated polls with default isActive/includeEnded filters', async () => {
    const res = await GET(
      getReq('http://localhost:3000/api/v1/polls?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as PaginatedJson;
    expect(json.data.data).toEqual([POLL_RECORD_JSON]);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(paginatePollsForCommunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        cursor: undefined,
        pageSize: undefined,
        isActive: true,
        includeEnded: false,
        now: expect.any(Date),
      }),
    );
  });

  it('forwards cursor, pageSize, and boolean query filters', async () => {
    await GET(
      getReq(
        'http://localhost:3000/api/v1/polls?communityId=42&cursor=abc&pageSize=25&isActive=false&includeEnded=true',
      ),
    );

    expect(paginatePollsForCommunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: 'abc',
        pageSize: 25,
        isActive: false,
        includeEnded: true,
      }),
    );
  });

  it('treats empty-string cursor and pageSize as missing', async () => {
    await GET(
      getReq('http://localhost:3000/api/v1/polls?communityId=42&cursor=&pageSize='),
    );

    expect(paginatePollsForCommunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: undefined,
        pageSize: undefined,
      }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq('http://localhost:3000/api/v1/polls?communityId=42'));
    expect(res.status).toBe(401);
    expect(paginatePollsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls are disabled', async () => {
    requirePollsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Polls are not enabled for this community type');
    });

    const res = await GET(getReq('http://localhost:3000/api/v1/polls?communityId=42'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/polls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePollsEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    requirePollCreatorRoleMock.mockReturnValue(undefined);
    createPollForCommunityMock.mockResolvedValue(POLL_RECORD);
  });

  it('creates a poll (happy path)', async () => {
    const res = await POST(
      jsonPost(
        {
          communityId: 42,
          title: 'Pool hours',
          pollType: 'single_choice',
          options: ['8am - 6pm', '9am - 7pm'],
        },
        { 'x-request-id': 'req-poll-1' },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual(POLL_RECORD_JSON);
    expect(createPollForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-admin',
      {
        title: 'Pool hours',
        description: null,
        pollType: 'single_choice',
        options: ['8am - 6pm', '9am - 7pm'],
        endsAt: null,
      },
      'req-poll-1',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost({
        communityId: 42,
        title: 'Pool hours',
        pollType: 'single_choice',
        options: ['A', 'B'],
      }),
    );
    expect(res.status).toBe(401);
    expect(createPollForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks poll creator role', async () => {
    requirePollCreatorRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only community leaders can create polls');
    });

    const res = await POST(
      jsonPost({
        communityId: 42,
        title: 'Pool hours',
        pollType: 'single_choice',
        options: ['A', 'B'],
      }),
    );
    expect(res.status).toBe(403);
    expect(createPollForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid poll payload', async () => {
    const res = await POST(
      jsonPost({
        communityId: 42,
        title: '',
        pollType: 'single_choice',
        options: ['A'],
      }),
    );
    expect(res.status).toBe(400);
    expect(createPollForCommunityMock).not.toHaveBeenCalled();
  });
});

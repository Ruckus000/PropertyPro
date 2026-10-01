/**
 * `/meetings/<id>` — the target of new-meeting notifications and the PM
 * overview's upcoming meetings. Before this page existed both 404'd.
 *
 * It must open the meeting only in a community where the caller can READ
 * meetings: every probe is the real `meetings:read` check for that
 * membership's role, then the community-scoped read, and a meeting the caller
 * cannot open 404s exactly like a missing one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMUNITY_ID_HEADER,
  SUPPORT_COMMUNITY_ID_HEADER,
  SUPPORT_SESSION_ID_HEADER,
  TENANT_SOURCE_HEADER,
} from '@/lib/request/forwarded-headers';

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUserId: vi.fn(),
  getOptionalPageCommunityId: vi.fn(),
  listCommunitiesForUser: vi.fn(),
  getMeetingDetail: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  requestHeaders: { current: new Headers() },
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('next/headers', () => ({ headers: async () => mocks.requestHeaders.current }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: mocks.requireAuthenticatedUserId,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  getOptionalPageCommunityId: mocks.getOptionalPageCommunityId,
}));
vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: mocks.listCommunitiesForUser,
}));
vi.mock('@/lib/services/meeting-service', () => ({
  getMeetingDetail: mocks.getMeetingDetail,
}));

import MeetingRedirectPage from '../../../src/app/(authenticated)/meetings/[id]/page';

function membership(communityId: number, extra: Record<string, unknown> = {}) {
  return {
    communityId,
    slug: `community-${communityId}`,
    role: 'resident',
    communityType: 'condo_718',
    isUnitOwner: true,
    ...extra,
  };
}

/** The meeting lives in `holder`. */
function meetingLivesIn(holder: number | null) {
  mocks.getMeetingDetail.mockImplementation(async (communityId: number) =>
    communityId === holder ? { id: 42, communityId: holder } : null,
  );
}

async function visit(id: string): Promise<string> {
  try {
    await MeetingRedirectPage({ params: Promise.resolve({ id }) });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('page returned without redirecting or 404ing');
}

function probedCommunities(): number[] {
  return mocks.getMeetingDetail.mock.calls.map(([communityId]) => communityId as number);
}

describe('/meetings/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'getpropertypro.com');
    mocks.requestHeaders.current = new Headers();
    mocks.requireAuthenticatedUserId.mockResolvedValue('user-1');
    mocks.getOptionalPageCommunityId.mockResolvedValue(null);
    mocks.listCommunitiesForUser.mockResolvedValue([membership(5), membership(6)]);
  });

  it("redirects into the request's community with the meeting open", async () => {
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    meetingLivesIn(6);

    expect(await visit('42')).toBe('NEXT_REDIRECT:/communities/6/meetings?meeting=42');
    // The request's community is probed first, so a hit there costs one read.
    expect(probedCommunities()).toEqual([6]);
    expect(mocks.getMeetingDetail).toHaveBeenCalledWith(6, 42);
  });

  it("falls back to the caller's other communities when the request's does not hold it", async () => {
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    meetingLivesIn(5);

    expect(await visit('42')).toBe('NEXT_REDIRECT:/communities/5/meetings?meeting=42');
    expect(probedCommunities()).toEqual([6, 5]);
  });

  it('404s, without reading, where the role cannot read meetings', async () => {
    // An apartment unit owner has no `meetings:read` in the RBAC matrix.
    mocks.listCommunitiesForUser.mockResolvedValue([
      membership(5, { communityType: 'apartment', isUnitOwner: true }),
    ]);
    meetingLivesIn(5);

    expect(await visit('42')).toBe('NEXT_NOT_FOUND');
    expect(mocks.getMeetingDetail).not.toHaveBeenCalled();
  });

  it('404s when no community of the caller holds the meeting', async () => {
    meetingLivesIn(null);

    expect(await visit('42')).toBe('NEXT_NOT_FOUND');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('never probes a community the caller is not a member of', async () => {
    mocks.getOptionalPageCommunityId.mockResolvedValue(99);
    meetingLivesIn(99);

    expect(await visit('42')).toBe('NEXT_NOT_FOUND');
    expect(probedCommunities()).not.toContain(99);
  });

  it('skips a membership whose role the access rules do not know', async () => {
    mocks.listCommunitiesForUser.mockResolvedValue([membership(5, { role: 'owner' })]);
    meetingLivesIn(5);

    expect(await visit('42')).toBe('NEXT_NOT_FOUND');
    expect(mocks.getMeetingDetail).not.toHaveBeenCalled();
  });

  it('stays inside the consented community during a support session', async () => {
    mocks.requestHeaders.current = new Headers({
      [SUPPORT_SESSION_ID_HEADER]: 'session-1',
      [SUPPORT_COMMUNITY_ID_HEADER]: '5',
      [COMMUNITY_ID_HEADER]: '5',
    });
    mocks.getOptionalPageCommunityId.mockResolvedValue(5);
    meetingLivesIn(6);

    expect(await visit('42')).toBe('NEXT_NOT_FOUND');
    expect(probedCommunities()).toEqual([5]);
  });

  it("sends a meeting in another community to that community's subdomain on a tenant host", async () => {
    mocks.requestHeaders.current = new Headers({ [TENANT_SOURCE_HEADER]: 'host_subdomain' });
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    meetingLivesIn(5);

    expect(await visit('42')).toBe(
      'NEXT_REDIRECT:https://community-5.getpropertypro.com/communities/5/meetings?meeting=42',
    );
  });

  it.each(['abc', '0', '-3', '1.5'])('404s on a malformed id (%s) without reading', async (id) => {
    expect(await visit(id)).toBe('NEXT_NOT_FOUND');
    expect(mocks.listCommunitiesForUser).not.toHaveBeenCalled();
    expect(mocks.getMeetingDetail).not.toHaveBeenCalled();
  });
});

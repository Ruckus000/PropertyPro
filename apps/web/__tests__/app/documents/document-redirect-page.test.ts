/**
 * `/documents/<id>` — the target of every document link minted outside the
 * library (emails, notifications, search, the PM activity feed, authored-doc
 * links). Before this page existed each of those links 404'd.
 *
 * It must open the document only in a community where the caller can READ it:
 * every probe is `getDocumentWithAccessCheck` with that membership's role, and
 * a document the caller cannot open 404s exactly like a missing one.
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
  getDocumentWithAccessCheck: vi.fn(),
  getDocumentAccessCommunitySettings: vi.fn(),
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
vi.mock('@propertypro/db', () => ({
  getDocumentWithAccessCheck: mocks.getDocumentWithAccessCheck,
  getDocumentAccessCommunitySettings: mocks.getDocumentAccessCommunitySettings,
}));

import DocumentRedirectPage from '../../../src/app/(authenticated)/documents/[id]/page';

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

/** The document lives in `holder` and the caller may read it there. */
function documentLivesIn(holder: number | null) {
  mocks.getDocumentWithAccessCheck.mockImplementation(async (context: { communityId: number }) =>
    context.communityId === holder ? { id: 77, communityId: holder } : null,
  );
}

async function visit(id: string): Promise<string> {
  try {
    await DocumentRedirectPage({ params: Promise.resolve({ id }) });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('page returned without redirecting or 404ing');
}

function probedCommunities(): number[] {
  return mocks.getDocumentWithAccessCheck.mock.calls.map(
    ([context]) => (context as { communityId: number }).communityId,
  );
}

describe('/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'getpropertypro.com');
    mocks.requestHeaders.current = new Headers();
    mocks.requireAuthenticatedUserId.mockResolvedValue('user-1');
    mocks.getOptionalPageCommunityId.mockResolvedValue(null);
    mocks.listCommunitiesForUser.mockResolvedValue([membership(5), membership(6)]);
    mocks.getDocumentAccessCommunitySettings.mockResolvedValue({
      communityType: 'condo_718',
      tenantsCanViewInspectionReports: false,
    });
  });

  it("redirects into the request's community library with the document selected", async () => {
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    documentLivesIn(6);

    expect(await visit('77')).toBe('NEXT_REDIRECT:/communities/6/documents?doc=77');
    // The request's community is probed first, so a hit there costs one read.
    expect(probedCommunities()).toEqual([6]);
  });

  it("checks access with the caller's own role in that community", async () => {
    mocks.listCommunitiesForUser.mockResolvedValue([
      membership(5, { role: 'resident', isUnitOwner: false, communityType: 'hoa_720' }),
    ]);
    documentLivesIn(5);

    await visit('77');

    expect(mocks.getDocumentWithAccessCheck).toHaveBeenCalledWith(
      {
        communityId: 5,
        role: 'resident',
        communityType: 'hoa_720',
        isUnitOwner: false,
        tenantsCanViewInspectionReports: false,
      },
      77,
    );
  });

  it("passes that community's tenant inspection-reports setting into the probe", async () => {
    mocks.listCommunitiesForUser.mockResolvedValue([
      membership(5, { role: 'resident', isUnitOwner: false, communityType: 'hoa_720' }),
    ]);
    mocks.getDocumentAccessCommunitySettings.mockResolvedValue({
      communityType: 'hoa_720',
      tenantsCanViewInspectionReports: true,
    });
    documentLivesIn(5);

    await visit('77');

    expect(mocks.getDocumentAccessCommunitySettings).toHaveBeenCalledWith(5);
    expect(mocks.getDocumentWithAccessCheck).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 5, tenantsCanViewInspectionReports: true }),
      77,
    );
  });

  it('skips a community whose settings cannot be read (fails closed)', async () => {
    mocks.getDocumentAccessCommunitySettings.mockResolvedValue(null);
    documentLivesIn(5);

    expect(await visit('77')).toBe('NEXT_NOT_FOUND');
    expect(mocks.getDocumentWithAccessCheck).not.toHaveBeenCalled();
  });

  it("falls back to the caller's other communities when the request's does not hold it", async () => {
    // e.g. a multi-community user who picked the wrong community at
    // /select-community after following a link that named none.
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    documentLivesIn(5);

    expect(await visit('77')).toBe('NEXT_REDIRECT:/communities/5/documents?doc=77');
    expect(probedCommunities()).toEqual([6, 5]);
  });

  it('404s when no community of the caller lets them read the document', async () => {
    // Missing, deleted, a draft, or a category the caller's role cannot see —
    // all four are a null from the access check, and all four look alike.
    documentLivesIn(null);

    expect(await visit('77')).toBe('NEXT_NOT_FOUND');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('never probes a community the caller is not a member of', async () => {
    mocks.getOptionalPageCommunityId.mockResolvedValue(99);
    documentLivesIn(99);

    expect(await visit('77')).toBe('NEXT_NOT_FOUND');
    expect(probedCommunities()).not.toContain(99);
  });

  it('stays inside the consented community during a support session', async () => {
    mocks.requestHeaders.current = new Headers({
      [SUPPORT_SESSION_ID_HEADER]: 'session-1',
      [SUPPORT_COMMUNITY_ID_HEADER]: '5',
      [COMMUNITY_ID_HEADER]: '5',
    });
    mocks.getOptionalPageCommunityId.mockResolvedValue(5);
    documentLivesIn(6);

    expect(await visit('77')).toBe('NEXT_NOT_FOUND');
    expect(probedCommunities()).toEqual([5]);
  });

  describe('on a community host, where the host wins over the path', () => {
    // Middleware takes the community from a tenant host and ignores
    // `/communities/<id>`, so a relative redirect into ANOTHER community would
    // render the host's shell around it and its API calls would 404.
    it("sends a document in another community to that community's subdomain", async () => {
      mocks.requestHeaders.current = new Headers({ [TENANT_SOURCE_HEADER]: 'host_subdomain' });
      mocks.getOptionalPageCommunityId.mockResolvedValue(6);
      documentLivesIn(5);

      expect(await visit('77')).toBe(
        'NEXT_REDIRECT:https://community-5.getpropertypro.com/communities/5/documents?doc=77',
      );
    });

    it("does the same on a community's custom domain", async () => {
      mocks.requestHeaders.current = new Headers({ [TENANT_SOURCE_HEADER]: 'custom_domain' });
      mocks.getOptionalPageCommunityId.mockResolvedValue(6);
      documentLivesIn(5);

      expect(await visit('77')).toBe(
        'NEXT_REDIRECT:https://community-5.getpropertypro.com/communities/5/documents?doc=77',
      );
    });

    it("stays on the host for the host's own community", async () => {
      mocks.requestHeaders.current = new Headers({ [TENANT_SOURCE_HEADER]: 'host_subdomain' });
      mocks.getOptionalPageCommunityId.mockResolvedValue(6);
      documentLivesIn(6);

      expect(await visit('77')).toBe('NEXT_REDIRECT:/communities/6/documents?doc=77');
    });
  });

  it('stays on the host when the community came from the query, not the host', async () => {
    // Apex / www / pm: the path IS honoured there, so a relative redirect works.
    mocks.requestHeaders.current = new Headers({ [TENANT_SOURCE_HEADER]: 'community_id' });
    mocks.getOptionalPageCommunityId.mockResolvedValue(6);
    documentLivesIn(5);

    expect(await visit('77')).toBe('NEXT_REDIRECT:/communities/5/documents?doc=77');
  });

  it.each(['abc', '0', '-3', '1.5'])('404s on a malformed id (%s) without reading', async (id) => {
    expect(await visit(id)).toBe('NEXT_NOT_FOUND');
    expect(mocks.listCommunitiesForUser).not.toHaveBeenCalled();
    expect(mocks.getDocumentWithAccessCheck).not.toHaveBeenCalled();
  });
});

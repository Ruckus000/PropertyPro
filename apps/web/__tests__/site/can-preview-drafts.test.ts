/**
 * Draft site preview is for the community's site editors only.
 *
 * Middleware stamps `x-preview` for any signed-in visitor who asks for
 * `?preview=true`; it cannot tell which community's site they may edit without
 * a database read on every request. This helper is where that is decided, so
 * these cases pin who gets drafts and who gets the published site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '@/lib/api/errors';

const { headersGetMock, getOptionalUserMock, requireMembershipMock } = vi.hoisted(() => ({
  headersGetMock: vi.fn(),
  getOptionalUserMock: vi.fn(),
  requireMembershipMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  getOptionalPageAuthenticatedUser: getOptionalUserMock,
  requirePageAuthenticatedUserId: vi.fn(),
}));

// The real page-community-context runs; only the DB-backed lookup under it is
// doubled, so the test exercises the same membership path pages use.
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

import { canPreviewDrafts } from '@/lib/site/can-preview-drafts';

const COMMUNITY_ID = 42;
const USER = { id: 'user-1', email: null, phone: null, fullName: null, user_metadata: {} };

function previewHeader(value: string | null) {
  headersGetMock.mockImplementation((key: string) => (key === 'x-preview' ? value : null));
}

function memberWithRole(role: string) {
  requireMembershipMock.mockImplementation(async (communityId: number, userId: string) => {
    expect(communityId).toBe(COMMUNITY_ID);
    expect(userId).toBe(USER.id);
    return { communityId, userId, role };
  });
}

describe('canPreviewDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewHeader('true');
    getOptionalUserMock.mockResolvedValue(USER);
  });

  it('signed-in resident of another community gets the published site', async () => {
    requireMembershipMock.mockRejectedValue(
      new ForbiddenError('User is not a member of this community'),
    );
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(false);
  });

  it('resident of the same community gets the published site', async () => {
    memberWithRole('resident');
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(false);
  });

  it('property manager of the community gets drafts', async () => {
    memberWithRole('property_manager');
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(true);
  });

  it('root manager of the community gets drafts', async () => {
    memberWithRole('root_manager');
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(true);
  });

  it('no user gets the published site', async () => {
    getOptionalUserMock.mockResolvedValue(null);
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(false);
    expect(requireMembershipMock).not.toHaveBeenCalled();
  });

  it('a manager without the preview header gets the published site', async () => {
    previewHeader(null);
    memberWithRole('property_manager');
    await expect(canPreviewDrafts(COMMUNITY_ID)).resolves.toBe(false);
    expect(requireMembershipMock).not.toHaveBeenCalled();
  });

  it('a membership lookup that fails for another reason is not read as "no"', async () => {
    requireMembershipMock.mockRejectedValue(new Error('connection reset'));
    await expect(canPreviewDrafts(COMMUNITY_ID)).rejects.toThrow('connection reset');
  });
});

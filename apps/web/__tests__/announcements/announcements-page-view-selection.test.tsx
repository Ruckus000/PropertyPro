/**
 * Which view each announcements route hands its page component. The routes
 * keep their own auth and permission checks; these tests pin only the choice
 * made after them: a resident gets the resident view (no panel, no manager
 * action), a manager the staff view, and "Show deleted" is an admin's alone.
 */
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, canWriteMock, getByIdMock, listMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  membershipMock: vi.fn(),
  canWriteMock: vi.fn(),
  getByIdMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolvePageCommunityContext: () => ({ communityId: 42 }),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: async () => 'user-1',
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  checkPermissionV2: canWriteMock,
  requirePermission: () => undefined,
}));
vi.mock('@/lib/announcements/read-visibility', () => ({
  listVisibleAnnouncements: listMock,
  getVisibleAnnouncementById: getByIdMock,
  formatAnnouncementAudienceLabel: (audience: string) => `label:${audience}`,
}));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: () => undefined,
}));
vi.mock('@/components/announcements/announcement-list', () => ({
  AnnouncementList: () => null,
}));
vi.mock('@/components/announcements/announcements-list-page', () => ({
  AnnouncementsListPage: () => null,
  announcementsListHref: (id: number, state: { query?: string; includeDeleted?: boolean } = {}) =>
    `/announcements?c=${id}&q=${state.query ?? ''}&deleted=${String(state.includeDeleted ?? false)}`,
}));
vi.mock('@/components/announcements/announcement-detail-page', () => ({
  AnnouncementDetailPage: () => null,
}));
vi.mock('@/components/announcements/announcement-form-page', () => ({
  AnnouncementFormPage: () => null,
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));

import AnnouncementsPage from '@/app/(authenticated)/announcements/page';
import AnnouncementDetailRoute from '@/app/(authenticated)/announcements/[id]/page';
import EditAnnouncementRoute from '@/app/(authenticated)/announcements/[id]/edit/page';

const manager = { role: 'property_manager', communityType: 'condo_718', isUnitOwner: false, isAdmin: true };
const owner = { role: 'resident', communityType: 'condo_718', isUnitOwner: true, isAdmin: false };

const row = {
  id: 17,
  title: 'Roof inspection scheduled',
  body: '<p>Tuesday.</p>',
  audience: 'all',
  isPinned: false,
  publishedBy: 'someone-else',
  publishedAt: new Date('2026-04-10T12:00:00.000Z'),
  deletedAt: null,
  expiresAt: null,
};

type Props = Record<string, unknown>;
const propsOf = (element: unknown) => (element as ReactElement<Props>).props;

function list(searchParams: Record<string, string> = {}) {
  return AnnouncementsPage({ searchParams: Promise.resolve(searchParams) }).then(propsOf);
}
/**
 * The records stream inside a Suspense boundary, so the route's own return
 * never runs them. Run the boundary's child and return what it hands the list.
 */
async function records(searchParams: Record<string, string>) {
  const page = await list(searchParams);
  const boundary = propsOf(page.children);
  const child = boundary.children as ReactElement<Props> & {
    type: (props: Props) => Promise<unknown>;
  };
  return propsOf(await child.type(child.props));
}
function detail() {
  return AnnouncementDetailRoute({
    params: Promise.resolve({ id: '17' }),
    searchParams: Promise.resolve({}),
  }).then(propsOf);
}

describe('announcements routes pick the view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByIdMock.mockResolvedValue(row);
    listMock.mockResolvedValue({ rows: [], totalCount: 0 });
  });

  it('list: a resident gets the resident view, with no write, toggle or access sentence', async () => {
    membershipMock.mockResolvedValue(owner);
    canWriteMock.mockReturnValue(false);

    const props = await list({ includeDeleted: 'true' });
    expect(props.view).toBe('resident');
    expect(props).not.toHaveProperty('canWrite');
    expect(props).not.toHaveProperty('deletedToggle');
    expect(props).not.toHaveProperty('about');
  });

  it('list: a manager gets the staff view with "Show deleted" and the generated access sentence', async () => {
    membershipMock.mockResolvedValue(manager);
    canWriteMock.mockReturnValue(true);

    const props = await list({ q: 'pool' });
    expect(props.view).toBe('staff');
    expect(props.canWrite).toBe(true);
    // Off now, so the link turns deleted rows on and keeps the search.
    expect(props.deletedToggle).toEqual({
      showing: false,
      href: '/announcements?c=42&q=pool&deleted=true',
    });
    expect(props.about).toBe(
      'Managers can add and change these. Residents can see only the ones sent to them.',
    );
  });

  it('list: `includeDeleted` shows deleted rows to an admin only', async () => {
    membershipMock.mockResolvedValue(manager);
    canWriteMock.mockReturnValue(true);
    expect((await list({ includeDeleted: 'true' })).deletedToggle).toMatchObject({ showing: true });
  });

  it('list: a non-admin asking for `includeDeleted=true` is not shown deleted rows', async () => {
    membershipMock.mockResolvedValue(owner);
    canWriteMock.mockReturnValue(false);

    const props = await records({ includeDeleted: 'true' });
    expect(props.showDeleted).toBe(false);
    expect(listMock).toHaveBeenCalledWith(42, owner, { query: undefined, includeDeleted: false });
  });

  it('list: an admin asking for `includeDeleted=true` is shown them', async () => {
    membershipMock.mockResolvedValue(manager);
    canWriteMock.mockReturnValue(true);

    const props = await records({ includeDeleted: 'true' });
    expect(props.showDeleted).toBe(true);
    expect(listMock).toHaveBeenCalledWith(42, manager, { query: undefined, includeDeleted: true });
  });

  it('list: a blank search is no search, so an empty list is not "nothing matches"', async () => {
    membershipMock.mockResolvedValue(manager);
    canWriteMock.mockReturnValue(true);

    expect((await records({ q: '  ' })).searchQuery).toBeUndefined();
    expect((await records({ q: ' pool ' })).searchQuery).toBe('pool');
  });

  it('detail: a resident gets the resident view, cannot manage, and is not told the audience', async () => {
    membershipMock.mockResolvedValue(owner);
    canWriteMock.mockReturnValue(false);

    const props = await detail();
    expect(props.view).toBe('resident');
    expect(props.canManage).toBe(false);
    expect(props.audienceLabel).toBeUndefined();
    expect(props).not.toHaveProperty('about');
    // Only an admin may open a deleted post.
    expect(getByIdMock).toHaveBeenCalledWith(42, owner, 17, { includeDeleted: false });
  });

  it('detail: a resident on a board-only post is told so', async () => {
    membershipMock.mockResolvedValue(owner);
    canWriteMock.mockReturnValue(false);
    getByIdMock.mockResolvedValue({ ...row, audience: 'board_only' });

    expect((await detail()).audienceLabel).toBe('label:board_only');
  });

  it('detail: a manager gets the staff view, can manage, sees the audience, and may open a deleted post', async () => {
    membershipMock.mockResolvedValue(manager);
    canWriteMock.mockReturnValue(true);
    getByIdMock.mockResolvedValue({ ...row, deletedAt: new Date('2026-04-11T09:00:00.000Z') });

    const props = await detail();
    expect(props.view).toBe('staff');
    expect(props.canManage).toBe(true);
    expect(props.audienceLabel).toBe('label:all');
    expect((props.announcement as { deletedAt: Date | null }).deletedAt).toBeInstanceOf(Date);
    expect(getByIdMock).toHaveBeenCalledWith(42, manager, 17, { includeDeleted: true });
  });

  it('detail: the author can manage their own post without being an admin', async () => {
    membershipMock.mockResolvedValue(owner);
    canWriteMock.mockReturnValue(false);
    getByIdMock.mockResolvedValue({ ...row, publishedBy: 'user-1' });

    expect((await detail()).canManage).toBe(true);
  });

  it('edit: a deleted announcement has no edit page; it goes to its own page, where Restore is', async () => {
    membershipMock.mockResolvedValue(manager);
    getByIdMock.mockResolvedValue({ ...row, deletedAt: new Date('2026-04-11T09:00:00.000Z') });

    await expect(
      EditAnnouncementRoute({
        params: Promise.resolve({ id: '17' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('redirect:/announcements/17?communityId=42');
  });
});

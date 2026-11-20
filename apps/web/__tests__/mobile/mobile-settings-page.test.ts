/**
 * Mobile Settings page (`/mobile/settings`) — where the profile form's name and
 * phone come from.
 *
 * The form resends name and phone on EVERY save. The page used to read both
 * from the Supabase auth user, whose `phone` is always empty (phones live only
 * in the `users` table) and whose `full_name` metadata goes stale after a
 * manager corrects a name — so any save sent `phone: null`, and
 * `updateUserProfile` cleared the number AND its `phoneVerifiedAt`. These tests
 * pin the source: the `users` row, with the metadata name only as a fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
);
const headersMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const requireMembershipMock = vi.hoisted(() => vi.fn());
const getPrefsMock = vi.hoisted(() => vi.fn());
const getSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUser: requireUserMock,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/services/notification-preferences-service', () => ({
  getNotificationPreferencesForUser: getPrefsMock,
}));
vi.mock('@/lib/services/user-profile-service', () => ({
  getUserProfileSnapshot: getSnapshotMock,
}));
vi.mock('@/lib/db/access-control', () => ({ checkPermissionV2: () => true }));
vi.mock('@/components/mobile/MobileSettingsContent', () => ({
  MobileSettingsContent: () => null,
}));

import MobileSettingsPage from '@/app/mobile/settings/page';

interface ContentProps {
  userName: string | null;
  userEmail: string;
  userPhone: string | null;
  phoneVerified: boolean;
}

async function renderProps(): Promise<ContentProps> {
  const tree = (await MobileSettingsPage()) as { props: ContentProps };
  return tree.props;
}

const AUTH_USER = {
  id: 'user-1',
  email: 'jane@example.com',
  // What Supabase actually returns: no phone, and a name a manager has since
  // corrected in the users table.
  phone: '',
  user_metadata: { full_name: 'Jane Stale' },
};

describe('MobileSettingsPage profile source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ 'x-community-id': '42' }));
    requireUserMock.mockResolvedValue(AUTH_USER);
    requireMembershipMock.mockResolvedValue({
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
    });
    getPrefsMock.mockResolvedValue(null);
  });

  it('pre-fills name and phone from the users row, and reads it for the signed-in user', async () => {
    getSnapshotMock.mockResolvedValue({
      fullName: 'Jane Corrected',
      phone: '+13055550100',
      phoneVerifiedAt: new Date('2026-11-01T12:00:00Z'),
    });

    const props = await renderProps();

    expect(getSnapshotMock).toHaveBeenCalledWith('user-1');
    expect(props.userPhone).toBe('+13055550100');
    expect(props.userName).toBe('Jane Corrected');
    expect(props.phoneVerified).toBe(true);
    expect(props.userEmail).toBe('jane@example.com');
  });

  it('marks a stored but unconfirmed phone as NOT verified', async () => {
    getSnapshotMock.mockResolvedValue({
      fullName: 'Jane Corrected',
      phone: '+13055550100',
      phoneVerifiedAt: null,
    });

    const props = await renderProps();

    expect(props.userPhone).toBe('+13055550100');
    expect(props.phoneVerified).toBe(false);
  });

  it('falls back to the auth metadata name when the users row has none', async () => {
    getSnapshotMock.mockResolvedValue({ fullName: null, phone: null, phoneVerifiedAt: null });

    const props = await renderProps();

    expect(props.userName).toBe('Jane Stale');
    expect(props.userPhone).toBeNull();
    expect(props.phoneVerified).toBe(false);
  });

  it('fails rather than render a form that would save an empty phone', async () => {
    getSnapshotMock.mockRejectedValue(new Error('db down'));

    await expect(MobileSettingsPage()).rejects.toThrow('db down');
  });
});

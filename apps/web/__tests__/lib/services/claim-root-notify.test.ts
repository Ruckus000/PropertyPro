import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createUnscopedClientMock,
  sendEmailMock,
  createNotificationsForEventMock,
  selectMock,
  fromMock,
  innerJoinMock,
  whereMock,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  createNotificationsForEventMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  innerJoinMock: vi.fn(),
  whereMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  userRoles: {
    userId: 'user_roles.user_id',
    role: 'user_roles.role',
    communityId: 'user_roles.community_id',
  },
  users: { id: 'users.id', email: 'users.email', fullName: 'users.full_name' },
  communities: { id: 'communities.id', name: 'communities.name' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  ne: (col: unknown, val: unknown) => ({ __ne: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
}));

vi.mock('@propertypro/email', () => ({
  RootClaimedEmail: (props: unknown) => ({ __email: 'RootClaimedEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: createNotificationsForEventMock,
}));

import { notifyRootClaimed } from '@/lib/services/claim-root-notify';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  createUnscopedClientMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ innerJoin: innerJoinMock, where: whereMock });
  innerJoinMock.mockReturnValue({ where: whereMock });
  sendEmailMock.mockResolvedValue({ id: 'test_1' });
  createNotificationsForEventMock.mockResolvedValue({ created: 1, skipped: 0 });
});

describe('notifyRootClaimed', () => {
  it('emails the OTHER admins (excluding the claimant) and fires in-app notifications', async () => {
    // 1st where(): recipient lookup (other admins)
    whereMock.mockResolvedValueOnce([
      { userId: 'other-1', email: 'a@example.com', fullName: 'Alice' },
      { userId: 'other-2', email: 'b@example.com', fullName: 'Bob' },
    ]);
    // 2nd where().limit(1): claimant name point read
    whereMock.mockReturnValueOnce({ limit: () => Promise.resolve([{ fullName: 'Claire Claimant' }]) });
    // 3rd where().limit(1): community name point read
    whereMock.mockReturnValueOnce({ limit: () => Promise.resolve([{ name: 'Sunset Condos' }]) });

    await notifyRootClaimed(42, 'claimant-user');

    // Email sent to the two other admins (claimant excluded by the query).
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const toAddresses = sendEmailMock.mock.calls.map((c) => c[0].to);
    expect(toAddresses).toEqual(['a@example.com', 'b@example.com']);

    // disputeUrl points at the claim-root dispute screen for this community.
    const firstReact = sendEmailMock.mock.calls[0]![0].react as {
      props: { disputeUrl: string; claimantName: string; communityName: string };
    };
    expect(firstReact.props.disputeUrl).toBe(
      'https://app.example.com/dashboard/claim-root?dispute=42',
    );
    expect(firstReact.props.claimantName).toBe('Claire Claimant');
    expect(firstReact.props.communityName).toBe('Sunset Condos');

    // In-app notifications fire for community admins, excluding the claimant.
    expect(createNotificationsForEventMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ category: 'system' }),
      'community_admins',
      'claimant-user',
    );
  });

  it('does nothing (no email) when there are no other admins', async () => {
    whereMock.mockResolvedValueOnce([]); // no other admins (recipient where() awaited directly)
    whereMock.mockReturnValueOnce({ limit: () => Promise.resolve([{ fullName: 'Claire Claimant' }]) });
    whereMock.mockReturnValueOnce({ limit: () => Promise.resolve([{ name: 'Sunset Condos' }]) });

    await notifyRootClaimed(42, 'claimant-user');

    expect(sendEmailMock).not.toHaveBeenCalled();
    // In-app still fires (the helper self-filters recipients).
    expect(createNotificationsForEventMock).toHaveBeenCalled();
  });
});

/**
 * Who the /audit-trail route lets in, and what it hands the page component.
 * `isAdminRole` and `describeAccess` are the real ones; only the session, the
 * membership lookup and the (client) page component are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock, userMock } = vi.hoisted(() => ({ membershipMock: vi.fn(), userMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: userMock }));
vi.mock('@/lib/request/page-community-context', () => ({ requirePageCommunityMembership: membershipMock }));
vi.mock('@/components/audit/audit-trail-page', () => ({
  AuditTrailPage: (props: unknown) => <div data-testid="audit-page" data-props={JSON.stringify(props)} />,
}));

import AuditTrailRoute from '../../src/app/(authenticated)/audit-trail/page';

function open(params: Record<string, string>) {
  return AuditTrailRoute({ searchParams: Promise.resolve(params) });
}

function membership(role: string, isUnitOwner = false) {
  return { role, isUnitOwner, communityType: 'condo_718', timezone: 'America/Chicago' };
}

beforeEach(() => {
  vi.clearAllMocks();
  userMock.mockResolvedValue('user-1');
});

describe('/audit-trail route', () => {
  it.each(['property_manager', 'root_manager'])('renders the page for a %s, with the generated "about"', async (role) => {
    membershipMock.mockResolvedValue(membership(role));
    render(await open({ communityId: '42' }));
    expect(membershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(JSON.parse(screen.getByTestId('audit-page').dataset.props!)).toEqual({
      communityId: 42,
      timeZone: 'America/Chicago',
      about: 'Managers can see these.',
    });
  });

  it.each([
    ['an owner', true],
    ['a tenant', false],
  ])('sends %s back to the dashboard', async (_who, isUnitOwner) => {
    membershipMock.mockResolvedValue(membership('resident', isUnitOwner));
    await expect(open({ communityId: '42' })).rejects.toThrow('redirect:/dashboard?reason=insufficient-permissions');
  });

  it('sends a signed-out visitor to the login page', async () => {
    userMock.mockRejectedValue(new Error('no session'));
    await expect(open({ communityId: '42' })).rejects.toThrow('redirect:/auth/login');
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it('refuses a missing or malformed community id before any lookup', async () => {
    await expect(open({})).rejects.toThrow('redirect:/dashboard?reason=invalid-selection');
    await expect(open({ communityId: '4.5' })).rejects.toThrow('redirect:/dashboard?reason=invalid-selection');
    expect(userMock).not.toHaveBeenCalled();
  });
});

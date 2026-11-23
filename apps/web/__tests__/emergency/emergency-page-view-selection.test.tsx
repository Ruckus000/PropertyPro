/**
 * Pins which Emergency Alerts view each viewer gets, on the list and the detail
 * page. The real `checkPermissionV2` / `requirePermission` run (pure), so role
 * semantics are not mocked; view components are stubbed with distinct test ids.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock, receivedMock, queryMock, smsGlobalMock } = vi.hoisted(() => ({
  smsGlobalMock: vi.fn(),
  membershipMock: vi.fn(),
  receivedMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolvePageCommunityContext: vi.fn(({ searchParams }: { searchParams: URLSearchParams }) => ({
    communityId: Number(searchParams.get('communityId')) || null,
  })),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: (p: Record<string, string>) => new URLSearchParams(p),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/lib/access/describe-access', () => ({ describeAccess: vi.fn(() => undefined) }));
vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  listBroadcastsForRecipient: receivedMock,
}));
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => ({ query: queryMock })),
  emergencyBroadcasts: {},
  communities: {},
}));
vi.mock('@/lib/sms/dispatch-flag', () => ({ isSmsDispatchGloballyEnabled: smsGlobalMock }));
vi.mock('@/components/emergency/emergency-new-page', () => ({
  EmergencyNewPage: (props: unknown) => (
    <div data-testid="page-new" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/emergency/emergency-list-page', () => ({
  EmergencyListPage: (props: unknown) => (
    <div data-testid="page-list" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/emergency/emergency-detail-page', () => ({
  EmergencyDetailPage: (props: unknown) => (
    <div data-testid="page-detail" data-props={JSON.stringify(props)} />
  ),
}));

import EmergencyPage from '@/app/(authenticated)/emergency/page';
import NewBroadcastPage from '@/app/(authenticated)/emergency/new/page';
import BroadcastDetailPage from '@/app/(authenticated)/emergency/[id]/page';

const NOW = new Date('2026-03-02T02:30:00.000Z');

function member(kind: 'owner' | 'tenant' | 'manager') {
  return {
    role: kind === 'manager' ? 'property_manager' : 'resident',
    isUnitOwner: kind === 'owner',
    isAdmin: kind === 'manager',
    communityType: 'condo_718',
    timezone: 'America/New_York',
  };
}

function propsOf(testId: string): Record<string, unknown> {
  return JSON.parse(screen.getByTestId(testId).getAttribute('data-props')!);
}

describe('EmergencyPage (list) view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    receivedMock.mockReset();
    queryMock.mockReset();
    receivedMock.mockResolvedValue([
      { id: 5, title: 'Water off', severity: 'urgent', completedAt: NOW },
    ]);
    queryMock.mockResolvedValue([
      {
        id: 9,
        title: 'Gas leak',
        severity: 'critical',
        recipientCount: 48,
        sentCount: 48,
        deliveredCount: 40,
        failedCount: 8,
        initiatedAt: NOW,
        completedAt: NOW,
        canceledAt: null,
      },
    ]);
  });

  async function run(kind: 'owner' | 'tenant' | 'manager') {
    membershipMock.mockResolvedValue(member(kind));
    const el = await EmergencyPage({ searchParams: Promise.resolve({ communityId: '1' }) });
    render(el);
  }

  it('gives a non-admin owner the recipient view with no recipient figures and no write flag', async () => {
    await run('owner');
    const props = propsOf('page-list');
    expect(props['view']).toBe('recipient');
    expect(props).not.toHaveProperty('canWrite');
    const rows = props['broadcasts'] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    for (const r of rows) expect(r).not.toHaveProperty('recipientCount');
  });

  it('gives a manager the manager view', async () => {
    await run('manager');
    const props = propsOf('page-list');
    expect(props['view']).toBe('manager');
    expect(props['canWrite']).toBe(true);
  });

  it('refuses a tenant before anything renders', async () => {
    membershipMock.mockResolvedValue(member('tenant'));
    await expect(
      EmergencyPage({ searchParams: Promise.resolve({ communityId: '1' }) }),
    ).rejects.toThrow(/not permitted/i);
    expect(receivedMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('BroadcastDetailPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
  });

  const call = async (communityId?: string) =>
    render(
      await BroadcastDetailPage({
        params: Promise.resolve({ id: '3' }),
        searchParams: Promise.resolve(communityId ? { communityId } : {}),
      }),
    );

  it('tells the page a non-admin is not an admin', async () => {
    membershipMock.mockResolvedValue(member('owner'));
    await call('1');
    const props = propsOf('page-detail');
    expect(props['isAdmin']).toBe(false);
    expect(props['communityId']).toBe(1);
    expect(props['broadcastId']).toBe(3);
  });

  it('tells the page a manager is an admin', async () => {
    membershipMock.mockResolvedValue(member('manager'));
    await call('1');
    expect(propsOf('page-detail')['isAdmin']).toBe(true);
  });

  it('is a 404 when communityId is missing, before any membership is resolved', async () => {
    await expect(call()).rejects.toThrow('notFound');
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it('is a 404 when the id is not a positive integer', async () => {
    await expect(
      BroadcastDetailPage({
        params: Promise.resolve({ id: 'abc' }),
        searchParams: Promise.resolve({ communityId: '1' }),
      }),
    ).rejects.toThrow('notFound');
    expect(membershipMock).not.toHaveBeenCalled();
  });
});

describe('NewBroadcastPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    smsGlobalMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue([{ id: 1, name: 'Sunset Condos' }]);
  });

  const call = async () =>
    render(await NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1' }) }));

  function writer(smsDispatchEnabled: boolean) {
    return { ...member('manager'), smsDispatchEnabled };
  }

  it('smsEnabled is false when the global flag is off', async () => {
    smsGlobalMock.mockReturnValue(false);
    membershipMock.mockResolvedValue(writer(true));
    await call();
    expect(propsOf('page-new')['smsEnabled']).toBe(false);
  });

  it('smsEnabled is false when the community flag is off', async () => {
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue(writer(false));
    await call();
    expect(propsOf('page-new')['smsEnabled']).toBe(false);
  });

  it('smsEnabled is true only when both flags are on', async () => {
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue(writer(true));
    await call();
    expect(propsOf('page-new')['smsEnabled']).toBe(true);
    expect(propsOf('page-new')['communityId']).toBe(1);
  });

  it('refuses a member without write permission before anything renders', async () => {
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue({ ...member('owner'), smsDispatchEnabled: true });
    await expect(
      NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1' }) }),
    ).rejects.toThrow(/not permitted/i);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/**
 * Pins which Emergency Alerts view each viewer gets, on the list and the detail
 * page. The real `checkPermissionV2` / `requirePermission` run (pure), so role
 * semantics are not mocked; view components are stubbed with distinct test ids.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock, receivedMock, queryMock, smsGlobalMock, reportMock } = vi.hoisted(() => ({
  reportMock: vi.fn(),
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
  getBroadcastWithReport: reportMock,
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

  it('gives a manager each alert\'s scheduling fields; a recipient\'s rows carry none', async () => {
    const goesAt = new Date('2026-03-10T13:00:00.000Z');
    queryMock.mockResolvedValue([
      {
        id: 9,
        title: 'Water off',
        severity: 'urgent',
        recipientCount: 48,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        initiatedAt: NOW,
        completedAt: null,
        canceledAt: null,
        scheduledFor: goesAt,
        sendClaimedAt: goesAt,
        sendOutcome: 'missed',
        sendOutcomeReason: 'late',
      },
    ]);
    await run('manager');
    expect((propsOf('page-list')['broadcasts'] as Record<string, unknown>[])[0]).toMatchObject({
      scheduledFor: '2026-03-10T13:00:00.000Z',
      sendClaimedAt: '2026-03-10T13:00:00.000Z',
      sendOutcome: 'missed',
      sendOutcomeReason: 'late',
    });
  });

  it('an immediate alert has null scheduling fields for a manager', async () => {
    await run('manager');
    expect((propsOf('page-list')['broadcasts'] as Record<string, unknown>[])[0]).toMatchObject({
      scheduledFor: null,
      sendClaimedAt: null,
      sendOutcome: null,
      sendOutcomeReason: null,
    });
  });

  it('a recipient is listed only what was sent to them, with no scheduling fields', async () => {
    await run('owner');
    expect(queryMock).not.toHaveBeenCalled();
    for (const r of propsOf('page-list')['broadcasts'] as Record<string, unknown>[]) {
      for (const key of ['scheduledFor', 'sendClaimedAt', 'sendOutcome', 'sendOutcomeReason']) {
        expect(r).not.toHaveProperty(key);
      }
    }
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
    reportMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue([{ id: 1, name: 'Sunset Condos' }]);
  });

  const callFrom = async (from: string | string[]) => {
    smsGlobalMock.mockReturnValue(false);
    membershipMock.mockResolvedValue(writer(false));
    render(await NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1', from }) }));
    return propsOf('page-new');
  };

  it('passes the community time zone to the composer', async () => {
    smsGlobalMock.mockReturnValue(false);
    membershipMock.mockResolvedValue(writer(false));
    await call();
    expect(propsOf('page-new')['timeZone']).toBe('America/New_York');
    expect(propsOf('page-new')).not.toHaveProperty('source');
    expect(reportMock).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-3', '1.5', '7abc', ' 7', '', '99999999999999999999'])(
    'from=%j is malformed: nothing is looked up and the empty composer renders',
    async (from) => {
      const props = await callFrom(from);
      expect(reportMock).not.toHaveBeenCalled();
      expect(props).not.toHaveProperty('source');
    },
  );

  it('a repeated from parameter is ignored', async () => {
    const props = await callFrom(['7', '8']);
    expect(reportMock).not.toHaveBeenCalled();
    expect(props).not.toHaveProperty('source');
  });

  it('from an id this community does not have (foreign or missing): the empty composer renders', async () => {
    reportMock.mockResolvedValue(null);
    const props = await callFrom('99');
    // Looked up through THIS community only; another community's alert is not found.
    expect(reportMock).toHaveBeenCalledWith(99, 1);
    expect(props).not.toHaveProperty('source');
  });

  it('a lookup that throws is ignored too', async () => {
    reportMock.mockRejectedValue(new Error('db down'));
    const props = await callFrom('99');
    expect(props).not.toHaveProperty('source');
  });

  it('from a readable alert: the composer gets its six copied fields and nothing else', async () => {
    reportMock.mockResolvedValue({
      id: 7,
      communityId: 1,
      title: 'Pool closed',
      body: 'The pool is closed.',
      smsBody: 'Pool closed.',
      severity: 'urgent',
      templateKey: 'pool',
      targetAudience: 'owners_only',
      channels: ['email'],
      recipientCount: 3,
      initiatedBy: 'user-9',
      recipients: [{ userId: 'user-2', email: 'pat@example.com', fullName: 'Pat Resident' }],
    });
    const props = await callFrom('7');
    expect(reportMock).toHaveBeenCalledWith(7, 1);
    expect(props['source']).toEqual({
      title: 'Pool closed',
      body: 'The pool is closed.',
      smsBody: 'Pool closed.',
      severity: 'urgent',
      targetAudience: 'owners_only',
      channels: ['email'],
    });
  });

  it('does not look anything up for a member without write permission', async () => {
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue({ ...member('owner'), smsDispatchEnabled: true });
    await expect(
      NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1', from: '7' }) }),
    ).rejects.toThrow(/not permitted/i);
    expect(reportMock).not.toHaveBeenCalled();
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

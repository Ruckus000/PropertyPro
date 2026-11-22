/**
 * Pins which Emergency Alerts view each viewer gets, on the list and the detail
 * page. The real `checkPermissionV2` / `requirePermission` run (pure), so role
 * semantics are not mocked; view components are stubbed with distinct test ids.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { membershipMock, previewMock, receivedMock, queryMock, smsGlobalMock } = vi.hoisted(() => ({
  smsGlobalMock: vi.fn(),
  membershipMock: vi.fn(),
  previewMock: vi.fn(),
  receivedMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
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
vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: previewMock }));
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
    <div data-testid="pilot-new" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/emergency/BroadcastComposer', () => ({
  BroadcastComposer: () => <div data-testid="old-composer" />,
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/emergency/emergency-list-page', () => ({
  EmergencyListPage: (props: unknown) => (
    <div data-testid="pilot-list" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/emergency/BroadcastHistoryTable', () => ({
  BroadcastHistoryTable: (props: { showDelivery?: boolean }) => (
    <div data-testid="old-table" data-show-delivery={String(props.showDelivery)} />
  ),
}));
vi.mock('@/components/emergency/emergency-detail-page', () => ({
  EmergencyDetailPage: (props: unknown) => (
    <div data-testid="pilot-detail" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/app/(authenticated)/emergency/[id]/broadcast-detail-client', () => ({
  BroadcastDetailClient: () => <div data-testid="old-detail" />,
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
    previewMock.mockReset();
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

  async function run(kind: 'owner' | 'tenant' | 'manager', preview: boolean) {
    membershipMock.mockResolvedValue(member(kind));
    previewMock.mockResolvedValue(preview);
    const el = await EmergencyPage({ searchParams: Promise.resolve({ communityId: '1' }) });
    render(el);
  }

  it('gives a non-admin owner the recipient view with no recipient figures and no write flag', async () => {
    await run('owner', true);
    const props = propsOf('pilot-list');
    expect(props['view']).toBe('recipient');
    expect(props).not.toHaveProperty('canWrite');
    const rows = props['broadcasts'] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    for (const r of rows) expect(r).not.toHaveProperty('recipientCount');
  });

  it('gives a manager the manager view', async () => {
    await run('manager', true);
    const props = propsOf('pilot-list');
    expect(props['view']).toBe('manager');
    expect(props['canWrite']).toBe(true);
  });

  it('gives an owner the old table without delivery columns when the gate is off', async () => {
    await run('owner', false);
    expect(screen.getByTestId('old-table')).toHaveAttribute('data-show-delivery', 'false');
    expect(screen.queryByTestId('pilot-list')).toBeNull();
  });

  it('gives a manager the old table when the gate is off', async () => {
    await run('manager', false);
    expect(screen.getByTestId('old-table')).toHaveAttribute('data-show-delivery', 'undefined');
    expect(screen.queryByTestId('pilot-list')).toBeNull();
  });

  it('refuses a tenant before anything renders', async () => {
    membershipMock.mockResolvedValue(member('tenant'));
    previewMock.mockResolvedValue(true);
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
    previewMock.mockReset();
  });

  const call = async (communityId?: string) =>
    render(
      await BroadcastDetailPage({
        params: Promise.resolve({ id: '3' }),
        searchParams: Promise.resolve(communityId ? { communityId } : {}),
      }),
    );

  it('renders the old client and resolves no membership when the gate is off', async () => {
    previewMock.mockResolvedValue(false);
    await call('1');
    expect(screen.getByTestId('old-detail')).toBeInTheDocument();
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it('tells the pilot a non-admin is not an admin', async () => {
    previewMock.mockResolvedValue(true);
    membershipMock.mockResolvedValue(member('owner'));
    await call('1');
    const props = propsOf('pilot-detail');
    expect(props['isAdmin']).toBe(false);
    expect(props['communityId']).toBe(1);
    expect(props['broadcastId']).toBe(3);
  });

  it('tells the pilot a manager is an admin', async () => {
    previewMock.mockResolvedValue(true);
    membershipMock.mockResolvedValue(member('manager'));
    await call('1');
    expect(propsOf('pilot-detail')['isAdmin']).toBe(true);
  });

  it('falls back to the old client when communityId is missing', async () => {
    previewMock.mockResolvedValue(true);
    await call();
    expect(screen.getByTestId('old-detail')).toBeInTheDocument();
    expect(membershipMock).not.toHaveBeenCalled();
  });
});

describe('NewBroadcastPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    previewMock.mockReset();
    smsGlobalMock.mockReset();
    queryMock.mockReset();
    queryMock.mockResolvedValue([{ id: 1, name: 'Sunset Condos' }]);
  });

  const call = async () =>
    render(await NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1' }) }));

  function writer(smsDispatchEnabled: boolean) {
    return { ...member('manager'), smsDispatchEnabled };
  }

  it('gate on: smsEnabled is false when the global flag is off', async () => {
    previewMock.mockResolvedValue(true);
    smsGlobalMock.mockReturnValue(false);
    membershipMock.mockResolvedValue(writer(true));
    await call();
    expect(propsOf('pilot-new')['smsEnabled']).toBe(false);
  });

  it('gate on: smsEnabled is false when the community flag is off', async () => {
    previewMock.mockResolvedValue(true);
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue(writer(false));
    await call();
    expect(propsOf('pilot-new')['smsEnabled']).toBe(false);
  });

  it('gate on: smsEnabled is true only when both flags are on', async () => {
    previewMock.mockResolvedValue(true);
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue(writer(true));
    await call();
    expect(propsOf('pilot-new')['smsEnabled']).toBe(true);
    expect(propsOf('pilot-new')['communityId']).toBe(1);
  });

  it('refuses a member without write permission before anything renders', async () => {
    previewMock.mockResolvedValue(true);
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue({ ...member('owner'), smsDispatchEnabled: true });
    await expect(
      NewBroadcastPage({ searchParams: Promise.resolve({ communityId: '1' }) }),
    ).rejects.toThrow(/not permitted/i);
    expect(queryMock).not.toHaveBeenCalled();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('gate off: renders the old composer directly', async () => {
    previewMock.mockResolvedValue(false);
    smsGlobalMock.mockReturnValue(true);
    membershipMock.mockResolvedValue(writer(true));
    await call();
    expect(screen.getByTestId('old-composer')).toBeInTheDocument();
    expect(screen.queryByTestId('pilot-new')).toBeNull();
  });
});

/**
 * The printable audit record writes an audit entry each time it is produced,
 * so its gates must turn a request away BEFORE anything is read or logged:
 * a lapsed subscription (the API's requireEntitledForAdminRead, as a redirect),
 * and a navigation started by another site (which could otherwise make a
 * signed-in manager's browser write entries).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildMock, headersRef, membershipRef } = vi.hoisted(() => ({
  buildMock: vi.fn(),
  headersRef: { value: new Headers() },
  membershipRef: { value: {} as Record<string, unknown> },
}));

class Redirected extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => headersRef.value }));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: async () => 'user-1' }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: async () => membershipRef.value,
}));
vi.mock('@/lib/services/audit-trail-service', () => ({
  AUDIT_PRINT_MAX_ENTRIES: 1000,
  buildAuditPrintRecord: buildMock,
}));
vi.mock('@/components/audit/AuditPrintActions', () => ({ AuditPrintActions: () => null }));

import AuditPrintPage from '../../src/app/(print)/audit-trail/print/page';

function activeManager(overrides: Record<string, unknown> = {}) {
  return {
    role: 'property_manager',
    isAdmin: true,
    timezone: 'America/New_York',
    communityName: 'Sunset Condos',
    city: 'Miami',
    state: 'FL',
    subscriptionStatus: 'active',
    subscriptionCanceledAt: null,
    freeAccessExpiresAt: null,
    ...overrides,
  };
}

async function open(search: Record<string, string>) {
  try {
    await AuditPrintPage({ searchParams: Promise.resolve(search) });
    return null;
  } catch (err) {
    if (err instanceof Redirected) return err.url;
    throw err;
  }
}

describe('audit print page gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersRef.value = new Headers({ 'sec-fetch-site': 'same-origin' });
    membershipRef.value = activeManager();
    buildMock.mockResolvedValue({ entries: [], users: {}, resources: {}, truncated: false, scopeLabel: null });
  });

  it('produces the record for an active manager on a same-site request', async () => {
    expect(await open({ communityId: '7' })).toBeNull();
    expect(buildMock).toHaveBeenCalledTimes(1);
  });

  it('sends a lapsed community away before reading or logging anything', async () => {
    membershipRef.value = activeManager({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2025-01-01T00:00:00Z'),
    });
    expect(await open({ communityId: '7' })).toBe('/dashboard?communityId=7&reason=subscription-lapsed');
    expect(buildMock).not.toHaveBeenCalled();
  });

  it('turns away a navigation started by another site, without logging', async () => {
    headersRef.value = new Headers({ 'sec-fetch-site': 'cross-site' });
    expect(await open({ communityId: '7', view: 'all' })).toBe('/audit-trail?communityId=7&view=all');
    expect(buildMock).not.toHaveBeenCalled();
  });

  it('never passes text from the link into the record', async () => {
    await open({ communityId: '7', label: 'Forged headline' });
    expect(JSON.stringify(buildMock.mock.calls[0])).not.toContain('Forged headline');
  });
});

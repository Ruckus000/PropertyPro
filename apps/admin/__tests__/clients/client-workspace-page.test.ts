import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND');
});

const createAdminClientMock = vi.fn();
const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'admin@getpropertypro.com',
  role: 'super_admin' as const,
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

// AUTHZ: this page re-asserts the platform-admin identity before touching the
// service-role client. Mocked here so the page can render outside a request
// scope (the real helper reads forwarded headers via next/headers).
vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/components/clients/ClientWorkspace', () => ({
  ClientWorkspace: (props: unknown) => ({ __clientWorkspaceProps: props }),
}));

type Chain = {
  select: (...args: unknown[]) => Chain;
  eq: (...args: unknown[]) => Chain;
  is: (...args: unknown[]) => Chain;
  order: (...args: unknown[]) => Chain;
  limit: (...args: unknown[]) => Chain;
  // `getCommunitySnapshots` asks a second, narrow question —
  // `.select('id').in('id', ids).not('snapshot', 'is', null)` — so `restorable`
  // never pulls a snapshot payload. This stub answers any filter with the same
  // fixture; the projection/filter assertions live in
  // `community-snapshots.test.ts`.
  in?: (...args: unknown[]) => Chain;
  not?: (...args: unknown[]) => Chain;
  single?: () => Promise<{ data: unknown; error?: unknown }>;
  then?: PromiseLike<unknown>['then'];
};

/** A resolved `{ data, error: null }` chain — every fluent method is a no-op returning itself. */
function resolvedChain(result: { data: unknown; count?: number }): Chain {
  const resolved = Promise.resolve({ ...result, error: null });
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    in: () => chain,
    not: () => chain,
  };
  chain.then = resolved.then.bind(resolved);
  return chain;
}

function makeDb() {
  const community = {
    id: 42,
    name: 'Sunset Condos',
    slug: 'sunset-condos',
    community_type: 'condo_718',
    city: 'Miami',
    state: 'FL',
    zip_code: '33101',
    address_line1: '123 Ocean Dr',
    timezone: 'America/New_York',
    subscription_status: 'active',
    subscription_plan: 'starter',
    subscription_current_period_end_at: '2026-04-01T00:00:00.000Z',
    custom_domain: 'portal.sunsetcondo.org',
    custom_domain_status: 'active',
    custom_domain_verified_at: '2026-02-01T00:00:00.000Z',
    site_published_at: '2026-03-26T12:00:00.000Z',
    transparency_enabled: true,
    community_settings: null,
    created_at: '2026-03-20T00:00:00.000Z',
    is_demo: false,
  };

  const counts = {
    members: 12,
    documents: 34,
  };

  const complianceRows = [
    { document_id: 1001, deadline: null, is_applicable: true },
    { document_id: null, deadline: null, is_applicable: true },
    { document_id: null, deadline: null, is_applicable: false },
  ];

  const deletionRows = [{ id: 7, status: 'cooling', cooling_ends_at: '2026-04-10T00:00:00.000Z' }];

  const activityRows = [
    {
      id: 1,
      action: 'community_settings_changed',
      resource_type: 'community',
      resource_id: '42',
      admin_email: 'admin@getpropertypro.com',
      created_at: '2026-03-25T00:00:00.000Z',
    },
  ];

  const snapshotRows = [
    {
      id: 5,
      published_at: '2026-03-20T00:00:00.000Z',
      change_count: 2,
      change_labels: ['Hero updated'],
      snapshot: { version: 2, pages: [], blocks: [] },
    },
  ];

  const from = vi.fn((table: string): Chain => {
    if (table === 'communities') {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: community }),
      };
      return chain;
    }

    if (table === 'user_roles') {
      return resolvedChain({ data: null, count: counts.members });
    }

    if (table === 'documents') {
      return resolvedChain({ data: null, count: counts.documents });
    }

    if (table === 'compliance_checklist_items') {
      return resolvedChain({ data: complianceRows });
    }

    if (table === 'account_deletion_requests') {
      return resolvedChain({ data: deletionRows });
    }

    if (table === 'platform_admin_audit_log') {
      return resolvedChain({ data: activityRows });
    }

    if (table === 'site_publish_snapshots') {
      return resolvedChain({ data: snapshotRows });
    }

    throw new Error(`makeDb(): no fixture registered for table "${table}"`);
  });

  return { from };
}

describe('ClientWorkspacePage data pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockReturnValue(makeDb());
  });

  it('passes custom_domain and site_published_at through to ClientWorkspace', async () => {
    const { default: ClientWorkspacePage } = await import('@/app/(console)/clients/[id]/page');

    // The (console) route-group layout renders the shell now, so the page
    // returns the ClientWorkspace element itself rather than a wrapper.
    const pageElement = await ClientWorkspacePage({ params: Promise.resolve({ id: '42' }) }) as {
      props?: { community?: Record<string, unknown> };
    };

    const community = pageElement.props?.community;
    expect(community).toBeDefined();

    expect(community?.custom_domain).toBe('portal.sunsetcondo.org');
    expect(community?.custom_domain_status).toBe('active');
    expect(community?.custom_domain_verified_at).toBe('2026-02-01T00:00:00.000Z');
    expect(community?.site_published_at).toBe('2026-03-26T12:00:00.000Z');
    expect(community?.memberCount).toBe(12);
    expect(community?.documentCount).toBe(34);
    expect(community?.complianceScore).toBe(50);
    expect(community?.community_settings).toEqual({});
    expect(community?.subscription_current_period_end_at).toBe('2026-04-01T00:00:00.000Z');
    expect(community?.openDeletionRequest).toEqual({
      id: 7,
      status: 'cooling',
      coolingEndsAt: '2026-04-10T00:00:00.000Z',
    });
    expect(community?.activity).toEqual([
      {
        id: 1,
        action: 'community_settings_changed',
        resourceType: 'community',
        resourceId: '42',
        adminEmail: 'admin@getpropertypro.com',
        createdAt: '2026-03-25T00:00:00.000Z',
      },
    ]);
    expect(community?.snapshots).toEqual([
      {
        id: 5,
        publishedAt: '2026-03-20T00:00:00.000Z',
        changeCount: 2,
        changeLabels: ['Hero updated'],
        restorable: true,
      },
    ]);
  });

  it('calls notFound for invalid id', async () => {
    const { default: ClientWorkspacePage } = await import('@/app/(console)/clients/[id]/page');

    await expect(ClientWorkspacePage({ params: Promise.resolve({ id: 'abc' }) })).rejects.toThrow('NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  // AUTHZ regression guard: this page reads a full tenant record with the
  // service-role client (RLS-bypassing). It shipped with no per-page auth check
  // at all, relying solely on the middleware matcher. Deleting the
  // requireAdminPageSession() call must fail here.
  it('asserts platform-admin identity before reading tenant data', async () => {
    const { default: ClientWorkspacePage } = await import('@/app/(console)/clients/[id]/page');

    await ClientWorkspacePage({ params: Promise.resolve({ id: '42' }) });

    expect(requireAdminPageSessionMock).toHaveBeenCalled();
  });

  it('does not touch the service-role client when the admin check rejects', async () => {
    requireAdminPageSessionMock.mockRejectedValueOnce(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' }),
    );
    const { default: ClientWorkspacePage } = await import('@/app/(console)/clients/[id]/page');

    await expect(
      ClientWorkspacePage({ params: Promise.resolve({ id: '42' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});

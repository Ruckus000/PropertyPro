import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND');
});

const createAdminClientMock = vi.fn();
const getCoolingDeletionRequestCountMock = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/server/deletion-requests', () => ({
  getCoolingDeletionRequestCount: getCoolingDeletionRequestCountMock,
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/clients/ClientWorkspace', () => ({
  ClientWorkspace: (props: unknown) => ({ __clientWorkspaceProps: props }),
}));

type Chain = {
  select: (...args: unknown[]) => Chain;
  eq: (...args: unknown[]) => Chain;
  is: (...args: unknown[]) => Chain;
  single?: () => Promise<{ data: unknown; error?: unknown }>;
  then?: PromiseLike<unknown>['then'];
};

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
    custom_domain: 'portal.sunsetcondo.org',
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

  const from = vi.fn((table: string): Chain => {
    if (table === 'communities') {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: async () => ({ data: community }),
      };
      return chain;
    }

    if (table === 'user_roles') {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
      };
      chain.then = Promise.resolve({ count: counts.members }).then.bind(Promise.resolve({ count: counts.members }));
      return chain;
    }

    if (table === 'documents') {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
      };
      chain.then = Promise.resolve({ count: counts.documents }).then.bind(Promise.resolve({ count: counts.documents }));
      return chain;
    }

    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
    };
    chain.then = Promise.resolve({ data: complianceRows }).then.bind(Promise.resolve({ data: complianceRows }));
    return chain;
  });

  return { from };
}

describe('ClientWorkspacePage data pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockReturnValue(makeDb());
    getCoolingDeletionRequestCountMock.mockResolvedValue(5);
  });

  it('passes custom_domain and site_published_at through to ClientWorkspace', async () => {
    const { default: ClientWorkspacePage } = await import('@/app/clients/[id]/page');

    const pageElement = await ClientWorkspacePage({ params: Promise.resolve({ id: '42' }) }) as {
      props?: { children?: { props?: { community?: Record<string, unknown> } } };
    };

    const community = pageElement.props?.children?.props?.community;
    expect(community).toBeDefined();

    expect(community?.custom_domain).toBe('portal.sunsetcondo.org');
    expect(community?.site_published_at).toBe('2026-03-26T12:00:00.000Z');
    expect(community?.memberCount).toBe(12);
    expect(community?.documentCount).toBe(34);
    expect(community?.complianceScore).toBe(50);
    expect(community?.community_settings).toEqual({});
  });

  it('calls notFound for invalid id', async () => {
    const { default: ClientWorkspacePage } = await import('@/app/clients/[id]/page');

    await expect(ClientWorkspacePage({ params: Promise.resolve({ id: 'abc' }) })).rejects.toThrow('NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });
});

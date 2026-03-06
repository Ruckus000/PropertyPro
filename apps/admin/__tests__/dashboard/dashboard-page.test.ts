import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment, type ReactNode } from 'react';

interface QueryError {
  message: string;
}

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: QueryError | null;
}

interface DashboardProps {
  stats: {
    activeClients: number;
    activeDemos: number;
    staleDemos: number;
    newClientsThisMonth: number;
    pastDueCount: number;
  };
  actionItems: {
    staleDemos: Record<string, unknown>[];
    pastDueCommunities: Record<string, unknown>[];
  };
  activityFeed: Array<{
    id: string;
    label: string;
    action: string;
    timestamp: string;
    href: string;
    type: 'community' | 'demo';
  }>;
  pipeline: {
    demos: number;
    active: number;
  };
}

const {
  requirePlatformAdminMock,
  createAdminClientMock,
  dashboardComponentMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  dashboardComponentMock: vi.fn(() => null),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
}));

vi.mock('@/components/dashboard/Dashboard', () => ({
  Dashboard: dashboardComponentMock,
}));

type DashboardPageModule = typeof import('../../src/app/dashboard/page');

let DashboardPage: DashboardPageModule['default'];

function createQuery(result: QueryResult) {
  const promise = Promise.resolve(result);
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    lt: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };

  return query;
}

function createDbMock(results: QueryResult[]) {
  const queue = [...results];

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const result = queue.shift();
        if (!result) {
          throw new Error('Unexpected dashboard query');
        }

        return createQuery(result);
      }),
    })),
  };
}

describe('DashboardPage', () => {
  beforeAll(async () => {
    Object.assign(globalThis, {
      React: { createElement, Fragment },
    });

    ({ default: DashboardPage } = await import('../../src/app/dashboard/page'));
  });

  beforeEach(() => {
    vi.clearAllMocks();

    requirePlatformAdminMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@propertyprofl.com',
      role: 'super_admin' as const,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a platform admin session and normalizes errored sections to empty arrays', async () => {
    createAdminClientMock.mockReturnValue(
      createDbMock([
        { data: null, error: { message: 'communities failed' } },
        {
          data: [
            {
              id: 1,
              prospect_name: 'Sunrise Demo',
              template_type: 'condo_718',
              created_at: '2026-03-01T00:00:00.000Z',
            },
          ],
          error: null,
        },
        { data: null, error: { message: 'stale demos failed' } },
        {
          data: [{ id: 2, name: 'New Client', created_at: '2026-03-03T00:00:00.000Z' }],
          error: null,
        },
        { data: null, error: { message: 'past due failed' } },
        {
          data: [{ id: 3, name: 'Harbor Club', updated_at: '2026-03-04T00:00:00.000Z' }],
          error: null,
        },
        { data: null, error: { message: 'recent demos failed' } },
      ]),
    );

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const element = await DashboardPage();
    renderToStaticMarkup(element);

    expect(requirePlatformAdminMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Dashboard] Failed to load communities:',
      { message: 'communities failed' },
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Dashboard] Failed to load stale demos:',
      { message: 'stale demos failed' },
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Dashboard] Failed to load past-due communities:',
      { message: 'past due failed' },
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Dashboard] Failed to load recent demos:',
      { message: 'recent demos failed' },
    );

    const props = dashboardComponentMock.mock.calls[0]?.[0] as DashboardProps | undefined;
    expect(props).toBeDefined();
    expect(props).toMatchObject({
      stats: {
        activeClients: 0,
        activeDemos: 1,
        staleDemos: 0,
        newClientsThisMonth: 1,
        pastDueCount: 0,
      },
      actionItems: {
        staleDemos: [],
        pastDueCommunities: [],
      },
      pipeline: {
        demos: 1,
        active: 0,
      },
    });
    expect(props?.activityFeed).toEqual([
      {
        type: 'community',
        id: 'community-3',
        label: 'Harbor Club',
        action: 'updated',
        timestamp: '2026-03-04T00:00:00.000Z',
        href: '/clients/3',
      },
    ]);
  });
});

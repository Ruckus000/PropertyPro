import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `?thread=` is how the inbox's privacy context strip deep-links here, and it
 * carries the thread ID precisely so the participant's email never enters a URL
 * (Vercel access logs, browser history, Sentry navigation breadcrumbs — none of
 * which redact a bare `q=<email>`). That only works if the PAGE resolves the
 * email server-side, which is what these cases pin.
 */
const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'admin@getpropertypro.com',
  role: 'super_admin' as const,
}));
const getDeletionRequestsDataMock = vi.fn(async () => ({ requests: [] }));
const getThreadDetailMock = vi.fn();

// AUTHZ: the page re-asserts the platform-admin identity before any read.
// Mocked so the page can render outside a request scope.
vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));
vi.mock('@/lib/server/deletion-requests', () => ({
  getDeletionRequestsData: getDeletionRequestsDataMock,
}));
vi.mock('@/lib/server/inbox', () => ({
  getThreadDetail: getThreadDetailMock,
}));

const DashboardStub = (props: unknown) => props;
vi.mock('@/components/deletion-requests/DeletionRequestsDashboard', () => ({
  DeletionRequestsDashboard: DashboardStub,
}));
vi.mock('@propertypro/ui', () => ({
  PageBody: (props: unknown) => props,
}));
vi.mock('@/components/shell/AdminPageHeader', () => ({
  AdminPageHeader: (props: unknown) => props,
}));

type Element = { type?: unknown; props?: Record<string, unknown> };

/** The props the page handed the dashboard, wherever it sits in the tree. */
function findDashboardProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findDashboardProps(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as Element;
  if (element.type === DashboardStub) return element.props ?? {};
  return element.props ? findDashboardProps(element.props.children) : null;
}

async function renderPage(searchParams: { q?: string; thread?: string }) {
  const { default: DeletionRequestsPage } = await import(
    '@/app/(console)/deletion-requests/page'
  );
  const tree = await DeletionRequestsPage({ searchParams: Promise.resolve(searchParams) });
  const props = findDashboardProps(tree);
  // Anti-vacuity: a page that stopped rendering the dashboard would otherwise
  // make every `initialEmailFilter` assertion below pass by reading undefined.
  expect(props, 'the page did not render DeletionRequestsDashboard').not.toBeNull();
  return props as Record<string, unknown>;
}

describe('DeletionRequestsPage filter seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeletionRequestsDataMock.mockResolvedValue({ requests: [] });
  });

  it('resolves a ?thread= id to the participant email server-side', async () => {
    getThreadDetailMock.mockResolvedValue({
      thread: { id: 77, participantEmail: 'subject@example.com' },
      messages: [],
    });

    const props = await renderPage({ thread: '77' });

    expect(getThreadDetailMock).toHaveBeenCalledWith(77);
    expect(props.initialEmailFilter).toBe('subject@example.com');
  });

  it('renders unfiltered when the thread does not resolve', async () => {
    getThreadDetailMock.mockResolvedValue(null);

    const props = await renderPage({ thread: '404' });

    expect(getThreadDetailMock).toHaveBeenCalledWith(404);
    expect(props.initialEmailFilter).toBeUndefined();
  });

  it('does not read a thread for an unparseable or non-positive id', async () => {
    for (const thread of ['abc', '0', '-3', '1.5', '']) {
      vi.clearAllMocks();
      const props = await renderPage({ thread });
      expect(getThreadDetailMock, `thread=${thread}`).not.toHaveBeenCalled();
      expect(props.initialEmailFilter).toBeUndefined();
    }
  });

  it('keeps ?q= working as the operator-typed filter, without touching the inbox', async () => {
    const props = await renderPage({ q: 'typed@example.com' });

    expect(props.initialEmailFilter).toBe('typed@example.com');
    expect(getThreadDetailMock).not.toHaveBeenCalled();
  });
});

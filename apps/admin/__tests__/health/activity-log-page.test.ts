/**
 * `/health/logs` — the decisions the PAGE makes, above the list component.
 *
 * Three of them, each a defect found in review:
 *
 * - the header's "Newest first" action used to point at the bare base path,
 *   so its only effect with no cursor was to discard every filter in force —
 *   a destructive action behind a label that promises a change of position.
 * - `positiveInt` returned a bare `undefined` for both "absent" and "invalid",
 *   so `?communityId=abc` widened an audit view from one community to the whole
 *   platform with nothing on screen saying so.
 * - a cursor had to reach the list as its own signal, because an exhausted
 *   `?before=` is neither an empty log nor a filter that matched nothing.
 *
 * The page is an async Server Component, so these await it and read the returned
 * element tree — the shape `client-workspace-page.test.ts` established.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'admin@getpropertypro.com',
  role: 'super_admin' as const,
}));

// AUTHZ: the page re-asserts the platform-admin identity before any read.
// Mocked so it can render outside a request scope (the real helper reads
// forwarded headers via next/headers).
vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));

const getAdminActivityMock = vi.fn(async (_filters?: unknown) => ({
  entries: [] as unknown[],
  nextCursor: null as number | null,
}));
vi.mock('@/lib/server/admin-activity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAdminActivity: (f?: unknown) => getAdminActivityMock(f as never),
}));

type El = { props?: Record<string, unknown> };

/** `<PageBody>` wraps `[AdminPageHeader, ActivityLogList]`. */
async function renderPage(search: Record<string, string | string[] | undefined>) {
  const { default: HealthLogsPage } = await import('@/app/(console)/health/logs/page');
  const tree = (await HealthLogsPage({ searchParams: Promise.resolve(search) })) as {
    props: { children: El[] };
  };
  // Destructured positionally rather than searched by type: if the page ever
  // stops returning exactly [AdminPageHeader, ActivityLogList], these assertions
  // should fail loudly rather than quietly measure the wrong element.
  const [header, list] = tree.props.children;
  if (!header || !list) throw new Error('Expected the page to render a header and a list');
  return { header: header.props ?? {}, list: list.props ?? {} };
}

beforeEach(() => {
  getAdminActivityMock.mockResolvedValue({ entries: [], nextCursor: null });
});

describe('/health/logs search params', () => {
  it('gates on a platform-admin session before reading anything', async () => {
    await renderPage({});
    expect(requireAdminPageSessionMock).toHaveBeenCalled();
  });

  it('passes parsed filters and the cursor through to the reader', async () => {
    await renderPage({ action: 'demo_deleted', admin: 'ops@x.com', communityId: '4', before: '9' });
    expect(getAdminActivityMock).toHaveBeenCalledWith({
      action: 'demo_deleted',
      admin: 'ops@x.com',
      communityId: 4,
      before: 9,
      pageSize: 100,
    });
  });

  // The header action, when there is nowhere to go back to, could only ever
  // have cleared the filters. It is now simply absent.
  it('renders no "Newest first" action on the first page', async () => {
    const { header } = await renderPage({ action: 'demo_deleted' });
    expect(header.actions).toBeUndefined();
  });

  it('renders "Newest first" only with a cursor, and KEEPS the filters', async () => {
    const { header } = await renderPage({ action: 'demo_deleted', before: '9' });
    const action = header.actions as { props: { href: string } };
    expect(action.props.href).toBe('/health/logs?action=demo_deleted');
  });

  it('tells the list a cursor is in force', async () => {
    expect((await renderPage({ before: '9' })).list.hasCursor).toBe(true);
    expect((await renderPage({})).list.hasCursor).toBe(false);
  });

  // Silently widening an audit view is the dangerous direction to fail in.
  it('reports a communityId that was present but unusable', async () => {
    const { list } = await renderPage({ communityId: 'abc' });
    expect(list.rejected).toEqual(['communityId']);
    // ...and the query runs unfiltered, which is exactly why it must be said.
    expect(getAdminActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: undefined }),
    );
  });

  it('reports an unusable cursor too', async () => {
    expect((await renderPage({ before: 'abc' })).list.rejected).toEqual(['before']);
  });

  it('reports both, in URL order', async () => {
    const { list } = await renderPage({ communityId: '-1', before: '0' });
    expect(list.rejected).toEqual(['communityId', 'before']);
  });

  // Community ids are bigserial, so they start at 1 — 0 can only be a mistake,
  // and it is now a reported one rather than a silent platform-wide view.
  it('rejects communityId 0 rather than dropping it silently', async () => {
    const { list } = await renderPage({ communityId: '0' });
    expect(list.rejected).toEqual(['communityId']);
  });

  it('reports nothing when no filter param is present at all', async () => {
    expect((await renderPage({})).list.rejected).toEqual([]);
  });

  // `Number('12abc')` is NaN where `parseInt` would answer 12 — a different
  // question than the URL asked.
  it('refuses a trailing-garbage number instead of coercing it', async () => {
    const { list } = await renderPage({ communityId: '12abc' });
    expect(list.rejected).toEqual(['communityId']);
  });
});

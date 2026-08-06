import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND');
});
const requireAdminPageSessionMock = vi.fn();
const getDemoByIdMock = vi.fn();
const decryptDemoTokenSecretMock = vi.fn();
const generateDemoTokenMock = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));

vi.mock('@/lib/db/demo-queries', () => ({
  getDemoById: getDemoByIdMock,
}));

vi.mock('@propertypro/shared/server', () => ({
  decryptDemoTokenSecret: decryptDemoTokenSecretMock,
  generateDemoToken: generateDemoTokenMock,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

// This test asserts only the props the page HANDS to TabbedPreviewClient, so it
// never needs the real component. Loading it is expensive and was the cause of
// intermittent 5s timeouts: TabbedPreviewClient pulls the whole
// `@propertypro/ui` barrel (tokens + primitives + components + hooks) plus
// DemoEditDrawer and ConvertDemoDialog, and vitest.config.ts inlines
// `@propertypro/ui`, so that graph is transformed at test time. In isolation it
// cost ~1s; with the full admin suite competing for CPU it crossed the 5000ms
// default and randomly reddened CI.
//
// The stub keeps the assertion intact: React.createElement records the props on
// the element regardless of what the component type does with them.
vi.mock('@/app/demo/[id]/preview/TabbedPreviewClient', () => ({
  TabbedPreviewClient: function TabbedPreviewClientStub() {
    return null;
  },
}));

// The page reads exactly one constant from the `@propertypro/shared` barrel,
// which vitest resolves to packages/shared/src — ~190KB of modules plus zod,
// all transformed for that one lookup. This was the DOMINANT cost: mocking it
// took the worst full-suite time from 4129ms to 496ms.
//
// WARNING: this is a bare factory, so it replaces the ENTIRE barrel. If the
// page ever imports another symbol from `@propertypro/shared`, it arrives here
// as `undefined` rather than failing loudly — add it below when that happens.
// Values mirror packages/shared/src/index.ts:20 exactly; a drifted stub would
// be worse than no stub.
//
// `@/lib/demo-client-url` is deliberately NOT mocked: it builds the URL this
// test asserts on, and it imports nothing, so it costs nothing.
vi.mock('@propertypro/shared', () => ({
  COMMUNITY_TYPE_DISPLAY_NAMES: {
    condo_718: 'Condo §718',
    hoa_720: 'HOA §720',
    apartment: 'Apartment',
  },
}));

describe('DemoPreviewPage URL construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminPageSessionMock.mockResolvedValue({
      adminUserId: 'admin-user',
      email: 'admin@getpropertypro.com',
    });
    decryptDemoTokenSecretMock.mockReturnValue('decrypted-secret');
    generateDemoTokenMock.mockReturnValue('board-token');
    getDemoByIdMock.mockResolvedValue({
      data: {
        id: 11,
        slug: 'fake-apartment',
        prospect_name: 'Fake Apartment',
        template_type: 'apartment',
        auth_token_secret: 'enc:v1:secret',
        demo_board_user_id: 'board-user',
        seeded_community_id: 22,
      },
    });
  });

  it('passes /demo/{slug}?preview=true public URL to TabbedPreviewClient', async () => {
    const { default: DemoPreviewPage } = await import('@/app/demo/[id]/preview/page');

    const element = (await DemoPreviewPage({ params: Promise.resolve({ id: '11' }) })) as {
      props?: { children?: unknown[] };
    };

    const children = Array.isArray(element.props?.children) ? element.props.children : [];
    const tabbedPreview = children[1] as { props?: Record<string, unknown> };

    expect(tabbedPreview?.props?.publicUrl).toContain('/demo/fake-apartment?preview=true');
  });
});

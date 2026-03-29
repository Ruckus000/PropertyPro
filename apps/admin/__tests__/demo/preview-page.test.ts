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

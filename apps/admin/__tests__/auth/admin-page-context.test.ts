import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

describe('admin page context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns the forwarded admin session', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'admin-1',
        'x-user-email': 'admin@getpropertypro.com',
        'x-platform-admin-role': 'super_admin',
      }),
    );

    const { requireAdminPageSession } = await import(
      '@/lib/request/admin-page-context'
    );

    await expect(requireAdminPageSession()).resolves.toEqual({
      id: 'admin-1',
      email: 'admin@getpropertypro.com',
      role: 'super_admin',
    });
  });

  it('rejects missing forwarded admin context', async () => {
    headersMock.mockResolvedValue(new Headers());

    const { requireAdminPageSession } = await import(
      '@/lib/request/admin-page-context'
    );

    await expect(requireAdminPageSession()).rejects.toMatchObject({
      status: 401,
    });
  });
});

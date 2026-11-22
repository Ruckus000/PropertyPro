import { describe, expect, it, vi, beforeEach } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import LegacyMaintenanceRequestPage from '../page';

describe('maintenance/[id] (redirect-only page)', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("opens the request's panel in the Operations hub", async () => {
    await expect(
      LegacyMaintenanceRequestPage({
        params: Promise.resolve({ id: '600' }),
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow();
    expect(redirectMock.mock.calls[0]?.[0]).toBe(
      '/communities/42/operations?tab=requests&from=maintenance&request=600',
    );
  });

  it('lands on the list, with no panel, for an id that is not a request id', async () => {
    for (const bad of ['abc', '0', '-4', '1.5', '1e3', '0x10', ' 7', '7abc']) {
      redirectMock.mockClear();
      await expect(
        LegacyMaintenanceRequestPage({
          params: Promise.resolve({ id: bad }),
          searchParams: Promise.resolve({ communityId: '42' }),
        } as never),
      ).rejects.toThrow();
      expect(redirectMock.mock.calls[0]?.[0]).toBe(
        '/communities/42/operations?tab=requests&from=maintenance',
      );
    }
  });

  it('redirects notification deep-links to Operations requests tab', async () => {
    await expect(
      LegacyMaintenanceRequestPage({
        params: Promise.resolve({ id: '600' }),
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow(/REDIRECT:.*\/communities\/42\/operations/);
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('tab=requests');
    expect(url).toContain('from=maintenance');
  });

  it('preserves Operations-supported filter params on redirect', async () => {
    await expect(
      LegacyMaintenanceRequestPage({
        params: Promise.resolve({ id: '600' }),
        searchParams: Promise.resolve({
          communityId: '42', status: 'open', priority: 'urgent', unitId: '7', q: 'leak',
        }),
      } as never),
    ).rejects.toThrow();
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('priority=urgent');
    expect(url).toContain('unitId=7');
    expect(url).toContain('q=leak');
    expect(url).toContain('request=600');
    expect(url).toContain('tab=requests');
    expect(url).toContain('from=maintenance');
  });

  it('redirects to /dashboard on missing or invalid communityId', async () => {
    for (const bad of ['abc', '0', '-1', undefined]) {
      redirectMock.mockClear();
      await expect(
        LegacyMaintenanceRequestPage({
          params: Promise.resolve({ id: '600' }),
          searchParams: Promise.resolve(bad === undefined ? {} : { communityId: bad }),
        } as never),
      ).rejects.toThrow();
      expect(redirectMock.mock.calls[0]?.[0]).toMatch(/\/dashboard\?reason=invalid-selection/);
    }
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import MaintenanceSubmitPage from '../page';

describe('maintenance/submit (redirect-only page)', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it('redirects to Operations with from=maintenance and tab=requests', async () => {
    await expect(
      MaintenanceSubmitPage({
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow(/REDIRECT:.*\/communities\/42\/operations/);
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('tab=requests');
    expect(url).toContain('from=maintenance');
  });

  // R-6 (2026-11-11 empty-state audit): the redirect dropped the visitor on the
  // Requests list without opening the form they came for.
  it('opens the request sheet on arrival (create=request)', async () => {
    await expect(
      MaintenanceSubmitPage({
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow();
    const url = new URL(redirectMock.mock.calls[0]?.[0] as string, 'http://x');
    expect(url.searchParams.get('create')).toBe('request');
  });

  it('preserves status, priority, unitId, q filter params', async () => {
    await expect(
      MaintenanceSubmitPage({
        searchParams: Promise.resolve({
          communityId: '42',
          status: 'new',
          priority: 'urgent',
          unitId: '7',
          q: 'leak',
        }),
      } as never),
    ).rejects.toThrow();
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('status=new');
    expect(url).toContain('priority=urgent');
    expect(url).toContain('unitId=7');
    expect(url).toContain('q=leak');
  });

  it('redirects to /dashboard on invalid communityId', async () => {
    for (const bad of ['abc', '0', '-1', undefined]) {
      redirectMock.mockClear();
      await expect(
        MaintenanceSubmitPage({
          searchParams: Promise.resolve(bad === undefined ? {} : { communityId: bad }),
        } as never),
      ).rejects.toThrow();
      expect(redirectMock.mock.calls[0]?.[0]).toMatch(/\/dashboard\?reason=invalid-selection/);
    }
  });
});

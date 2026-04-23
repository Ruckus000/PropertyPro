import { describe, expect, it, vi, beforeEach } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import MaintenanceInboxPage from '../page';

describe('maintenance/inbox (redirect-only page)', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it('redirects to Operations with from=maintenance and tab=requests', async () => {
    await expect(
      MaintenanceInboxPage({
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow(/REDIRECT:.*\/communities\/42\/operations/);
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('tab=requests');
    expect(url).toContain('from=maintenance');
  });

  it('preserves status, priority, unitId, q filter params', async () => {
    await expect(
      MaintenanceInboxPage({
        searchParams: Promise.resolve({
          communityId: '42', status: 'new', priority: 'urgent', unitId: '7', q: 'leak',
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
        MaintenanceInboxPage({
          searchParams: Promise.resolve(bad === undefined ? {} : { communityId: bad }),
        } as never),
      ).rejects.toThrow();
      expect(redirectMock.mock.calls[0]?.[0]).toMatch(/\/dashboard\?reason=invalid-selection/);
    }
  });
});

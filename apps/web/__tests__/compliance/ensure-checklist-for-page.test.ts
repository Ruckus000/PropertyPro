import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, ensureMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  ensureMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/lib/services/transparency-service', () => ({ ensureTransparencyChecklistInitialized: ensureMock }));

import { ensureChecklistForManagerPage } from '@/lib/compliance/ensure-checklist-for-page';

const manager = {
  isAdmin: true,
  communityType: 'condo_718' as const,
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  freeAccessExpiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(new Headers());
  ensureMock.mockResolvedValue([]);
});

describe('ensureChecklistForManagerPage', () => {
  it('fills the record list for a manager of an entitled condo or HOA', async () => {
    await ensureChecklistForManagerPage(7, manager);
    await ensureChecklistForManagerPage(8, { ...manager, communityType: 'hoa_720' });
    expect(ensureMock).toHaveBeenCalledWith(7, 'condo_718');
    expect(ensureMock).toHaveBeenCalledWith(8, 'hoa_720');
  });

  it('never writes for a resident, an apartment, a lapsed community or a support session', async () => {
    await ensureChecklistForManagerPage(7, { ...manager, isAdmin: false });
    await ensureChecklistForManagerPage(7, { ...manager, communityType: 'apartment' as never });
    await ensureChecklistForManagerPage(7, { ...manager, subscriptionStatus: 'canceled', subscriptionCanceledAt: new Date('2020-01-01') });
    headersMock.mockResolvedValue(new Headers({ 'x-support-session': '1' }));
    await ensureChecklistForManagerPage(7, manager);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('a failed fill never takes the page down', async () => {
    ensureMock.mockRejectedValue(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(ensureChecklistForManagerPage(7, manager)).resolves.toBeUndefined();
    error.mockRestore();
  });
});

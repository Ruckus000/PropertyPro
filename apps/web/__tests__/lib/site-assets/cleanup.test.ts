import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listMock, removeMock, fromMock, createAdminClientMock } = vi.hoisted(() => {
  const listMock = vi.fn();
  const removeMock = vi.fn();
  const fromMock = vi.fn(() => ({ list: listMock, remove: removeMock }));
  return {
    listMock,
    removeMock,
    fromMock,
    createAdminClientMock: vi.fn(() => ({ storage: { from: fromMock } })),
  };
});

vi.mock('@propertypro/db', () => ({ createAdminClient: createAdminClientMock }));

import { purgeCommunitySiteAssets } from '@/lib/site-assets/cleanup';

describe('purgeCommunitySiteAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue({ error: null });
  });

  it('lists + removes objects under each kind prefix', async () => {
    listMock
      .mockResolvedValueOnce({ data: [{ name: 'a.webp' }], error: null })  // logo
      .mockResolvedValueOnce({ data: [{ name: 'b.webp' }, { name: 'b.webp.1600w.webp' }], error: null })  // hero
      .mockResolvedValueOnce({ data: [], error: null });  // content empty

    const result = await purgeCommunitySiteAssets(42);

    expect(result.deletedCount).toBe(3);
    expect(removeMock).toHaveBeenCalledTimes(2);  // logo + hero (content was empty)
    expect(removeMock).toHaveBeenCalledWith(['42/logo/a.webp']);
    expect(removeMock).toHaveBeenCalledWith(['42/hero/b.webp', '42/hero/b.webp.1600w.webp']);
  });

  it('returns 0 when community has no assets', async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    const result = await purgeCommunitySiteAssets(42);
    expect(result.deletedCount).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('tolerates a "not found" error from list (acceptable: kind directory does not exist)', async () => {
    listMock
      .mockResolvedValueOnce({ data: null, error: { message: 'The resource was not found' } })
      .mockResolvedValueOnce({ data: [{ name: 'a.webp' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const result = await purgeCommunitySiteAssets(42);
    expect(result.deletedCount).toBe(1);
  });

  it('throws on other list errors', async () => {
    listMock.mockResolvedValueOnce({ data: null, error: { message: 'storage offline' } });
    await expect(purgeCommunitySiteAssets(42)).rejects.toThrow(/storage offline/);
  });

  it('throws on remove error', async () => {
    listMock.mockResolvedValue({ data: [{ name: 'a.webp' }], error: null });
    removeMock.mockResolvedValueOnce({ error: { message: 'remove failed' } });
    await expect(purgeCommunitySiteAssets(42)).rejects.toThrow(/remove failed/);
  });
});

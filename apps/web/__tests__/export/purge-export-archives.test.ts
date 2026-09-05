/**
 * Storage purging for export archives.
 *
 * The narrow, per-job function is the interesting one: the community-wide
 * variant is still correct for hard-deletion, but using it for EXPIRY is what
 * destroyed other jobs' archives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listMock, removeMock, fromMock } = vi.hoisted(() => {
  const listMock = vi.fn();
  const removeMock = vi.fn();
  const fromMock = vi.fn(() => ({ list: listMock, remove: removeMock }));
  return { listMock, removeMock, fromMock };
});

vi.mock('@propertypro/db', () => ({ COMMUNITY_EXPORTS_BUCKET: 'community-exports' }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: fromMock } }),
}));

import {
  purgeExportJobArchive,
  purgeCommunityExportArchives,
} from '@/lib/services/export/purge-export-archives';

beforeEach(() => {
  vi.clearAllMocks();
  removeMock.mockResolvedValue({ error: null });
});

describe('purgeExportJobArchive', () => {
  it('touches only the one job’s directory', async () => {
    /*
     * The whole point. Anything that widens this prefix back to the community
     * takes other jobs' archives with it — including a newer `ready` one that
     * still advertises itself as downloadable.
     */
    listMock.mockResolvedValueOnce({ data: [{ name: 'part-000.zip' }], error: null });
    listMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await purgeExportJobArchive({ communityId: 42, downloadToken: 'tok-a' });

    expect(listMock).toHaveBeenCalledWith('exports/42/tok-a', expect.anything());
    expect(removeMock).toHaveBeenCalledWith(['exports/42/tok-a/part-000.zip']);
    expect(result.deletedCount).toBe(1);
  });

  it('never lists the community root, which would sweep sibling jobs', async () => {
    listMock.mockResolvedValue({ data: [], error: null });

    await purgeExportJobArchive({ communityId: 42, downloadToken: 'tok-a' });

    for (const [prefix] of listMock.mock.calls) {
      expect(prefix).not.toBe('exports/42');
    }
  });

  it('is idempotent on an already-empty prefix', async () => {
    listMock.mockResolvedValue({ data: [], error: null });

    const result = await purgeExportJobArchive({ communityId: 42, downloadToken: 'gone' });

    expect(result.deletedCount).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('surfaces a storage failure rather than reporting a false purge', async () => {
    // Silently returning 0 would let the reaper mark the volumes gone while
    // they are still sitting there.
    listMock.mockResolvedValue({ data: [{ name: 'part-000.zip' }], error: null });
    removeMock.mockResolvedValue({ error: { message: 'permission denied' } });

    await expect(
      purgeExportJobArchive({ communityId: 42, downloadToken: 'tok-a' }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('purgeCommunityExportArchives', () => {
  it('still sweeps every job under the community — hard delete wants exactly that', async () => {
    // Unchanged behaviour, asserted so the narrowing above cannot be applied
    // here by mistake: right-to-erasure needs the whole tree gone.
    // Call order: list(root) → list(tok-a) → list(tok-b) → list(root) again.
    // Each directory is listed ONCE, because `removeObjectsIn` stops as soon as
    // a page comes back shorter than PAGE_SIZE.
    listMock.mockResolvedValueOnce({ data: [{ name: 'tok-a' }, { name: 'tok-b' }], error: null });
    listMock.mockResolvedValueOnce({ data: [{ name: 'part-000.zip' }], error: null });
    listMock.mockResolvedValueOnce({ data: [{ name: 'part-000.zip' }], error: null });
    listMock.mockResolvedValue({ data: [], error: null });

    const result = await purgeCommunityExportArchives(42);

    expect(removeMock).toHaveBeenCalledWith(['exports/42/tok-a/part-000.zip']);
    expect(removeMock).toHaveBeenCalledWith(['exports/42/tok-b/part-000.zip']);
    expect(result.deletedCount).toBe(2);
  });
});

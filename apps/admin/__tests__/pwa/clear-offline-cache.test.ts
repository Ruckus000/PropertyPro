/**
 * `clearOfflineCache` — the sign-out half of the service worker's document cache.
 *
 * The worker's navigation cache holds authenticated console DOCUMENTS. Clearing
 * the Supabase session does not touch CacheStorage, so without this an offline
 * navigation after sign-out serves a console page with no session, no middleware
 * check and no `platform_admin_users` lookup.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearOfflineCache } from '@/lib/pwa/clear-offline-cache';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clearOfflineCache', () => {
  it('deletes EVERY cache, not just the version this worker names today', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['ppro-admin-v1', 'ppro-admin-v0-rolled-back'],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });

    await clearOfflineCache();

    expect(deleted).toEqual([
      'ppro-admin-v1',
      'ppro-admin-v0-rolled-back',
    ]);
  });

  it('does nothing, and does not throw, where CacheStorage is absent', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(clearOfflineCache()).resolves.toBeUndefined();
  });

  // The session has already been cleared by the time this runs. Refusing to
  // resolve because a delete failed would leave the operator staring at a
  // console they are no longer signed in to.
  it('swallows a CacheStorage that throws', async () => {
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('storage disabled by policy');
      },
      delete: vi.fn(),
    });

    await expect(clearOfflineCache()).resolves.toBeUndefined();
  });
});

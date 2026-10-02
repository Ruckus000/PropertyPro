/**
 * PATCH /api/admin/communities/:id must MERGE community_settings, not replace
 * it: patchSchema strips keys owned by the web app (paymentFeePolicy,
 * allowResidentVisitorRevoke, …), so a straight write erased them on every save.
 *
 * And the merge must be compare-and-swap: the web app writes its own keys at
 * any moment, so the write is guarded by the blob it was merged from. If the
 * blob changed in between, nothing is written and the operator gets a 409.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { updateMock, filterMock, logAdminActionMock, store } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  filterMock: vi.fn(),
  logAdminActionMock: vi.fn(),
  store: {
    settings: {} as Record<string, unknown>,
    /** When false, the guarded update matches no row (a concurrent write won). */
    writeMatches: true,
  },
}));

const STORED = {
  paymentFeePolicy: 'owner_pays',
  allowResidentVisitorRevoke: true,
  smsDispatchEnabled: false,
  announcementsWriteLevel: 'admin_only',
};

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: vi.fn().mockResolvedValue({ userId: 'admin-1', email: 'a@x.test' }),
}));
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const read = {
        select: () => read,
        eq: () => read,
        is: () => read,
        single: async () => ({
          data: { id: 7, is_demo: false, community_settings: store.settings },
          error: null,
        }),
      };
      return {
        ...read,
        update: (values: Record<string, unknown>) => {
          updateMock(values);
          const write = {
            eq: (column: string, value: unknown) => {
              filterMock('eq', column, value);
              return write;
            },
            select: () => write,
            maybeSingle: async () => ({
              data: store.writeMatches
                ? { id: 7, community_settings: values['community_settings'] }
                : null,
              error: null,
            }),
          };
          return write;
        },
      };
    },
  }),
}));

import { PATCH } from '../../src/app/api/admin/communities/[id]/route';

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest('http://localhost:3001/api/admin/communities/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: '7' }) },
  );
}

/** The `community_settings` filters the update carried, beyond `id`. */
function settingsGuards() {
  return filterMock.mock.calls.filter(([, column]) => column === 'community_settings');
}

describe('admin community settings save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.settings = STORED;
    store.writeMatches = true;
  });

  it('keeps keys the console does not edit', async () => {
    // What CommunitySettingsEditor sends: the full blob with one key changed.
    const res = await patch({ community_settings: { ...STORED, smsDispatchEnabled: true } });
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0]![0]['community_settings']).toEqual({ ...STORED, smsDispatchEnabled: true });
  });

  it('a partial PATCH changes only what it names', async () => {
    await patch({ community_settings: { announcementsWriteLevel: 'all_members' } });
    expect(updateMock.mock.calls[0]![0]['community_settings']).toEqual({
      ...STORED,
      announcementsWriteLevel: 'all_members',
    });
  });

  it('leaves the column alone when settings are not in the body', async () => {
    await patch({ name: 'Renamed' });
    expect(updateMock.mock.calls[0]![0]).not.toHaveProperty('community_settings');
    expect(settingsGuards()).toEqual([]);
  });

  describe('compare-and-swap', () => {
    it('writes only if the stored blob is still the one it merged from', async () => {
      await patch({ community_settings: { smsDispatchEnabled: true } });

      expect(settingsGuards()).toEqual([['eq', 'community_settings', JSON.stringify(STORED)]]);
    });

    it('returns 409 and audits nothing when a concurrent write changed the blob', async () => {
      store.writeMatches = false;

      const res = await patch({ community_settings: { smsDispatchEnabled: true } });
      const body = (await res.json()) as { error: { code: string; message: string } };

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toMatch(/Reload and try again/);
      // One attempt, no retry: the operator saves again from fresh data.
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(logAdminActionMock).not.toHaveBeenCalled();
    });

    it('audits a legal-gate flip only once the guarded write lands', async () => {
      const res = await patch({ community_settings: { smsDispatchEnabled: true } });

      expect(res.status).toBe(200);
      expect(logAdminActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'community_settings_changed',
          oldValues: { smsDispatchEnabled: false },
          newValues: { smsDispatchEnabled: true },
        }),
      );
    });

    it('404s when the community disappears between the read and a non-settings write', async () => {
      store.writeMatches = false;

      const res = await patch({ name: 'Renamed' });

      expect(res.status).toBe(404);
    });
  });
});

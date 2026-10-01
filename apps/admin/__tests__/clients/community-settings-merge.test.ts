/**
 * PATCH /api/admin/communities/:id must MERGE community_settings, not replace
 * it: patchSchema strips keys owned by the web app (paymentFeePolicy,
 * allowResidentVisitorRevoke, …), so a straight write erased them on every save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { updateMock, logAdminActionMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  logAdminActionMock: vi.fn(),
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
        single: async () => ({ data: { id: 7, is_demo: false, community_settings: STORED }, error: null }),
      };
      return {
        ...read,
        update: (values: Record<string, unknown>) => {
          updateMock(values);
          const write = {
            eq: () => write,
            select: () => write,
            single: async () => ({ data: { id: 7, community_settings: values['community_settings'] }, error: null }),
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

describe('admin community settings save', () => {
  beforeEach(() => vi.clearAllMocks());

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
  });
});

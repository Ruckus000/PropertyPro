import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { deriveDesignationUpdate } from '@/app/api/admin/communities/[id]/members/[userId]/route';

describe('deriveDesignationUpdate (Phase 3.2 writer lockstep)', () => {
  it('returns null when preset_key is absent from the PATCH (designation untouched)', () => {
    expect(deriveDesignationUpdate(undefined)).toBeNull();
  });

  it('mirrors board_president into designation', () => {
    expect(deriveDesignationUpdate('board_president')).toEqual({
      designation: 'board_president',
    });
  });

  it('mirrors board_member into designation', () => {
    expect(deriveDesignationUpdate('board_member')).toEqual({
      designation: 'board_member',
    });
  });

  it('clears designation for a non-board preset (cam)', () => {
    expect(deriveDesignationUpdate('cam')).toEqual({ designation: null });
  });

  it('clears designation when preset_key is explicitly null', () => {
    expect(deriveDesignationUpdate(null)).toEqual({ designation: null });
  });
});

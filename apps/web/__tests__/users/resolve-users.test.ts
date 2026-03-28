import { describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  fromMock,
  selectMock,
  inMock,
} = vi.hoisted(() => {
  const inMock = vi.fn();
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const createAdminClientMock = vi.fn(() => ({ from: fromMock }));

  return {
    createAdminClientMock,
    fromMock,
    selectMock,
    inMock,
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import { resolveUserDisplayNames } from '../../src/lib/utils/resolve-users';

describe('resolveUserDisplayNames', () => {
  it('returns resolved names and falls back when users are missing or blank', async () => {
    inMock.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          full_name: 'Alice Example',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          full_name: '   ',
        },
      ],
      error: null,
    });

    const displayNames = await resolveUserDisplayNames([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('users');
    expect(selectMock).toHaveBeenCalledWith('id, full_name');
    expect(inMock).toHaveBeenCalledWith('id', [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    expect(displayNames.get('11111111-1111-4111-8111-111111111111')).toBe('Alice Example');
    expect(displayNames.get('22222222-2222-4222-8222-222222222222')).toBe('User 22222222');
    expect(displayNames.get('33333333-3333-4333-8333-333333333333')).toBe('User 33333333');
  });
});

import { describe, expect, it, vi } from 'vitest';

const {
  findCommunityUserDisplayNamesMock,
} = vi.hoisted(() => {
  return {
    findCommunityUserDisplayNamesMock: vi.fn(),
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  findCommunityUserDisplayNames: findCommunityUserDisplayNamesMock,
}));

import { resolveUserDisplayNames } from '../../src/lib/utils/resolve-users';

describe('resolveUserDisplayNames', () => {
  it('returns resolved names for the same community and falls back for unknown users', async () => {
    findCommunityUserDisplayNamesMock.mockResolvedValue(
      new Map([
        ['11111111-1111-4111-8111-111111111111', 'Alice Example'],
        ['22222222-2222-4222-8222-222222222222', null],
      ]),
    );

    const displayNames = await resolveUserDisplayNames(42, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    expect(findCommunityUserDisplayNamesMock).toHaveBeenCalledWith(42, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    expect(displayNames.get('11111111-1111-4111-8111-111111111111')).toBe('Alice Example');
    expect(displayNames.get('22222222-2222-4222-8222-222222222222')).toBe('User 22222222');
    expect(displayNames.get('33333333-3333-4333-8333-333333333333')).toBe('User 33333333');
  });
});

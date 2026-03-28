import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/communities/42/board/forum',
}));

import { isBoardTabActive } from '../../src/components/board/board-chrome';

describe('isBoardTabActive', () => {
  it('matches the exact tab href', () => {
    expect(isBoardTabActive('/communities/42/board/forum', '/communities/42/board/forum')).toBe(true);
  });

  it('keeps the parent tab active for nested detail routes', () => {
    expect(
      isBoardTabActive(
        '/communities/42/board/forum/99',
        '/communities/42/board/forum',
      ),
    ).toBe(true);
  });

  it('does not match sibling board tabs', () => {
    expect(
      isBoardTabActive(
        '/communities/42/board/polls',
        '/communities/42/board/forum',
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isSearchShortcut } from '@/lib/utils/search-shortcut';

describe('isSearchShortcut', () => {
  it('matches cmd+k and ctrl+k regardless of key case', () => {
    expect(isSearchShortcut({ key: 'k', metaKey: true })).toBe(true);
    expect(isSearchShortcut({ key: 'K', ctrlKey: true })).toBe(true);
  });

  it('rejects non-shortcut combinations', () => {
    expect(isSearchShortcut({ key: 'p', metaKey: true })).toBe(false);
    expect(isSearchShortcut({ key: 'k' })).toBe(false);
    expect(isSearchShortcut({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false);
  });
});

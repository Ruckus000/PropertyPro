import { describe, expect, it } from 'vitest';
import { isDirectoryEnabledForCommunity } from '../../src/lib/directory/directory-flag';

describe('isDirectoryEnabledForCommunity', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['  ', false],
    ['true', false],
    ['all', true],
    ['7', true],
    ['3, 7 ,9', true],
    ['3,9', false],
    ['07', true],
    ['7x', false],
  ])('%j → %s for community 7', (raw, expected) => {
    expect(isDirectoryEnabledForCommunity(7, raw)).toBe(expected);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/content/help/media-index.json', () => ({
  default: {
    'manager/a/b/legacy': [600, 400],
    'manager/a/b/dated': [480, 120, '2026-09-30'],
  },
}));

const { resolveHelpShot, listCapturedShots } = await import('@/lib/help/media-index');

describe('resolveHelpShot', () => {
  it('reads width and height and ignores the capture date', () => {
    expect(resolveHelpShot('manager/a/b', 'dated')).toEqual({
      src: '/help/manager/a/b/dated.webp',
      src2x: '/help/manager/a/b/dated@2x.webp',
      width: 480,
      height: 120,
    });
  });

  it('still accepts entries without a capture date', () => {
    expect(resolveHelpShot('manager/a/b', 'legacy')).toMatchObject({ width: 600, height: 400 });
  });

  it('returns null for an uncaptured shot', () => {
    expect(resolveHelpShot('manager/a/b', 'missing')).toBeNull();
    expect(listCapturedShots()).toEqual(['manager/a/b/legacy', 'manager/a/b/dated']);
  });
});

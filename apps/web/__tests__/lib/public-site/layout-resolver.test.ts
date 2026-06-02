import { describe, it, expect } from 'vitest';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';

describe('resolveLayoutId', () => {
  it('returns the explicit branding.layoutId when set', () => {
    expect(resolveLayoutId({ layoutId: 'sable' }, 'condo_718')).toBe('sable');
    expect(resolveLayoutId({ layoutId: 'boulevard' }, 'apartment')).toBe('boulevard');
  });

  it('falls back to community_type default when branding.layoutId is missing', () => {
    expect(resolveLayoutId({}, 'condo_718')).toBe('tidewater');
    expect(resolveLayoutId({}, 'hoa_720')).toBe('boulevard');
    expect(resolveLayoutId({}, 'apartment')).toBe('sable');
  });

  it('falls back to community_type default when branding is null', () => {
    expect(resolveLayoutId(null, 'condo_718')).toBe('tidewater');
  });

  it('falls back to tidewater for unknown community types (defensive default)', () => {
    expect(resolveLayoutId(null, 'unknown' as never)).toBe('tidewater');
  });

  it('ignores an unknown branding.layoutId and uses the community_type default', () => {
    expect(resolveLayoutId({ layoutId: 'futuristic' as never }, 'apartment')).toBe('sable');
  });

  it('treats empty-string layoutId as missing', () => {
    expect(resolveLayoutId({ layoutId: '' }, 'condo_718')).toBe('tidewater');
  });
});

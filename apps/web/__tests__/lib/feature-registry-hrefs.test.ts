import { describe, expect, it } from 'vitest';
import { FEATURE_REGISTRY } from '@/lib/constants/feature-registry';

const FORBIDDEN_EXACT = new Set([
  '/calendar',
  '/community-board',
  '/arc',
  '/polls',
  '/polls/new',
  '/settings/community',
]);

function resolveHref(href: string | ((cid: number) => string)): string {
  return typeof href === 'function' ? href(1) : href;
}

describe('FEATURE_REGISTRY hrefs', () => {
  it('does not point at known orphan paths', () => {
    for (const item of FEATURE_REGISTRY) {
      if (!('href' in item) || item.href == null) continue;
      const resolved = resolveHref(item.href as string | ((cid: number) => string));
      expect(FORBIDDEN_EXACT.has(resolved), `${item.id} → ${resolved}`).toBe(false);
      expect(resolved.includes('/voting'), `${item.id} → ${resolved}`).toBe(false);
    }
  });

  it('points voting at board elections', () => {
    const voting = FEATURE_REGISTRY.find((i) => i.id === 'page-voting');
    expect(voting).toBeTruthy();
    expect(resolveHref(voting!.href as (cid: number) => string)).toBe(
      '/communities/1/board/elections',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { HELP_RENDER_VERSION, helpArticleCacheKey } from '@/lib/help/render-version';

describe('helpArticleCacheKey', () => {
  it('includes category, slug, contentHash and render version', () => {
    const key = helpArticleCacheKey('compliance', 'reviewing-the-compliance-dashboard', 'abc123');
    expect(key).toBe(`compliance:reviewing-the-compliance-dashboard:abc123:v${HELP_RENDER_VERSION}`);
  });

  it('produces distinct keys for distinct content hashes', () => {
    expect(helpArticleCacheKey('a', 'b', 'h1')).not.toBe(helpArticleCacheKey('a', 'b', 'h2'));
  });
});

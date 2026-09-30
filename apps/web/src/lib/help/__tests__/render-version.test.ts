import { describe, expect, it } from 'vitest';
import { HELP_RENDER_VERSION, helpArticleCacheKey } from '@/lib/help/render-version';

describe('helpArticleCacheKey', () => {
  it('includes section, category, slug, contentHash, community type and render version', () => {
    const key = helpArticleCacheKey('manager', 'compliance', 'compliance-dashboard', 'abc123', 'condo_718');
    expect(key).toBe(`manager:compliance:compliance-dashboard:abc123:condo_718:v${HELP_RENDER_VERSION}`);
  });

  it('produces distinct keys for distinct content hashes', () => {
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h1', 'condo_718')).not.toBe(
      helpArticleCacheKey('resident', 'a', 'b', 'h2', 'condo_718'),
    );
  });

  it('keeps each section’s version of a slug, and each community type’s rendering, apart', () => {
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718')).not.toBe(
      helpArticleCacheKey('board', 'a', 'b', 'h', 'condo_718'),
    );
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718')).not.toBe(
      helpArticleCacheKey('resident', 'a', 'b', 'h', 'hoa_720'),
    );
  });
});

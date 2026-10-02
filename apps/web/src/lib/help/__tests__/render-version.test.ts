import { describe, expect, it } from 'vitest';
import { HELP_RENDER_VERSION, helpArticleCacheKey } from '@/lib/help/render-version';

describe('helpArticleCacheKey', () => {
  it('includes section, category, slug, contentHash, community type, board seat and render version', () => {
    const key = helpArticleCacheKey('manager', 'compliance', 'compliance-dashboard', 'abc123', 'condo_718', false);
    expect(key).toBe(`manager:compliance:compliance-dashboard:abc123:condo_718:no-board:v${HELP_RENDER_VERSION}`);
  });

  it('produces distinct keys for distinct content hashes', () => {
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h1', 'condo_718', false)).not.toBe(
      helpArticleCacheKey('resident', 'a', 'b', 'h2', 'condo_718', false),
    );
  });

  it('keeps each section’s version of a slug, and each community type’s rendering, apart', () => {
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718', false)).not.toBe(
      helpArticleCacheKey('board', 'a', 'b', 'h', 'condo_718', false),
    );
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718', false)).not.toBe(
      helpArticleCacheKey('resident', 'a', 'b', 'h', 'hoa_720', false),
    );
  });

  it('keeps a board member’s rendering apart from everyone else’s', () => {
    // A `help:` link to a board-only article renders as a link for a board
    // seat and as plain text otherwise; one cached copy served both.
    expect(helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718', true)).not.toBe(
      helpArticleCacheKey('resident', 'a', 'b', 'h', 'condo_718', false),
    );
  });
});

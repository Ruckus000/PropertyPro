/**
 * The website records section filters by a fixed set of category values; a
 * community's categories are named freely. These pin that the two meet by
 * meaning — the string compare they replaced matched nothing, so every condo
 * and HOA starter site's records section was empty.
 */
import { describe, expect, it } from 'vitest';
import { documentMatchesSectionCategories } from '../site-blocks/documents';

describe('documentMatchesSectionCategories', () => {
  it.each([
    ['Financial Records', 'budget'],
    ['Financial Records', 'financial'],
    ['Meeting Records', 'minutes'],
    ['Board Minutes', 'minutes'],
    ['Rules & Regulations', 'rules'],
    ['Rules', 'rules'],
  ] as const)('puts %s in a section showing %s', (name, category) => {
    expect(documentMatchesSectionCategories(name, [category])).toBe(true);
  });

  it('keeps categories out of sections that do not show them', () => {
    expect(documentMatchesSectionCategories('Meeting Records', ['budget', 'financial'])).toBe(false);
    expect(documentMatchesSectionCategories('Insurance', ['budget', 'minutes', 'rules'])).toBe(false);
  });

  it('gives "other" everything the named values do not claim, including unknown names', () => {
    expect(documentMatchesSectionCategories('Insurance', ['other'])).toBe(true);
    expect(documentMatchesSectionCategories('Pool Passes', ['other'])).toBe(true);
    expect(documentMatchesSectionCategories('Financial Records', ['other'])).toBe(false);
  });

  it('never matches a document with no category, not even "other"', () => {
    expect(documentMatchesSectionCategories(null, ['other'])).toBe(false);
  });

  it('shows nothing when no categories are selected, as the live site always has', () => {
    expect(documentMatchesSectionCategories('Financial Records', [])).toBe(false);
    expect(documentMatchesSectionCategories('Financial Records', undefined)).toBe(false);
  });
});

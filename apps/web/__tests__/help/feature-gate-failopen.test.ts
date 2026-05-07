import { describe, expect, it, vi } from 'vitest';
import { safelyFilterArticlesByFeatures } from '@/lib/services/help-article-service';

const articles = [
  { slug: 'condo-only', featureGates: ['hasCompliance'] },
  { slug: 'apartment-only', featureGates: ['hasLeaseTracking'] },
  { slug: 'always-shown', featureGates: [] as string[] },
  { slug: 'no-gate-field' },
];

describe('safelyFilterArticlesByFeatures (fail-open behavior)', () => {
  it('returns all articles unchanged when features is null', () => {
    const result = safelyFilterArticlesByFeatures(articles, null);
    expect(result.map((a) => a.slug)).toEqual([
      'condo-only',
      'apartment-only',
      'always-shown',
      'no-gate-field',
    ]);
  });

  it('returns all articles unchanged when features is undefined', () => {
    const result = safelyFilterArticlesByFeatures(articles, undefined);
    expect(result).toHaveLength(articles.length);
  });

  it('passes through to filterArticlesByFeatures when features is valid', () => {
    const apartmentFeatures = {
      hasCompliance: false,
      hasLeaseTracking: true,
    };
    const result = safelyFilterArticlesByFeatures(articles, apartmentFeatures);
    expect(result.map((a) => a.slug)).toEqual([
      'apartment-only',
      'always-shown',
      'no-gate-field',
    ]);
  });

  it('fails open and invokes onError when feature evaluation throws', () => {
    const onError = vi.fn();
    const exploding: unknown = new Proxy(
      {},
      {
        get() {
          throw new Error('feature service is down');
        },
      },
    );
    const result = safelyFilterArticlesByFeatures(
      articles,
      exploding as Record<string, boolean>,
      { onError },
    );
    expect(result).toHaveLength(articles.length);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

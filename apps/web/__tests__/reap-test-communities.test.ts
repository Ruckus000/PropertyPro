import { describe, expect, it } from 'vitest';
import {
  PROTECTED_COMMUNITY_IDS,
  matchesTestCommunitySlug,
} from '../../../scripts/reap-test-communities-patterns';

describe('matchesTestCommunitySlug', () => {
  it('matches integration-test slug shapes', () => {
    const testSlugs = [
      'p2-43-sunset-condos-facd6e39', // kit run-suffix
      'p2-43-palm-shores-hoa-aca665e0',
      'p2-43-metro-apartments-3ca2175b',
      'advisory-taken-1860d3e6', // direct-insert advisory fixtures
      'advisory-posttaken-062e396f',
      'p4_55_rls_1784361650045_f50ee2e7-a', // RLS multi-community fixtures
      'p4_55_rls_1784361650045_f50ee2e7-b',
      'reconcile-test-reconcile-1784635148696-cf5751',
      't-bootstrap-multi-1', // stripe bootstrap fixtures
      't-bootstrap-multi-2',
    ];
    for (const slug of testSlugs) {
      expect(matchesTestCommunitySlug(slug), slug).toBe(true);
    }
  });

  it('never matches real or demo community slugs', () => {
    const realSlugs = [
      'sunset-condos',
      'palm-shores-hoa',
      'sunset-ridge-apartments',
      'demo-breakway-apartments-8c2d8c',
      'demo-oceanview-towers-6510a3',
      'demo-test-condo-demo-2bd0f9',
      'demo-fake-apartment-3573ba',
    ];
    for (const slug of realSlugs) {
      expect(matchesTestCommunitySlug(slug), slug).toBe(false);
    }
  });

  it('excludes demo-* even when the slug ends in an 8-hex suffix', () => {
    // The demo exclusion must win over the run-suffix pattern.
    expect(matchesTestCommunitySlug('demo-something-12345678')).toBe(false);
  });

  it('protects the seeded demo community ids', () => {
    expect([...PROTECTED_COMMUNITY_IDS]).toEqual([1, 2, 3]);
  });
});

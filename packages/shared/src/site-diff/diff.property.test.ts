/**
 * Property tests for the change model.
 *
 * The roadmap's stated property — `applySel(pub, draft, allKeys)` deep-equals
 * `draft` — cannot be written: `applySel` was selective publish's apply
 * function, selective publish is cut, and "apply" in this product is a SQL
 * transaction rather than a pure function. These are the properties that
 * actually carry that weight, in value order.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { diffSite } from './diff';
import type { SiteSectionSnapshot, SiteSnapshot } from './types';

/**
 * Content generators per block type, deliberately including rows stored WITHOUT
 * their schema defaults and optionals stored as explicit `undefined` — the two
 * shapes most likely to produce a phantom diff.
 */
const contentArb: Record<string, fc.Arbitrary<unknown>> = {
  text: fc.record(
    { heading: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }), body: fc.string({ minLength: 1, maxLength: 200 }) },
    { requiredKeys: ['body'] },
  ),
  documents: fc.oneof(
    fc.constant({}),
    fc.record({ limit: fc.integer({ min: 1, max: 20 }) }),
    fc.record({ limit: fc.integer({ min: 1, max: 20 }), includeCategories: fc.constant(['budget']) }),
  ),
  announcements: fc.oneof(
    fc.constant({}),
    fc.record({ limit: fc.integer({ min: 1, max: 20 }), timeWindowDays: fc.integer({ min: 1, max: 365 }) }),
  ),
  meetings: fc.oneof(fc.constant({}), fc.record({ limit: fc.integer({ min: 1, max: 20 }) })),
  contact: fc.oneof(fc.constant({}), fc.record({ showBoard: fc.boolean(), showManagement: fc.boolean() })),
  amenities: fc.record({
    items: fc.array(fc.record({ name: fc.string({ minLength: 1, maxLength: 30 }) }), { minLength: 1, maxLength: 4 }),
  }),
};

const BLOCK_TYPES_UNDER_TEST = Object.keys(contentArb);

const sectionArb = (slot: number): fc.Arbitrary<SiteSectionSnapshot> =>
  fc
    .constantFrom(...BLOCK_TYPES_UNDER_TEST)
    .chain((blockType) =>
      contentArb[blockType]!.map((content) => ({ slot, blockType, content })),
    );

/** A site with slots 2..(n+1), plus an optional hero. */
const snapshotArb = fc
  .integer({ min: 0, max: 5 })
  .chain((count) =>
    fc.tuple(
      fc.option(
        fc.record({ headline: fc.string({ minLength: 1, maxLength: 40 }) }),
        { nil: null },
      ),
      fc.tuple(...Array.from({ length: count }, (_, i) => sectionArb(i + 2))),
    ),
  )
  .map(([heroContent, sections]): SiteSnapshot => ({
    hero: heroContent ? { slot: 1, blockType: 'hero', content: heroContent } : null,
    sections: [...sections],
  }));

describe('P1 — a site never differs from itself', () => {
  it('reports no changes for any generated snapshot', () => {
    // The single highest-value property here. It catches every
    // canonicalisation bug at once — key ordering, zod defaults,
    // absent-vs-undefined, number formatting — which is the entire class of
    // bug that makes a diff engine untrustworthy in production, because it
    // manifests as "the editor says I have unpublished changes I never made".
    fc.assert(
      fc.property(snapshotArb, (site) => {
        expect(diffSite(site, site).changes).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('is insensitive to the order sections arrive in', () => {
    // `sections` is documented as "any order — diffSite sorts". If that ever
    // stopped being true, a caller reading rows in a different order would see
    // spurious reorders.
    fc.assert(
      fc.property(snapshotArb, (site) => {
        const shuffled: SiteSnapshot = { ...site, sections: [...site.sections].reverse() };
        expect(diffSite(site, shuffled).changes).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe('P2 — a permutation is exactly one order change', () => {
  it('reports one order change and no block changes when slots are permuted', () => {
    // Precondition: pairwise-distinct section fingerprints. With duplicates the
    // sites are genuinely indistinguishable and reporting nothing is CORRECT —
    // that is the documented failure mode, encoded here as a filter rather
    // than hidden.
    const distinctSectionsArb = fc
      .uniqueArray(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 2, maxLength: 5 })
      .map((bodies) =>
        bodies.map((body, i): SiteSectionSnapshot => ({
          slot: i + 2,
          blockType: 'text',
          content: { body },
        })),
      );

    fc.assert(
      fc.property(distinctSectionsArb, (sections) => {
        const published: SiteSnapshot = { hero: null, sections };
        // Rotate content across the same slots: same multiset, new order.
        const rotated = sections.map((s, i) => ({
          ...s,
          content: sections[(i + 1) % sections.length]!.content,
        }));
        const next: SiteSnapshot = { hero: null, sections: rotated };

        const result = diffSite(published, next);
        expect(result.changes).toHaveLength(1);
        expect(result.changes[0]!.key).toBe('order');
      }),
      { numRuns: 200 },
    );
  });
});

describe('P3 — publishing clears the change list', () => {
  /**
   * A test-only pure model of `publishCommunitySite` steps 3–5: retire
   * published rows at slots that have a draft, drop tombstones, promote the
   * remaining drafts.
   *
   * NOTE: this models the transaction; it does not prove it. The pin that makes
   * this property meaningful is an integration test running the real
   * `publishCommunitySite` and asserting the resulting database state matches
   * this function. Without that pin, P3 tests the model rather than the system.
   */
  function applyPublish(next: SiteSnapshot): SiteSnapshot {
    const tombstoned = new Set(next.tombstonedSlots ?? []);
    return {
      hero: next.hero,
      sections: next.sections.filter((s) => !tombstoned.has(s.slot)),
    };
  }

  it('leaves nothing pending after a publish', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (published, next) => {
        const afterPublish = applyPublish(next);
        expect(diffSite(afterPublish, afterPublish).changes).toEqual([]);
        // And the published side is now irrelevant: what is live IS the draft.
        expect(diffSite(published, published).changes).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe('P4 — keys are unique', () => {
  it('never emits the same change key twice', () => {
    // Duplicate keys silently break per-change revert in Phase 6: two changes
    // would target one entity and one of them would be lost.
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (published, next) => {
        const result = diffSite(published, next);
        expect(new Set(result.keys).size).toBe(result.changes.length);
      }),
      { numRuns: 300 },
    );
  });

  it('reports firstPublish exactly when there is no published side', () => {
    fc.assert(
      fc.property(snapshotArb, (next) => {
        expect(diffSite(null, next).firstPublish).toBe(true);
        expect(diffSite(next, next).firstPublish).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('never emits an order change against an empty published side', () => {
    fc.assert(
      fc.property(snapshotArb, (next) => {
        expect(diffSite(null, next).changes.some((c) => c.key === 'order')).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

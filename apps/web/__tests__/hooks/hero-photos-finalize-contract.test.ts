/**
 * The seam that hid the bug: what `useHeroPhotos` sends vs what finalize accepts.
 *
 * `use-hero-photos.test.tsx` mocks `@/hooks/use-image-upload`, and
 * `HeroPhotosField.test.tsx` mocks `@/hooks/use-hero-photos`. Both are correct
 * — this hook must not grow a second upload path, so there is nothing below
 * that boundary to unit-test. But it meant the queue could send an `altText`
 * the finalize contract rejects and every test in the tree stayed green while
 * the feature was 100% broken in production: presign OK, PUT OK, then a 400
 * with the bytes already stranded in the bucket.
 *
 * So this file deliberately imports the REAL contract schema and asserts the
 * REAL values the queue produces against it. No mocks. It is the only test
 * that spans the boundary, and it is why the class of bug cannot recur
 * silently.
 */
import { describe, it, expect } from 'vitest';
import { siteFinalizeRequestSchema } from '@/app/api/v1/site/images/finalize/contract';
import { DECORATIVE_PLACEHOLDER_ALT } from '@/lib/site-assets/client-image';

/** Exactly the body `useImageUpload` posts to finalize. */
function finalizeBody(altText: string) {
  return {
    communityId: 7,
    storagePath: '7/hero/abc-pool.jpg',
    altText,
    cropBox: undefined,
  };
}

describe('hero photo uploads satisfy the finalize contract', () => {
  it('accepts a described photo', () => {
    const parsed = siteFinalizeRequestSchema.safeParse(finalizeBody('The pool at sunset'));
    expect(parsed.success).toBe(true);
  });

  it('accepts a decorative photo, which carries no block-content alt', () => {
    // A decorative photo has no alt by definition, but finalize requires one.
    // This is the whole reason the placeholder exists — asserting it against
    // the real schema is what stops someone "simplifying" it back to ''.
    const parsed = siteFinalizeRequestSchema.safeParse(
      finalizeBody(DECORATIVE_PLACEHOLDER_ALT),
    );
    expect(parsed.success).toBe(true);
  });

  it('REJECTS an empty altText — the original bug, stated as a contract', () => {
    const parsed = siteFinalizeRequestSchema.safeParse(finalizeBody(''));
    expect(parsed.success).toBe(false);
  });

  it('rejects an altText longer than the contract allows', () => {
    // The reason the placeholder is a fixed string rather than the filename:
    // presign accepts a filename up to 255 chars while finalize caps altText
    // at 200, so a long filename would reintroduce the same 400 in a rarer
    // and much harder-to-diagnose form.
    const parsed = siteFinalizeRequestSchema.safeParse(finalizeBody('a'.repeat(201)));
    expect(parsed.success).toBe(false);
  });

  it('keeps the placeholder inside the contract bounds', () => {
    expect(DECORATIVE_PLACEHOLDER_ALT.length).toBeGreaterThan(0);
    expect(DECORATIVE_PLACEHOLDER_ALT.length).toBeLessThanOrEqual(200);
  });
});

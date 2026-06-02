import { describe, expect, it } from 'vitest';
import { expandQuery } from '../aliases';

describe('expandQuery', () => {
  it('returns empty arrays for an empty query', () => {
    const result = expandQuery('   ');
    expect(result.primary).toEqual([]);
    expect(result.aliases).toEqual([]);
  });

  it('includes the trimmed query and every token of length >= 2 as primary terms', () => {
    const result = expandQuery('Meeting Minutes');
    expect(result.primary).toContain('meeting minutes');
    expect(result.primary).toContain('meeting');
    expect(result.primary).toContain('minutes');
  });

  describe('pre-existing alias groups (regression)', () => {
    it('expands "fees" to assessments terminology', () => {
      const result = expandQuery('fees');
      expect(result.aliases).toContain('assessments');
      expect(result.aliases).toContain('dues');
    });

    it('expands "arc" to acc and the full architectural review phrase', () => {
      const result = expandQuery('arc');
      expect(result.aliases).toContain('acc');
      expect(result.aliases).toContain('architectural review');
    });

    it('does not expand "cam" when typed inside another word (e.g. "camera")', () => {
      const result = expandQuery('camera');
      expect(result.aliases).not.toContain('community association manager');
    });
  });

  describe('new alias groups (this PR)', () => {
    it('expands "vote" to election and poll variants', () => {
      const result = expandQuery('vote');
      expect(result.aliases).toContain('election');
      expect(result.aliases).toContain('poll');
      expect(result.aliases).toContain('ballot');
    });

    it('expands "renter" to tenant and lessee variants', () => {
      const result = expandQuery('renter');
      expect(result.aliases).toContain('tenant');
      expect(result.aliases).toContain('lessee');
    });

    it('expands "homeowner" to owner variants', () => {
      const result = expandQuery('homeowner');
      expect(result.aliases).toContain('owner');
      expect(result.aliases).toContain('unit owner');
    });

    it('expands "approve" to the broader approval verbs (covers join-requests, ARC, maintenance triage)', () => {
      const result = expandQuery('approve');
      expect(result.aliases).toContain('approval');
      expect(result.aliases).toContain('accept');
      expect(result.aliases).toContain('reject');
      expect(result.aliases).toContain('deny');
    });

    it('expands past-tense inflections of approval verbs ("rejected", "denied", "accepted", "approved")', () => {
      const rejected = expandQuery('rejected');
      expect(rejected.aliases).toContain('approve');
      expect(rejected.aliases).toContain('denied');
      expect(rejected.aliases).toContain('accepted');

      const denied = expandQuery('denied');
      expect(denied.aliases).toContain('approve');
      expect(denied.aliases).toContain('rejected');

      const approved = expandQuery('approved');
      expect(approved.aliases).toContain('reject');
      expect(approved.aliases).toContain('accepted');
    });

    it('expands "broadcast" to emergency notification phrasing', () => {
      const result = expandQuery('broadcast');
      expect(result.aliases).toContain('emergency notification');
    });

    it('expands "invoice" to bill and payment, but NOT into the fees/assessments group', () => {
      const result = expandQuery('invoice');
      expect(result.aliases).toContain('bill');
      expect(result.aliases).toContain('payment');
      expect(result.aliases).not.toContain('fees');
      expect(result.aliases).not.toContain('assessments');
    });

    it('expands "onboarding" to setup variants', () => {
      const result = expandQuery('onboarding');
      expect(result.aliases).toContain('onboard');
      expect(result.aliases).toContain('setup');
    });

    it('expands the multi-word phrase "set up" via substring match', () => {
      const result = expandQuery('how do i set up the community');
      expect(result.aliases).toContain('onboarding');
    });
  });
});

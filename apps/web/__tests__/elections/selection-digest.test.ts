/**
 * Ballot-selection digest (§718.128 secret ballot).
 *
 * ── Why this file exists at all ──
 *
 * The duplicate-submission path is exercised end to end by
 * `vote-integration.test.ts` — which `pnpm test` does NOT run (it lives in the
 * integration suite behind a real database). So the schema change that removed
 * `election_ballots.submission_id` and replaced the ballot read-back with this
 * digest passed 173 green election tests without a single one touching it.
 * A green suite is not evidence it exercised anything.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-08.
 */
import { describe, expect, it } from 'vitest';
import { createSelectionDigest } from '@/lib/elections/selection-digest';

const SALT = 'election-salt-abc';

describe('createSelectionDigest', () => {
  it('is ORDER-INDEPENDENT', () => {
    // A voter who reselects the same three candidates in a different order has
    // submitted the same ballot, and expects the idempotent receipt rather than
    // a 409.
    expect(createSelectionDigest(SALT, [3, 1, 2], false)).toBe(
      createSelectionDigest(SALT, [1, 2, 3], false),
    );
  });

  it('differs for a DIFFERENT selection', () => {
    // The whole point of the comparison: a resubmission that is not the same
    // ballot must be refused, not silently accepted as a duplicate.
    expect(createSelectionDigest(SALT, [1, 2, 3], false)).not.toBe(
      createSelectionDigest(SALT, [1, 2, 4], false),
    );
  });

  it('differs when a candidate is dropped', () => {
    expect(createSelectionDigest(SALT, [1, 2, 3], false)).not.toBe(
      createSelectionDigest(SALT, [1, 2], false),
    );
  });

  it('distinguishes an abstention from an empty selection', () => {
    // Both have no candidates. They are not the same ballot.
    expect(createSelectionDigest(SALT, [], true)).not.toBe(
      createSelectionDigest(SALT, [], false),
    );
  });

  it('ignores the selection entirely for an abstention', () => {
    expect(createSelectionDigest(SALT, [1, 2], true)).toBe(
      createSelectionDigest(SALT, [], true),
    );
  });

  it('is SALTED per election', () => {
    // Without the salt the digest is a hash of a small integer set, so an
    // observer with the candidate list could enumerate every possible ballot
    // and match a stored digest back to a selection — reconstructing exactly
    // the secrecy this change exists to provide.
    expect(createSelectionDigest(SALT, [1, 2], false)).not.toBe(
      createSelectionDigest('a-different-election-salt', [1, 2], false),
    );
  });

  it('produces a fixed-width hex digest', () => {
    expect(createSelectionDigest(SALT, [1], false)).toMatch(/^[0-9a-f]{64}$/);
  });
});

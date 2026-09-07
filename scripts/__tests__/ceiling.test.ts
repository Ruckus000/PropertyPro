/**
 * Fixture tests for the shrink-only ceiling helper shared by `guard:contracts`
 * and `guard:tenant-scope`.
 *
 * Small surface, but the three-way branch is the whole point: OVER must fail,
 * UNDER must pass *and say so* (otherwise ceilings never ratchet down and the
 * next person raises them instead), and EXACTLY-AT must be silent rather than
 * nagging on every lint run.
 *
 * `.claude/rules/verification.md`: vacuously red is as useless as vacuously
 * green, so each direction is asserted, not just the failure.
 */
import { describe, it, expect } from 'vitest';
import { checkCeiling } from '../lib/ceiling';

const GUIDANCE = 'Do the migration instead.';

describe('checkCeiling', () => {
  it('fails when the count exceeds the ceiling', () => {
    const r = checkCeiling('Widgets', 47, 46, GUIDANCE);
    expect(r.failed).toBe(true);
    expect(r.message).toContain('47 exceeds the pinned ceiling of 46');
  });

  it('names both numbers in the failure, so the diff is obvious from CI output alone', () => {
    const r = checkCeiling('Widgets', 150, 121, GUIDANCE);
    expect(r.message).toContain('150');
    expect(r.message).toContain('121');
  });

  it('carries the caller guidance — a ceiling with no alternative is just a wall', () => {
    expect(checkCeiling('Widgets', 47, 46, GUIDANCE).message).toContain(GUIDANCE);
  });

  it('says raising the ceiling is deliberate, so the escape hatch is not silent', () => {
    expect(checkCeiling('Widgets', 47, 46, GUIDANCE).message).toContain('deliberate act');
  });

  it('passes and reports slack when under, naming the value to ratchet to', () => {
    const r = checkCeiling('Widgets', 44, 46, GUIDANCE);
    expect(r.failed).toBe(false);
    expect(r.message).toContain('under the ceiling of 46');
    expect(r.message).toContain('lower it to 44');
  });

  it('is silent when exactly at the ceiling', () => {
    const r = checkCeiling('Widgets', 46, 46, GUIDANCE);
    expect(r.failed).toBe(false);
    expect(r.message).toBe('');
  });

  it('does not treat the boundary as a violation (off-by-one both ways)', () => {
    expect(checkCeiling('W', 46, 46, GUIDANCE).failed).toBe(false);
    expect(checkCeiling('W', 45, 46, GUIDANCE).failed).toBe(false);
    expect(checkCeiling('W', 47, 46, GUIDANCE).failed).toBe(true);
  });

  it('handles a zero ceiling — the state a fully drained program reaches', () => {
    expect(checkCeiling('W', 0, 0, GUIDANCE)).toEqual({ failed: false, message: '' });
    expect(checkCeiling('W', 1, 0, GUIDANCE).failed).toBe(true);
  });
});

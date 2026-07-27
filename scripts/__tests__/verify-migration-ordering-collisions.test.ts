import { describe, it, expect } from 'vitest';
import { checkBaselineCollisions } from '../verify-migration-ordering';

/**
 * `checkBaselineCollisions` is the only check in the ordering guard that looks
 * outside the working tree. The others read one journal, so they structurally
 * cannot see a parallel-PR collision: two branches each append what looks
 * locally like the next free slot, both journals are internally valid, and the
 * clash only appears at merge time.
 *
 * That happened for real — PRs #852 and #853 both took idx 40 AND both derived
 * `when` 1784511314576 by adding 60000 to 0039's, because the repo's
 * hand-authored migrations copy that pattern instead of using wall-clock. It
 * was caught by a merge conflict, not by CI.
 *
 * Unlike the other guard tests in this directory, these are direct unit tests
 * rather than subprocess runs: the function is pure, and fixturing the
 * subprocess path would mean building a throwaway git repo just to hold a
 * baseline ref.
 */
type Entry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };

function entry(idx: number, when: number, tag: string): Entry {
  return { idx, version: '7', when, tag, breakpoints: true };
}

const BASELINE: Entry[] = [
  entry(39, 1784511254576, '0039_pin_function_search_path'),
  entry(40, 1784511314576, '0040_fix_rent_guard_trigger_depth'),
];

describe('checkBaselineCollisions', () => {
  it('passes when the branch adds a migration in a genuinely free slot', () => {
    const local = [...BASELINE, entry(41, 1784511374576, '0041_scope_site_assets_read')];
    expect(checkBaselineCollisions(local, BASELINE)).toEqual([]);
  });

  it('passes when the branch adds nothing', () => {
    expect(checkBaselineCollisions([...BASELINE], BASELINE)).toEqual([]);
  });

  it('rejects reusing an idx the baseline already took', () => {
    // The real #853 state before renumbering.
    const local = [...BASELINE.slice(0, 1), entry(40, 1784511374576, '0040_scope_site_assets_read')];
    const problems = checkBaselineCollisions(local, BASELINE);

    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toContain('idx 40');
    expect(problems[0].message).toContain('0040_fix_rent_guard_trigger_depth');
  });

  it('rejects reusing a `when` the baseline already took, even under a free idx', () => {
    // The subtler half: renumbering the file but keeping the derived timestamp
    // still leaves drizzle with an undefined apply order.
    const local = [...BASELINE, entry(41, 1784511314576, '0041_scope_site_assets_read')];
    const problems = checkBaselineCollisions(local, BASELINE);

    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toContain('when=1784511314576');
  });

  it('reports both when a branch collides on idx and `when` together', () => {
    // Exactly what #852 and #853 did to each other.
    const local = [...BASELINE.slice(0, 1), entry(40, 1784511314576, '0040_scope_site_assets_read')];
    const problems = checkBaselineCollisions(local, BASELINE);

    expect(problems).toHaveLength(2);
    expect(problems.every(p => p.severity === 'error')).toBe(true);
  });

  it('does not flag baseline entries against themselves', () => {
    // Guards the tag-based skip: without it every existing migration would
    // report as colliding with its own baseline row.
    expect(checkBaselineCollisions(BASELINE, BASELINE)).toEqual([]);
  });

  it('treats an empty baseline as nothing to collide with', () => {
    const local = [entry(1, 100, '0001_init')];
    expect(checkBaselineCollisions(local, [])).toEqual([]);
  });
});

/**
 * Shrink-only ceilings for guard counts.
 *
 * Several in-flight migration programs are tracked by a number nobody ratchets:
 * the uncontracted-route allowlist went 37 → 46 and hand-rolled
 * `resolveEffectiveCommunityId` calls went 121 → 150 between 2026-07-18 and
 * 2026-09-07, both with the entire gate green, because a count that no check
 * asserts can only drift upward. Re-measuring them by hand is the alternative,
 * and that is how those two numbers came to be nine and twenty-nine out of date.
 *
 * The model is the one this repo already uses for `design-token-baseline.json`
 * and `page-padding-baseline.json`, and the slack hint is lifted from
 * `verify-legacy-roles.ts`: going OVER fails; coming in UNDER passes and says so,
 * so ceilings ratchet down as work lands rather than needing a separate chore.
 */

export interface CeilingCheck {
  /** True when `actual` exceeds `ceiling` — the caller should fail. */
  failed: boolean;
  /** Human-readable line to print. Empty when exactly at the ceiling. */
  message: string;
}

/**
 * Compare a measured count against its pinned ceiling.
 *
 * `guidance` is appended to the failure message and should say what to do
 * instead of raising the number — a ceiling with no alternative is just a wall.
 */
export function checkCeiling(
  label: string,
  actual: number,
  ceiling: number,
  guidance: string,
): CeilingCheck {
  if (actual > ceiling) {
    return {
      failed: true,
      message:
        `${label}: ${actual} exceeds the pinned ceiling of ${ceiling}. ${guidance} ` +
        'Raising the ceiling is a deliberate act — do it in a reviewed commit that says why.',
    };
  }

  if (actual < ceiling) {
    return {
      failed: false,
      message: `${label}: ${actual}, under the ceiling of ${ceiling} — lower it to ${actual} when convenient.`,
    };
  }

  return { failed: false, message: '' };
}

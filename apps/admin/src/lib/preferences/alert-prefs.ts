/**
 * The alert-preference VOCABULARY, and the parser that is its trust boundary.
 *
 * Deliberately free of any database import. `AlertPrefsSection` is a
 * `'use client'` component and needs the keys, the bounds and the types; if
 * those lived alongside `createAdminTypedClient()` the service-role client
 * would be pulled into the browser bundle by a type-and-constants import. The
 * server module (`lib/server/preferences.ts`) re-exports everything here, so
 * `@/lib/server/preferences` remains the one import a server caller needs.
 *
 * ## `parseAlertPrefs` is the trust boundary
 *
 * `alert_prefs` is a `jsonb` column. The database guarantees exactly one thing
 * about it — `jsonb_typeof(...) = 'object'` (migration 0073) — and nothing at
 * all about what is inside. What IS inside was written by some build of this
 * app: possibly an older one whose vocabulary has since been retired, possibly
 * a newer one during a rollback, possibly a hand-written production repair.
 * Zod at the HTTP boundary governs what a live caller may SEND; it cannot
 * govern what is already STORED.
 *
 * So `parseAlertPrefs` is total: every input, including ones that are not
 * objects at all, maps to a complete `AlertPrefs`. Unknown keys are dropped by
 * construction (it reads only the keys it knows and never spreads the input),
 * missing keys take their default, wrong-typed keys take their default rather
 * than being coerced, and the threshold is clamped into
 * `[ERROR_SPIKE_THRESHOLD_MIN, ERROR_SPIKE_THRESHOLD_MAX]`.
 *
 * The reason that matters more than it looks: this output feeds the settings
 * screen AND `deriveCritical`, whose banner renders on every console page. A
 * throw here would blank the shell for exactly one operator — the hardest
 * possible bug to reproduce, and one a preferences row has no business being
 * able to cause.
 *
 * @module lib/preferences/alert-prefs
 */
import * as Sentry from '@sentry/nextjs';

/** The five alert categories the settings screen offers, in display order. */
export const ALERT_PREF_KEYS = [
  'errorSpikes',
  'paymentFailures',
  'newSupportThreads',
  'deletionReminders',
  'newLeadsDigest',
] as const;

export type AlertPrefKey = (typeof ALERT_PREF_KEYS)[number];

export type AlertPrefs = Record<AlertPrefKey, boolean> & { errorSpikeThreshold: number };

/**
 * Bounds on the error-spike threshold.
 *
 * The floor is 1, not 0: a threshold of 0 makes `errorsLastHour >= threshold`
 * true on a perfectly healthy platform, so the console-wide banner would be
 * permanently on and would stop meaning anything. The ceiling is a sanity rail
 * — above a thousand errors an hour nobody needs a preference to tell them.
 */
export const ERROR_SPIKE_THRESHOLD_MIN = 1;
export const ERROR_SPIKE_THRESHOLD_MAX = 1000;

/**
 * The threshold applied when an operator has expressed no preference.
 *
 * Load-bearing, and deliberately equal to the constant it replaces: the console
 * layout resolves this on every render, so "no preferences row" has to behave
 * exactly as the hardcoded `ERRORS_PER_HOUR_THRESHOLD = 10` did before wave 4.
 * `signals/health.ts` imports THIS symbol as its parameter default so the two
 * cannot drift.
 */
export const DEFAULT_ERROR_SPIKE_THRESHOLD = 10;

/**
 * Frozen: it is the seed of every parse, and a caller that mutated it would
 * change the defaults for every operator in the process, not just its own call.
 */
export const DEFAULT_ALERT_PREFS: AlertPrefs = Object.freeze({
  errorSpikes: true,
  paymentFailures: true,
  newSupportThreads: true,
  deletionReminders: true,
  newLeadsDigest: false,
  errorSpikeThreshold: DEFAULT_ERROR_SPIKE_THRESHOLD,
});

export interface AdminPreferences {
  /** ISO string, or null when nothing has ever been marked read. */
  notificationsReadAt: string | null;
  alertPrefs: AlertPrefs;
  pushSentFingerprints: string[];
}

/**
 * Clamp and round one stored threshold value.
 *
 * A non-number is a shape violation, not a value to coerce. `Number('')` is 0
 * and would clamp to 1 — silently turning "this row predates the field" into
 * "banner on every single error", which is the loudest possible wrong answer.
 */
function parseThreshold(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_ERROR_SPIKE_THRESHOLD;
  }
  const rounded = Math.round(raw);
  if (rounded < ERROR_SPIKE_THRESHOLD_MIN) return ERROR_SPIKE_THRESHOLD_MIN;
  if (rounded > ERROR_SPIKE_THRESHOLD_MAX) return ERROR_SPIKE_THRESHOLD_MAX;
  return rounded;
}

/**
 * Turn whatever is in the `alert_prefs` column into a complete `AlertPrefs`.
 *
 * Pure and total — see the module docblock for why it must never throw. The
 * outer try/catch is not decoration: a value reaching here need not have come
 * from `JSON.parse`, and an object with a throwing accessor would otherwise
 * propagate out of a function whose whole contract is that it cannot fail.
 */
export function parseAlertPrefs(raw: unknown): AlertPrefs {
  const parsed: AlertPrefs = { ...DEFAULT_ALERT_PREFS };

  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return parsed;
    }

    const source = raw as Record<string, unknown>;

    // Read only the keys we know. Unknown keys are dropped because they are
    // never looked at — not by a denylist that a future key could slip past.
    for (const key of ALERT_PREF_KEYS) {
      const value = source[key];
      // Wrong type → the default. `Boolean('no')` is `true`, so coercion here
      // would read an opt-OUT as an opt-in.
      if (typeof value === 'boolean') parsed[key] = value;
    }

    parsed.errorSpikeThreshold = parseThreshold(source.errorSpikeThreshold);

    return parsed;
  } catch (error) {
    Sentry.captureException(error, {
      level: 'warning',
      tags: { admin_preferences: 'alert_prefs_parse' },
    });
    return { ...DEFAULT_ALERT_PREFS };
  }
}

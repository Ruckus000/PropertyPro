/**
 * Data access for `platform_admin_preferences` — one row per platform admin,
 * keyed on `user_id` itself, which is what makes every write here a plain
 * upsert on the primary key.
 *
 * The table is platform-scoped and RLS-locked to `service_role` with zero
 * policies (migration 0073), so every call goes through the admin typed client
 * and is safe only because its callers run `requirePlatformAdmin()` (or
 * `requireAdminPageSession()`) first. Nothing in this module authorizes
 * anything; it takes a `userId` it is told to trust.
 *
 * The alert-preference vocabulary and its parser live in
 * `lib/preferences/alert-prefs.ts` (no database import, so the settings client
 * component can use them) and are re-exported here — a server caller needs one
 * import, not two.
 *
 * ## Reads degrade, writes do not
 *
 * `getPreferences` never throws: a missing row and a failed read both yield
 * defaults, and the failure is reported to Sentry. It is awaited by the console
 * layout on every navigation, so a preferences hiccup must not 500 the console.
 *
 * `updateAlertPrefs` and `markAllRead` DO throw on a write failure. An operator
 * flipping a switch is owed the truth about whether it stuck, and the settings
 * UI reverts its optimistic toggle on a non-2xx.
 *
 * @module lib/server/preferences
 */
import { cache } from 'react';
import * as Sentry from '@sentry/nextjs';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { PlatformAdminPreferencesRow } from '@propertypro/db/supabase/admin-types';

import {
  DEFAULT_ALERT_PREFS,
  parseAlertPrefs,
  type AdminPreferences,
  type AlertPrefs,
} from '@/lib/preferences/alert-prefs';

export {
  ALERT_PREF_KEYS,
  DEFAULT_ALERT_PREFS,
  DEFAULT_ERROR_SPIKE_THRESHOLD,
  ERROR_SPIKE_THRESHOLD_MAX,
  ERROR_SPIKE_THRESHOLD_MIN,
  parseAlertPrefs,
} from '@/lib/preferences/alert-prefs';
export type { AdminPreferences, AlertPrefKey, AlertPrefs } from '@/lib/preferences/alert-prefs';

/** The columns every read and write in this module selects back. */
const PREFERENCE_COLUMNS =
  'user_id, notifications_read_at, alert_prefs, push_sent_fingerprints, updated_at';

/** What `getPreferences` returns when there is no row, or the read failed. */
function defaultPreferences(): AdminPreferences {
  return {
    notificationsReadAt: null,
    alertPrefs: { ...DEFAULT_ALERT_PREFS },
    pushSentFingerprints: [],
  };
}

/** `push_sent_fingerprints` is CHECKed as an array; this defends the contents. */
function parseFingerprints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

function toPreferences(row: PlatformAdminPreferencesRow): AdminPreferences {
  return {
    notificationsReadAt: row.notifications_read_at,
    alertPrefs: parseAlertPrefs(row.alert_prefs),
    pushSentFingerprints: parseFingerprints(row.push_sent_fingerprints),
  };
}

/**
 * This operator's preferences, or defaults.
 *
 * Wrapped in React's `cache()` so the console layout, the dashboard page and
 * anything else in one render share a single read. Outside a Server Component
 * render — tests, plain Node — `cache()` is a passthrough, so this is a real
 * query per call there.
 *
 * Never throws. `maybeSingle()` resolves `{ data: null }` for no row, which is
 * the common case for an operator who has never opened Settings, and a genuine
 * read error is reported and then treated the same way. The alternative — a
 * console that 500s because a preferences read failed — trades a cosmetic
 * degradation for a total outage.
 */
export const getPreferences = cache(async function getPreferences(
  userId: string,
): Promise<AdminPreferences> {
  const db = createAdminTypedClient();

  // PostgREST RESOLVES with an `{ error }` object rather than throwing, so the
  // destructure is the only place a failure is visible.
  const { data, error } = await db
    .from('platform_admin_preferences')
    .select(PREFERENCE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(new Error(`platform_admin_preferences read failed: ${error.message}`), {
      level: 'warning',
      tags: { admin_preferences: 'read' },
    });
    return defaultPreferences();
  }

  if (!data) return defaultPreferences();

  return toPreferences(data as PlatformAdminPreferencesRow);
});

/**
 * Merge a partial patch into this operator's alert preferences and persist the
 * whole object.
 *
 * Read-then-write, unavoidably: the column is one jsonb document, so a partial
 * update has to be composed against the current value. Two tabs toggling two
 * different switches within the same round trip can therefore lose one of them
 * — an operator racing themselves across windows, with a fully recoverable
 * outcome (flip it again). The alternative, `jsonb_set` per key through an RPC,
 * buys that back for a migration and a function nothing else would use.
 *
 * The patch is merged on top of the PARSED current value, so a stored row
 * carrying retired keys is cleaned up by the next write rather than preserved.
 */
export async function updateAlertPrefs(
  userId: string,
  patch: Partial<AlertPrefs>,
): Promise<AdminPreferences> {
  const current = await getPreferences(userId);
  // Re-parsed rather than spread straight in: the patch has already passed Zod
  // at the route, but this function is callable from anywhere, and the clamp is
  // the property the health signal depends on.
  const merged = parseAlertPrefs({ ...current.alertPrefs, ...patch });

  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('platform_admin_preferences')
    .upsert({
      user_id: userId,
      alert_prefs: merged as unknown as Record<string, unknown>,
      // ON CONFLICT DO UPDATE does not re-apply the column default, so the
      // stamp has to be explicit or `updated_at` freezes at row creation.
      updated_at: new Date().toISOString(),
    })
    .select(PREFERENCE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to save alert preferences: ${error.message}`);
  }

  return toPreferences(data as PlatformAdminPreferencesRow);
}

/**
 * Move the tray's read watermark to `at` (default: now).
 *
 * A WATERMARK, not per-item read flags — console signals are derived on every
 * request from live data, so there is no row to mark. "Unread" means "surfaced
 * after this instant".
 *
 * The upsert names only `notifications_read_at` and `updated_at`, so
 * `ON CONFLICT DO UPDATE` touches only those columns and an operator's alert
 * prefs survive a `Mark all read` untouched.
 */
export async function markAllRead(userId: string, at: Date = new Date()): Promise<AdminPreferences> {
  const db = createAdminTypedClient();
  const stamp = at.toISOString();

  const { data, error } = await db
    .from('platform_admin_preferences')
    .upsert({
      user_id: userId,
      notifications_read_at: stamp,
      updated_at: stamp,
    })
    .select(PREFERENCE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to mark notifications read: ${error.message}`);
  }

  return toPreferences(data as PlatformAdminPreferencesRow);
}

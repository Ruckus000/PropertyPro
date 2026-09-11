'use client';

/**
 * Settings → "Alerts & push notifications": the five per-category opt-ins and
 * the error-spike threshold the console-wide critical banner is derived
 * against.
 *
 * ## Optimistic, with an honest failure
 *
 * Every change moves the switch (or the number) immediately and PUTs in the
 * background. A settings toggle that waits on a round trip reads as broken, and
 * this is a preference rather than a transaction. A non-2xx or a dropped
 * request REVERTS the control to its previous value and raises an
 * `AlertBanner` — a toggle that silently did not save is the one failure this
 * screen must never have, because nothing later contradicts it.
 *
 * The response is authoritative: the server returns the full merged
 * `alertPrefs`, which is adopted, so a clamp applied server-side shows up here
 * rather than leaving the screen disagreeing with what is stored.
 *
 * ## Why the threshold commits on blur and the switches commit on click
 *
 * A switch has one change per interaction. A number input has one per
 * KEYSTROKE — typing "250" over "10" would fire three PUTs, two of them for
 * values the operator never meant ("2", "25"), and the last write to land wins,
 * which is not necessarily the last one sent. So the threshold commits when the
 * field is left or Enter is pressed, and the value is clamped into
 * `[ERROR_SPIKE_THRESHOLD_MIN, ERROR_SPIKE_THRESHOLD_MAX]` before it is sent —
 * the route's Zod schema is strict and would 400 an out-of-range number, which
 * would be a confusing way to learn that 5000 is too many.
 *
 * ## Accessibility
 *
 * Each `Switch` carries an `aria-label` equal to its visible row label (Radix
 * renders a `button role="switch"`, which has no implicit label from
 * neighbouring text), and the threshold input is bound to a real `<label>`.
 * State is never carried by colour alone: the switch conveys it by thumb
 * position too, and the failure banner is icon + text.
 */
import { useCallback, useState } from 'react';
import { AlertBanner, Input, Switch } from '@propertypro/ui';

import {
  ERROR_SPIKE_THRESHOLD_MAX,
  ERROR_SPIKE_THRESHOLD_MIN,
  type AlertPrefKey,
  type AlertPrefs,
} from '@/lib/preferences/alert-prefs';

interface AlertRow {
  key: AlertPrefKey;
  label: string;
  /** The design's meta string. A function where it quotes the live threshold. */
  description: (prefs: AlertPrefs) => string;
}

const ROWS: AlertRow[] = [
  {
    key: 'errorSpikes',
    label: 'Production error spikes',
    description: (prefs) => `Push + banner when errors exceed ${prefs.errorSpikeThreshold}/hr`,
  },
  {
    key: 'paymentFailures',
    label: 'Payment failures',
    description: () => 'Push when a subscription payment fails',
  },
  {
    key: 'newSupportThreads',
    label: 'New support threads',
    description: () => 'Push when someone new writes to support',
  },
  {
    key: 'deletionReminders',
    label: 'Deletion reminders',
    description: () => 'Push before a scheduled account or community deletion runs',
  },
  {
    key: 'newLeadsDigest',
    label: 'New leads',
    description: () => 'A daily digest instead of a push per lead',
  },
];

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return ERROR_SPIKE_THRESHOLD_MIN;
  return Math.min(
    ERROR_SPIKE_THRESHOLD_MAX,
    Math.max(ERROR_SPIKE_THRESHOLD_MIN, Math.round(value)),
  );
}

export interface AlertPrefsSectionProps {
  initial: AlertPrefs;
}

export function AlertPrefsSection({ initial }: AlertPrefsSectionProps) {
  const [prefs, setPrefs] = useState<AlertPrefs>(initial);
  // The text the field is showing, kept separately from `prefs` so a
  // half-typed value ("" while backspacing) is not a preference yet.
  const [thresholdDraft, setThresholdDraft] = useState(String(initial.errorSpikeThreshold));
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async (patch: Partial<AlertPrefs>, previous: AlertPrefs) => {
    setError(null);
    try {
      const res = await fetch('/api/admin/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertPrefs: patch }),
      });

      if (!res.ok) {
        setPrefs(previous);
        setThresholdDraft(String(previous.errorSpikeThreshold));
        setError('We could not save that preference. Please try again.');
        return;
      }

      const body = (await res.json()) as { data?: { alertPrefs?: AlertPrefs } };
      if (body.data?.alertPrefs) {
        setPrefs(body.data.alertPrefs);
        setThresholdDraft(String(body.data.alertPrefs.errorSpikeThreshold));
      }
    } catch {
      setPrefs(previous);
      setThresholdDraft(String(previous.errorSpikeThreshold));
      setError('We could not reach the server. Please check your connection and try again.');
    }
  }, []);

  const toggle = useCallback(
    (key: AlertPrefKey, next: boolean) => {
      setPrefs((current) => {
        void save({ [key]: next } as Partial<AlertPrefs>, current);
        return { ...current, [key]: next };
      });
    },
    [save],
  );

  const commitThreshold = useCallback(() => {
    const parsed = Number.parseInt(thresholdDraft, 10);
    const next = clampThreshold(Number.isNaN(parsed) ? prefs.errorSpikeThreshold : parsed);

    // Nothing moved — an operator tabbing through the form should not write.
    if (next === prefs.errorSpikeThreshold) {
      setThresholdDraft(String(next));
      return;
    }

    const previous = prefs;
    setPrefs({ ...prefs, errorSpikeThreshold: next });
    setThresholdDraft(String(next));
    void save({ errorSpikeThreshold: next }, previous);
  }, [prefs, save, thresholdDraft]);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
        Alerts &amp; push notifications
      </h2>

      {error && (
        <div className="mb-3">
          <AlertBanner status="danger" title="Preference not saved" description={error} />
        </div>
      )}

      <div className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        {ROWS.map((row) => (
          <div key={row.key} className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-content">{row.label}</p>
                <p className="mt-0.5 text-xs text-content-tertiary">{row.description(prefs)}</p>
              </div>
              <Switch
                aria-label={row.label}
                checked={prefs[row.key]}
                onCheckedChange={(next) => toggle(row.key, next)}
                className="shrink-0"
              />
            </div>

            {row.key === 'errorSpikes' && (
              <div className="mt-3 flex items-center gap-2">
                <label
                  htmlFor="error-spike-threshold"
                  className="text-xs text-content-secondary"
                >
                  Errors per hour before alerting
                </label>
                <Input
                  id="error-spike-threshold"
                  type="number"
                  inputMode="numeric"
                  min={ERROR_SPIKE_THRESHOLD_MIN}
                  max={ERROR_SPIKE_THRESHOLD_MAX}
                  value={thresholdDraft}
                  disabled={!prefs.errorSpikes}
                  onChange={(event) => setThresholdDraft(event.target.value)}
                  onBlur={commitThreshold}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitThreshold();
                    }
                  }}
                  className="h-9 w-24"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";
import React, { useEffect, useState, type FormEvent } from 'react';
import { type EmailFrequency } from '@/lib/utils/email-preferences';

interface PreferencesState {
  emailFrequency: EmailFrequency;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  inAppEnabled: boolean;
}

interface Props {
  communityId: number;
}

export function NotificationPreferencesForm({ communityId }: Props) {
  const [values, setValues] = useState<PreferencesState>({
    emailFrequency: 'immediate',
    emailAnnouncements: true,
    emailMeetings: true,
    inAppEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrefs() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/notification-preferences?communityId=${communityId}`);
        const json = (await res.json()) as { data: PreferencesState };
        if (!cancelled) {
          setValues(json.data);
        }
      } catch {
        if (!cancelled) setError('Failed to load preferences');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchPrefs();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...values }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSuccess(true);
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading preferences...</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded border border-status-danger-border bg-status-danger-bg p-2 text-sm text-status-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-status-success-border bg-status-success-bg p-2 text-sm text-status-success">
          Preferences saved.
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-content-secondary" htmlFor="emailFrequency">
          Email frequency
        </label>
        <select
          id="emailFrequency"
          value={values.emailFrequency}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              emailFrequency: e.target.value as EmailFrequency,
            }))
          }
          className="w-full rounded border border-edge-strong px-3 py-2 text-sm"
        >
          <option value="immediate">Immediate</option>
          <option value="daily_digest">Daily digest</option>
          <option value="weekly_digest">Weekly digest</option>
          <option value="never">Never</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailAnnouncements}
            onChange={(e) =>
              setValues((v) => ({ ...v, emailAnnouncements: e.target.checked }))
            }
          />
          <span>Announcements</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailMeetings}
            onChange={(e) => setValues((v) => ({ ...v, emailMeetings: e.target.checked }))}
          />
          <span>Meeting notices</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.inAppEnabled}
            onChange={(e) => setValues((v) => ({ ...v, inAppEnabled: e.target.checked }))}
          />
          <span>In-app notifications</span>
        </label>
      </div>

      <button
        type="submit"
        className="rounded bg-interactive px-4 py-2 text-content-inverse disabled:opacity-50"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </form>
  );
}

"use client";
import React, { useEffect, useState, type FormEvent } from 'react';

interface PreferencesState {
  emailAnnouncements: boolean;
  emailDocuments: boolean;
  emailMeetings: boolean;
  emailMaintenance: boolean;
}

interface Props {
  communityId: number;
}

export function NotificationPreferencesForm({ communityId }: Props) {
  const [values, setValues] = useState<PreferencesState>({
    emailAnnouncements: true,
    emailDocuments: true,
    emailMeetings: true,
    emailMaintenance: true,
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
          setValues({
            emailAnnouncements: Boolean(json.data.emailAnnouncements),
            emailDocuments: Boolean(json.data.emailDocuments),
            emailMeetings: Boolean(json.data.emailMeetings),
            emailMaintenance: Boolean(json.data.emailMaintenance),
          });
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
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">
          Preferences saved.
        </div>
      )}

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
            checked={values.emailDocuments}
            onChange={(e) =>
              setValues((v) => ({ ...v, emailDocuments: e.target.checked }))
            }
          />
          <span>Documents</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailMeetings}
            onChange={(e) =>
              setValues((v) => ({ ...v, emailMeetings: e.target.checked }))
            }
          />
          <span>Meeting notices</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailMaintenance}
            onChange={(e) =>
              setValues((v) => ({ ...v, emailMaintenance: e.target.checked }))
            }
          />
          <span>Maintenance updates</span>
        </label>
      </div>

      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </form>
  );
}

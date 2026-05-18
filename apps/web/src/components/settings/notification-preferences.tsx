"use client";
import React, { useEffect, useState, type FormEvent } from 'react';
import {
  type CalendarReminderPreset,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences as PreferencesState,
} from '@/hooks/use-notification-preferences';

interface Props {
  communityId: number;
  reminderVisibility: {
    meetings: boolean;
    personalAssessments: boolean;
    communityAssessments: boolean;
  };
}

export function NotificationPreferencesForm({ communityId, reminderVisibility }: Props) {
  const [values, setValues] = useState<PreferencesState>({
    emailFrequency: 'immediate',
    emailAnnouncements: true,
    emailMeetings: true,
    calendarReminderPreset: '7_days_before',
    calendarReminderMeetings: true,
    calendarReminderPersonalAssessments: true,
    calendarReminderCommunityAssessments: false,
    inAppEnabled: true,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const prefsQuery = useNotificationPreferences(communityId);
  const updateMutation = useUpdateNotificationPreferences(communityId);

  useEffect(() => {
    if (prefsQuery.data) {
      setValues(prefsQuery.data);
    }
  }, [prefsQuery.data]);

  const loading = prefsQuery.isLoading;
  const saving = updateMutation.isPending;
  const error =
    saveError ?? (prefsQuery.isError ? 'Failed to load preferences' : null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSuccess(false);
    updateMutation.mutate(values, {
      onSuccess: () => setSuccess(true),
      onError: () => setSaveError('Failed to save preferences'),
    });
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

      {(reminderVisibility.meetings
        || reminderVisibility.personalAssessments
        || reminderVisibility.communityAssessments) ? (
          <div className="space-y-3 rounded border border-edge-strong p-4">
            <div className="space-y-1">
              <label
                className="block text-sm font-medium text-content-secondary"
                htmlFor="calendarReminderPreset"
              >
                Calendar event reminder timing
              </label>
              <p className="text-xs text-content-secondary">
                Meeting reminders send relative to the meeting start time. Assessment reminders
                send at 9:00 AM in your community&apos;s timezone on the selected day.
              </p>
            </div>
            <select
              id="calendarReminderPreset"
              value={values.calendarReminderPreset}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  calendarReminderPreset: e.target.value as CalendarReminderPreset,
                }))
              }
              className="w-full rounded border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="morning_of">Morning of</option>
              <option value="1_day_before">1 day before</option>
              <option value="3_days_before">3 days before</option>
              <option value="7_days_before">7 days before</option>
              <option value="off">Off</option>
            </select>

            <div className="space-y-2">
              {reminderVisibility.meetings ? (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={values.calendarReminderMeetings}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        calendarReminderMeetings: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-content">Meetings</span>
                </label>
              ) : null}
              {reminderVisibility.personalAssessments ? (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={values.calendarReminderPersonalAssessments}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        calendarReminderPersonalAssessments: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-content">My assessment due dates</span>
                </label>
              ) : null}
              {reminderVisibility.communityAssessments ? (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={values.calendarReminderCommunityAssessments}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        calendarReminderCommunityAssessments: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-content">Community assessment due dates</span>
                </label>
              ) : null}
            </div>
          </div>
        ) : null}

      <div className="space-y-2">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailAnnouncements}
            onChange={(e) =>
              setValues((v) => ({ ...v, emailAnnouncements: e.target.checked }))
            }
          />
          <span className="text-sm text-content">Announcements</span>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={values.emailMeetings}
            onChange={(e) => setValues((v) => ({ ...v, emailMeetings: e.target.checked }))}
          />
          <span className="text-sm text-content">Meeting notices</span>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={values.inAppEnabled}
            onChange={(e) => setValues((v) => ({ ...v, inAppEnabled: e.target.checked }))}
          />
          <span className="text-sm text-content">In-app notifications</span>
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

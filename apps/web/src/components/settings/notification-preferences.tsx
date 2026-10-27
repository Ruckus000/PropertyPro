"use client";
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  type CalendarReminderPreset,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsRow,
} from '@/components/settings/settings-layout';
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
  /**
   * Show the "Insurance alerts" email toggle. Only board/admins in insurance-hub
   * (condo/HOA) communities receive these, so the parent gates on that.
   */
  showInsuranceAlerts?: boolean;
}

export function NotificationPreferencesForm({
  communityId,
  reminderVisibility,
  showInsuranceAlerts = false,
}: Props) {
  const [values, setValues] = useState<PreferencesState>({
    emailFrequency: 'immediate',
    emailAnnouncements: true,
    emailMeetings: true,
    calendarReminderPreset: '7_days_before',
    calendarReminderMeetings: true,
    calendarReminderPersonalAssessments: true,
    calendarReminderCommunityAssessments: false,
    inAppEnabled: true,
    emailInsuranceAlerts: true,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const prefsQuery = useNotificationPreferences(communityId);
  const updateMutation = useUpdateNotificationPreferences(communityId);

  // Seed the editable form state from the server once per community. A
  // guard ref prevents a background refetch (e.g. the post-save
  // invalidation, or window-focus refetch) from clobbering unsaved edits.
  const seededCommunityRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefsQuery.data && seededCommunityRef.current !== communityId) {
      seededCommunityRef.current = communityId;
      setValues(prefsQuery.data);
    }
  }, [prefsQuery.data, communityId]);

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

  if (loading) {
    return (
      <SettingsCard>
        <p className="px-5 py-4 text-sm text-content-secondary">Loading preferences...</p>
      </SettingsCard>
    );
  }

  const showReminders =
    reminderVisibility.meetings
    || reminderVisibility.personalAssessments
    || reminderVisibility.communityAssessments;

  return (
    <form onSubmit={handleSubmit}>
      <SettingsCard>
        {error && (
          <div
            role="alert"
            className="bg-status-danger-bg px-5 py-3 text-sm text-status-danger"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="bg-status-success-bg px-5 py-3 text-sm text-status-success"
          >
            Preferences saved.
          </div>
        )}

        <SettingsRow
          label={<Label htmlFor="emailFrequency" className="text-base">Email frequency</Label>}
          description="Get each email as it happens, or bundled into a digest."
          control={
            <select
              id="emailFrequency"
              value={values.emailFrequency}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  emailFrequency: e.target.value as EmailFrequency,
                }))
              }
              className={SELECT_CLASS}
            >
              <option value="immediate">Immediate</option>
              <option value="daily_digest">Daily digest</option>
              <option value="weekly_digest">Weekly digest</option>
              <option value="never">Never</option>
            </select>
          }
        />

        <SettingsRow
          label="Email me about"
          description="Choose the kinds of email you receive from this community."
        >
          <div className="space-y-1">
            <PreferenceCheckbox
              id="pref-email-announcements"
              label="Announcements"
              checked={values.emailAnnouncements}
              onChange={(checked) => setValues((v) => ({ ...v, emailAnnouncements: checked }))}
            />
            <PreferenceCheckbox
              id="pref-email-meetings"
              label="Meeting notices"
              checked={values.emailMeetings}
              onChange={(checked) => setValues((v) => ({ ...v, emailMeetings: checked }))}
            />
            {showInsuranceAlerts ? (
              <PreferenceCheckbox
                id="pref-email-insurance"
                label="Insurance alerts"
                description="Reminders when the master policy or wind-mitigation report is nearing expiry."
                checked={values.emailInsuranceAlerts}
                onChange={(checked) => setValues((v) => ({ ...v, emailInsuranceAlerts: checked }))}
              />
            ) : null}
          </div>
        </SettingsRow>

        <SettingsRow
          label="In the app"
          description="Show a notification in PropertyPro as well as by email."
        >
          <PreferenceCheckbox
            id="pref-in-app"
            label="In-app notifications"
            checked={values.inAppEnabled}
            onChange={(checked) => setValues((v) => ({ ...v, inAppEnabled: checked }))}
          />
        </SettingsRow>

        {showReminders ? (
          <SettingsRow
            label={
              <Label htmlFor="calendarReminderPreset" className="text-base">
                Calendar event reminder timing
              </Label>
            }
            description={
              <>
                Meeting reminders send relative to the meeting start time. Assessment reminders
                send at 9:00 AM in your community&apos;s timezone on the selected day.
              </>
            }
            control={
              <select
                id="calendarReminderPreset"
                value={values.calendarReminderPreset}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    calendarReminderPreset: e.target.value as CalendarReminderPreset,
                  }))
                }
                className={SELECT_CLASS}
              >
                <option value="morning_of">Morning of</option>
                <option value="1_day_before">1 day before</option>
                <option value="3_days_before">3 days before</option>
                <option value="7_days_before">7 days before</option>
                <option value="off">Off</option>
              </select>
            }
          >
            <div className="space-y-1">
              {reminderVisibility.meetings ? (
                <PreferenceCheckbox
                  id="pref-reminder-meetings"
                  label="Meetings"
                  checked={values.calendarReminderMeetings}
                  onChange={(checked) =>
                    setValues((v) => ({ ...v, calendarReminderMeetings: checked }))
                  }
                />
              ) : null}
              {reminderVisibility.personalAssessments ? (
                <PreferenceCheckbox
                  id="pref-reminder-personal"
                  label="My assessment due dates"
                  checked={values.calendarReminderPersonalAssessments}
                  onChange={(checked) =>
                    setValues((v) => ({ ...v, calendarReminderPersonalAssessments: checked }))
                  }
                />
              ) : null}
              {reminderVisibility.communityAssessments ? (
                <PreferenceCheckbox
                  id="pref-reminder-community"
                  label="Community assessment due dates"
                  checked={values.calendarReminderCommunityAssessments}
                  onChange={(checked) =>
                    setValues((v) => ({ ...v, calendarReminderCommunityAssessments: checked }))
                  }
                />
              ) : null}
            </div>
          </SettingsRow>
        ) : null}

        <SettingsCardFooter note="These choices apply to this community only.">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </SettingsCardFooter>
      </SettingsCard>
    </form>
  );
}

/** Native select, sized and bordered like the shared Input. */
const SELECT_CLASS =
  'h-10 w-full rounded-sm border border-edge-strong bg-surface-card px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-56';

function PreferenceCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 py-2">
      {/* Native, not Radix: inside a <form> Radix renders a hidden bubble
          input sized by ResizeObserver, and a plain checkbox already submits
          and labels itself correctly. Tinted to the brand via accent-color. */}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-interactive"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-content">
          {label}
        </Label>
        {description ? <p className="text-sm text-content-secondary">{description}</p> : null}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Save, Check, AlertCircle, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLargeText } from '@/hooks/useLargeText';
import { MobileBackHeader } from '@/components/mobile/MobileBackHeader';
import { PageTransition, SlideUp } from '@/components/motion';

interface MobileSettingsContentProps {
  userName: string | null;
  userEmail: string;
  userPhone: string | null;
  communityId: number;
  notificationPrefs: {
    emailAnnouncements: boolean;
    emailMeetings: boolean;
    inAppEnabled: boolean;
    emailFrequency: string;
    smsEnabled: boolean;
    smsConsentGivenAt: string | null;
  };
  phoneVerified: boolean;
}

// ── Toggle switch ────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2',
        checked ? 'bg-stone-900' : 'bg-stone-200',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

// ── Toggle row ───────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
  isLast = false,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3.5',
        !isLast && 'border-b border-stone-100',
      )}
    >
      <span className="text-[15px] font-medium text-stone-900">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// ── Section label ────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-2">
      {children}
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {children}
    </div>
  );
}

// ── Input field ──────────────────────────────────────

const inputClassName =
  'w-full rounded-lg border border-stone-200 bg-white px-3 py-3 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400';

// ── Main component ───────────────────────────────────

export function MobileSettingsContent({
  userName,
  userEmail,
  userPhone,
  communityId,
  notificationPrefs,
  phoneVerified,
}: MobileSettingsContentProps) {
  // Form state — personal info
  const [name, setName] = useState(userName ?? '');
  const [phone, setPhone] = useState(userPhone ?? '');

  // Form state — notification prefs
  const [emailAnnouncements, setEmailAnnouncements] = useState(
    notificationPrefs.emailAnnouncements,
  );
  const [emailMeetings, setEmailMeetings] = useState(
    notificationPrefs.emailMeetings,
  );
  const [inAppEnabled, setInAppEnabled] = useState(
    notificationPrefs.inAppEnabled,
  );
  const [emailFrequency, setEmailFrequency] = useState(
    notificationPrefs.emailFrequency,
  );
  const [smsEnabled, setSmsEnabled] = useState(notificationPrefs.smsEnabled);

  // Accessibility
  const { largeText, toggleLargeText } = useLargeText();

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      // Update profile
      const profileRes = await fetch('/api/v1/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          fullName: name || undefined,
          phone: phone || null,
        }),
      });

      if (!profileRes.ok) {
        const body = await profileRes.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? 'Failed to update profile',
        );
      }

      // Update notification preferences
      const prefsRes = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          emailFrequency,
          emailAnnouncements,
          emailMeetings,
          inAppEnabled,
          smsEnabled,
        }),
      });

      if (!prefsRes.ok) {
        const body = await prefsRes.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? 'Failed to update notification preferences',
        );
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition>
      <MobileBackHeader title="Settings" />

      <div className="pb-8">
        {/* Personal Information */}
        <SlideUp>
          <div className="px-5 mt-5">
            <SectionLabel>Personal Information</SectionLabel>
            <Card>
              <div className="p-4 space-y-3">
                <div>
                  <label
                    htmlFor="settings-name"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="settings-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-email"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    value={userEmail}
                    disabled
                    className={cn(
                      inputClassName,
                      'bg-stone-50 text-stone-400 cursor-not-allowed',
                    )}
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-phone"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    Phone
                  </label>
                  <input
                    id="settings-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className={inputClassName}
                  />
                </div>
              </div>
            </Card>
          </div>
        </SlideUp>

        {/* Email Notifications */}
        <SlideUp delay={0.05}>
          <div className="px-5 mt-5">
            <SectionLabel>Email Notifications</SectionLabel>
            <Card>
              <ToggleRow
                label="Announcements"
                checked={emailAnnouncements}
                onChange={setEmailAnnouncements}
              />
              <ToggleRow
                label="Meeting Notices"
                checked={emailMeetings}
                onChange={setEmailMeetings}
              />
              <ToggleRow
                label="In-App Alerts"
                checked={inAppEnabled}
                onChange={setInAppEnabled}
                isLast
              />
            </Card>
          </div>
        </SlideUp>

        {/* Email Frequency */}
        <SlideUp delay={0.1}>
          <div className="px-5 mt-5">
            <SectionLabel>Email Frequency</SectionLabel>
            <Card>
              <div className="p-4">
                <select
                  value={emailFrequency}
                  onChange={(e) => setEmailFrequency(e.target.value)}
                  aria-label="Email frequency"
                  className={cn(
                    inputClassName,
                    'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2378716c%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10',
                  )}
                >
                  <option value="immediate">Immediate</option>
                  <option value="daily_digest">Daily Digest</option>
                  <option value="weekly_digest">Weekly Digest</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </Card>
          </div>
        </SlideUp>

        {/* Accessibility */}
        <SlideUp delay={0.15}>
          <div className="px-5 mt-5">
            <SectionLabel>Accessibility</SectionLabel>
            <Card>
              <ToggleRow
                label="Large Text"
                checked={largeText}
                onChange={toggleLargeText}
                isLast
              />
            </Card>
          </div>
        </SlideUp>

        {/* SMS Notifications */}
        <SlideUp delay={0.2}>
          <div className="px-5 mt-5">
            <SectionLabel>SMS Notifications</SectionLabel>
            <Card>
              {phoneVerified ? (
                <ToggleRow
                  label="SMS Notifications"
                  checked={smsEnabled}
                  onChange={setSmsEnabled}
                  isLast
                />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Smartphone
                    size={18}
                    className="shrink-0 text-stone-400"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="text-[14px] text-stone-400">
                    Add a phone number above to enable SMS notifications
                  </span>
                </div>
              )}
            </Card>
          </div>
        </SlideUp>

        {/* Save button */}
        <SlideUp delay={0.25}>
          <div className="px-5 mt-6">
            {error && (
              <div
                role="alert"
                className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[14px] text-red-600"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            )}

            {saved && (
              <div
                role="status"
                className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[14px] text-green-700"
              >
                <Check size={16} aria-hidden="true" />
                Settings saved successfully
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-[15px] font-semibold text-white transition-colors',
                'hover:bg-stone-800 active:bg-stone-950',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'h-12',
              )}
            >
              {saving ? (
                'Saving...'
              ) : saved ? (
                <>
                  <Check size={18} aria-hidden="true" />
                  Saved
                </>
              ) : (
                <>
                  <Save size={18} aria-hidden="true" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </SlideUp>
      </div>
    </PageTransition>
  );
}

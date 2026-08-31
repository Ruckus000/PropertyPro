'use client';

/**
 * SMS consent — the settings-page home for `SmsConsentForm`.
 *
 * ── Why this wrapper exists ──
 *
 * `sms-consent-form.tsx` was written, tested, and then **imported by nothing**.
 * The consequence was quiet but total: `notification_preferences.sms_enabled`
 * defaults to `false` and only the consent flow sets it, so with no reachable
 * consent UI no resident could ever opt in, and the SMS channel could never
 * have delivered a message to anyone. A dead component is not a cosmetic gap
 * when it is the only door into a feature.
 *
 * The form needs four pieces of state that live in two different places (the
 * user's phone on `users`, the consent flags on `notification_preferences`).
 * This wrapper is where those meet — the form itself stays a pure controlled
 * component.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { SmsConsentForm } from '@/components/settings/sms-consent-form';

interface SmsConsentCardProps {
  communityId: number;
  /** From the `users` row — resolved server-side, since it is not tenant data. */
  currentPhone: string | null;
  phoneVerified: boolean;
}

export function SmsConsentCard({
  communityId,
  currentPhone,
  phoneVerified,
}: SmsConsentCardProps) {
  const { data, isLoading, refetch } = useNotificationPreferences(communityId);

  // Render nothing rather than a half-populated form. Showing "SMS: off" while
  // the real value is still loading would invite a resident to toggle it and
  // race the fetch.
  if (isLoading || !data) return null;

  return (
    <SmsConsentForm
      communityId={communityId}
      currentPhone={currentPhone}
      phoneVerified={phoneVerified}
      smsEnabled={data.smsEnabled ?? false}
      smsConsentGivenAt={data.smsConsentGivenAt ?? null}
      // The form owns the mutation; this refetch keeps the card's own copy of
      // the flags honest afterwards, so a second toggle starts from the truth.
      onConsentChange={() => {
        void refetch();
      }}
    />
  );
}

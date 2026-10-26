"use client";
import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
} from '@/components/settings/settings-layout';
import {
  useSendPhoneVerification,
  useConfirmPhoneVerification,
  useSetSmsConsent,
} from '@/hooks/use-phone-verification';

interface Props {
  communityId: number;
  /** Current phone on file (E.164 format or null) */
  currentPhone: string | null;
  /** Whether phone is verified */
  phoneVerified: boolean;
  /** Whether SMS is currently enabled */
  smsEnabled: boolean;
  /** Whether SMS consent was given */
  smsConsentGivenAt: string | null;
  /** Callback when SMS consent changes */
  onConsentChange: (enabled: boolean) => void;
}

type Step = 'idle' | 'enter_phone' | 'verify_otp' | 'consent';

export function SmsConsentForm({
  communityId,
  currentPhone,
  phoneVerified,
  smsEnabled,
  smsConsentGivenAt,
  onConsentChange,
}: Props) {
  const [step, setStep] = useState<Step>(
    phoneVerified && currentPhone ? 'consent' : 'idle',
  );
  const [phone, setPhone] = useState(currentPhone ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(phoneVerified);

  const sendMutation = useSendPhoneVerification();
  const confirmMutation = useConfirmPhoneVerification();
  const consentMutation = useSetSmsConsent();

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await sendMutation.mutateAsync({ phone });

      setStep('verify_otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await confirmMutation.mutateAsync({ phone, code: otpCode });

      setVerified(true);
      setStep('consent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleConsentToggle(enabled: boolean) {
    setLoading(true);
    setError(null);

    try {
      await consentMutation.mutateAsync({ communityId, smsEnabled: enabled });

      onConsentChange(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        title="Emergency text alerts"
        description="Life-safety alerts by text message, such as hurricanes, evacuations and gas leaks."
      />

      {error && (
        <div role="alert" className="bg-status-danger-bg px-5 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Step 1: Phone not verified yet */}
      {step === 'idle' && (
        <>
          <p className="px-5 py-4 text-sm text-content-secondary">
            Verify your phone number to receive emergency SMS alerts. This is required before
            you can opt in to SMS notifications.
          </p>
          <SettingsCardFooter>
            <Button type="button" size="sm" onClick={() => setStep('enter_phone')}>
              Verify Phone Number
            </Button>
          </SettingsCardFooter>
        </>
      )}

      {/* Step 2: Enter phone number */}
      {step === 'enter_phone' && (
        <form onSubmit={handleSendOtp}>
          <div className="space-y-2 px-5 py-4">
            <Label htmlFor="phone-input">Phone number (US)</Label>
            <Input
              id="phone-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(305) 555-1234"
              className="sm:max-w-xs"
            />
          </div>
          <SettingsCardFooter note="We'll text you a code to confirm the number.">
            <Button type="button" variant="outline" size="sm" onClick={() => setStep('idle')}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading || !phone.trim()}>
              {loading ? 'Sending...' : 'Send Verification Code'}
            </Button>
          </SettingsCardFooter>
        </form>
      )}

      {/* Step 3: Enter OTP */}
      {step === 'verify_otp' && (
        <form onSubmit={handleVerifyOtp}>
          <div className="space-y-2 px-5 py-4">
            <p className="text-sm text-content-secondary">
              We sent a verification code to <strong>{formatPhoneDisplay(phone)}</strong>.
            </p>
            <Label htmlFor="otp-input">Verification code</Label>
            <Input
              id="otp-input"
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="123456"
              maxLength={10}
              className="sm:max-w-xs"
            />
          </div>
          <SettingsCardFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setStep('enter_phone'); setOtpCode(''); }}
            >
              Resend Code
            </Button>
            <Button type="submit" size="sm" disabled={loading || !otpCode.trim()}>
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </SettingsCardFooter>
        </form>
      )}

      {/* Step 4: Consent toggle */}
      {step === 'consent' && verified && (
        <div className="space-y-4 px-5 py-4">
          <p className="flex items-center gap-2 text-sm text-status-success">
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Phone verified: {formatPhoneDisplay(phone)}
          </p>

          <div className="flex items-start gap-3">
            <Checkbox
              id="sms-consent"
              checked={smsEnabled}
              onCheckedChange={(next) => handleConsentToggle(next === true)}
              disabled={loading}
              className="mt-1"
            />
            <Label htmlFor="sms-consent" className="cursor-pointer text-sm font-normal text-content">
              By enabling SMS notifications, I consent to receive emergency and community
              alerts via text message from this community.
            </Label>
          </div>

          <p className="text-sm text-content-tertiary">
            Message and data rates may apply. You can opt out at any time by replying STOP
            to any message or by disabling SMS in your settings. Emergency notifications
            are sent only for life-safety events (hurricanes, evacuations, gas leaks, etc.).
            See our{' '}
            <Link href="/legal/terms" className="text-content-link underline hover:text-content-link-hover">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/legal/privacy" className="text-content-link underline hover:text-content-link-hover">
              Privacy Policy
            </Link>
            .
          </p>

          {smsConsentGivenAt && smsEnabled && (
            <p className="text-sm text-content-tertiary">
              Consent given: {new Date(smsConsentGivenAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

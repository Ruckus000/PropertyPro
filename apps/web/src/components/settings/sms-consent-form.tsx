"use client";
import React, { useState, type FormEvent } from 'react';
import { formatPhoneDisplay } from '@/lib/utils/phone';

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

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/phone/verify/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send verification code');
      }

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
      const res = await fetch('/api/v1/phone/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Invalid verification code');
      }

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
      const res = await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          emailFrequency: 'immediate',
          emailAnnouncements: true,
          emailMeetings: true,
          inAppEnabled: true,
          smsEnabled: enabled,
          smsEmergencyOnly: true,
        }),
      });

      if (!res.ok) throw new Error('Failed to update SMS preferences');

      onConsentChange(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">SMS Emergency Notifications</h3>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Step 1: Phone not verified yet */}
      {step === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Verify your phone number to receive emergency SMS alerts. This is required before
            you can opt in to SMS notifications.
          </p>
          <button
            type="button"
            onClick={() => setStep('enter_phone')}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Verify Phone Number
          </button>
        </div>
      )}

      {/* Step 2: Enter phone number */}
      {step === 'enter_phone' && (
        <form onSubmit={handleSendOtp} className="space-y-3">
          <label className="block text-sm text-gray-700" htmlFor="phone-input">
            Phone number (US)
          </label>
          <input
            id="phone-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(305) 555-1234"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Enter OTP */}
      {step === 'verify_otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <p className="text-sm text-gray-600">
            We sent a verification code to <strong>{formatPhoneDisplay(phone)}</strong>.
          </p>
          <label className="block text-sm text-gray-700" htmlFor="otp-input">
            Verification code
          </label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="123456"
            maxLength={10}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !otpCode.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('enter_phone'); setOtpCode(''); }}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Resend Code
            </button>
          </div>
        </form>
      )}

      {/* Step 4: Consent toggle */}
      {step === 'consent' && verified && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Phone verified: {formatPhoneDisplay(phone)}
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => handleConsentToggle(e.target.checked)}
              disabled={loading}
              className="mt-1"
            />
            <span className="text-sm text-gray-700">
              I consent to receive emergency SMS notifications from this community.
            </span>
          </label>

          <p className="text-xs text-gray-500">
            Message and data rates may apply. Reply STOP to unsubscribe at any time.
            Emergency notifications are sent only for life-safety events
            (hurricanes, evacuations, gas leaks, etc.).
          </p>

          {smsConsentGivenAt && smsEnabled && (
            <p className="text-xs text-gray-400">
              Consent given: {new Date(smsConsentGivenAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

type FormState = 'idle' | 'submitting' | 'otp_input' | 'verifying' | 'success';

interface FieldErrors {
  fullName?: string;
  email?: string;
  unitNumber?: string;
  otp?: string;
}

interface Props {
  communityId: number;
  communitySlug: string;
  communityName: string;
  refCode?: string;
}

export function RequestAccessForm({ communityId, communitySlug, communityName, refCode }: Props) {
  const [state, setState] = useState<FormState>('idle');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [isUnitOwner, setIsUnitOwner] = useState(false);
  const [otp, setOtp] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function validateForm(): boolean {
    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.fullName = 'Full name is required.';
    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;

    setState('submitting');
    try {
      const res = await fetch('/api/v1/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          communitySlug,
          email,
          fullName,
          phone: undefined,
          claimedUnitNumber: unitNumber.trim() || undefined,
          isUnitOwner,
          refCode,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Something went wrong. Please try again.');
      }

      const body = await res.json() as { requestId: string };
      setRequestId(body.requestId);
      setState('otp_input');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setState('idle');
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!otp.trim() || otp.length !== 6) {
      setFieldErrors({ otp: 'Enter the 6-digit code from your email.' });
      return;
    }
    setFieldErrors({});

    if (!requestId) return;
    setState('verifying');

    try {
      const res = await fetch('/api/v1/access-requests/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, otp, communityId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Verification failed. Please try again.');
      }

      setState('success');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setState('otp_input');
    }
  }

  async function handleResend() {
    setServerError(null);
    setOtp('');
    setState('idle');
    // Re-submit to generate a new code
    await handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  }

  return (
    <div
      className="w-full max-w-md mx-auto rounded-[10px] border p-6"
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--border-default)',
      }}
    >
      {/* Header */}
      <div className="mb-6">
        <p
          className="text-sm font-medium mb-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {communityName}
        </p>
        <h1
          className="text-xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {state === 'success' ? 'Request submitted' : 'Request access'}
        </h1>
      </div>

      {/* Server error banner */}
      {serverError && (
        <div
          className="mb-4 rounded-[6px] border px-4 py-3 text-sm"
          role="alert"
          style={{
            background: 'var(--surface-danger-subtle)',
            borderColor: 'var(--border-danger)',
            color: 'var(--text-danger)',
          }}
        >
          {serverError}
        </div>
      )}

      {/* Success state */}
      {state === 'success' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle
            className="h-12 w-12"
            aria-hidden="true"
            style={{ color: 'var(--interactive-primary)' }}
          />
          <div>
            <p
              className="text-base font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Your request has been submitted
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              An administrator will review it shortly.
            </p>
          </div>
        </div>
      )}

      {/* OTP input state */}
      {(state === 'otp_input' || state === 'verifying') && (
        <form onSubmit={handleVerify} noValidate className="space-y-4">
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            We&apos;ve sent a 6-digit code to{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {email}
            </span>
            . Enter it below to verify your email address.
          </p>

          <div className="space-y-2">
            <Label htmlFor="otp" style={{ color: 'var(--text-primary)' }}>
              Verification code
            </Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              aria-describedby={fieldErrors.otp ? 'otp-error' : undefined}
              className={cn(fieldErrors.otp && 'border-[color:var(--border-danger)]')}
            />
            {fieldErrors.otp && (
              <p id="otp-error" className="text-xs" style={{ color: 'var(--text-danger)' }}>
                {fieldErrors.otp}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={state === 'verifying'}
            aria-busy={state === 'verifying'}
          >
            {state === 'verifying' ? 'Verifying…' : 'Verify'}
          </Button>

          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Didn&apos;t receive a code?{' '}
            <button
              type="button"
              onClick={handleResend}
              className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--interactive-primary)] rounded-sm"
              style={{ color: 'var(--interactive-primary)' }}
            >
              Resend code
            </button>
          </p>
        </form>
      )}

      {/* Idle / submitting form */}
      {(state === 'idle' || state === 'submitting') && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Full name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" style={{ color: 'var(--text-primary)' }}>
              Full name <span aria-hidden="true" style={{ color: 'var(--text-danger)' }}>*</span>
            </Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-required="true"
              aria-describedby={fieldErrors.fullName ? 'fullName-error' : undefined}
              className={cn(fieldErrors.fullName && 'border-[color:var(--border-danger)]')}
            />
            {fieldErrors.fullName && (
              <p id="fullName-error" className="text-xs" style={{ color: 'var(--text-danger)' }}>
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" style={{ color: 'var(--text-primary)' }}>
              Email address <span aria-hidden="true" style={{ color: 'var(--text-danger)' }}>*</span>
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-required="true"
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              className={cn(fieldErrors.email && 'border-[color:var(--border-danger)]')}
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-xs" style={{ color: 'var(--text-danger)' }}>
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Unit number */}
          <div className="space-y-2">
            <Label htmlFor="unitNumber" style={{ color: 'var(--text-primary)' }}>
              Unit number{' '}
              <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                (optional)
              </span>
            </Label>
            <Input
              id="unitNumber"
              type="text"
              autoComplete="off"
              placeholder="e.g. 4B"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              aria-describedby={fieldErrors.unitNumber ? 'unitNumber-error' : undefined}
              className={cn(fieldErrors.unitNumber && 'border-[color:var(--border-danger)]')}
            />
            {fieldErrors.unitNumber && (
              <p id="unitNumber-error" className="text-xs" style={{ color: 'var(--text-danger)' }}>
                {fieldErrors.unitNumber}
              </p>
            )}
          </div>

          {/* Unit owner toggle */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="isUnitOwner"
              checked={isUnitOwner}
              onCheckedChange={(checked) => setIsUnitOwner(checked === true)}
            />
            <Label
              htmlFor="isUnitOwner"
              className="cursor-pointer font-normal"
              style={{ color: 'var(--text-primary)' }}
            >
              I am a unit owner
            </Label>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={state === 'submitting'}
            aria-busy={state === 'submitting'}
          >
            {state === 'submitting' ? 'Submitting…' : 'Request access'}
          </Button>
        </form>
      )}
    </div>
  );
}

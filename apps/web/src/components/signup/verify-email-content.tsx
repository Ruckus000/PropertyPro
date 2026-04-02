'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface ResendSuccessData {
  sent?: boolean;
  cooldownSeconds?: number;
  alreadyVerified?: boolean;
  signupRequestId?: string;
}

interface ResendErrorData {
  message?: string;
  cooldownRemainingSeconds?: number;
}

const POLL_INTERVAL_MS = 5000;

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const signupRequestId = searchParams.get('signupRequestId') ?? '';
  // Masked email passed as query param from the signup form (already masked, safe to expose).
  const maskedEmail = searchParams.get('email') || null;

  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [showResent, setShowResent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [verified, setVerified] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for email verification — auto-navigate to checkout when confirmed
  useEffect(() => {
    if (!signupRequestId || verified) return;

    async function checkVerification() {
      try {
        const response = await fetch('/api/v1/auth/confirm-verification', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signupRequestId }),
        });

        if (!response.ok) return; // Not verified yet or error — keep polling

        const payload = (await response.json()) as {
          data?: { success: boolean; signupRequestId: string };
        };

        if (payload.data?.success) {
          setVerified(true);
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(
            `/signup/checkout?signupRequestId=${encodeURIComponent(signupRequestId)}`,
          );
        }
      } catch {
        // Network error — keep polling silently
      }
    }

    // Check immediately on mount (in case already verified)
    checkVerification();

    pollRef.current = setInterval(checkVerification, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [signupRequestId, verified, router]);

  // Cooldown tick
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
      return;
    }

    cooldownRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldownSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = useCallback(async () => {
    if (!signupRequestId || isResending || cooldownSeconds > 0) return;

    setIsResending(true);
    setResendError(null);

    try {
      const response = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signupRequestId }),
      });

      if (response.status === 409) {
        // Already verified — redirect to checkout
        const payload = (await response.json()) as { data?: ResendSuccessData };
        if (payload.data?.alreadyVerified) {
          router.push(
            `/signup/checkout?signupRequestId=${encodeURIComponent(signupRequestId)}`,
          );
          return;
        }
      }

      if (response.status === 429) {
        const payload = (await response.json()) as { error?: ResendErrorData };
        const remaining = payload.error?.cooldownRemainingSeconds ?? 120;
        setCooldownSeconds(remaining);
        return;
      }

      if (!response.ok) {
        const payload = (await response.json()) as { error?: ResendErrorData };
        setResendError(payload.error?.message ?? 'Unable to resend verification email.');
        return;
      }

      const payload = (await response.json()) as { data?: ResendSuccessData };

      // Show confirmation
      setShowResent(true);
      setTimeout(() => setShowResent(false), 4000);

      // Start cooldown
      setCooldownSeconds(payload.data?.cooldownSeconds ?? 120);
    } catch {
      setResendError('Unable to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  }, [signupRequestId, isResending, cooldownSeconds, router]);

  // Missing signupRequestId
  if (!signupRequestId) {
    return (
      <div className="rounded-md border border-edge bg-surface-card p-8 text-center shadow-e0">
        <h2 className="text-xl font-semibold text-content">Invalid link</h2>
        <p className="mt-2 text-sm text-content-secondary">
          This page is missing required information.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          Start a new signup
        </Link>
      </div>
    );
  }

  const formatCooldown = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isButtonDisabled = isResending || cooldownSeconds > 0 || verified;

  // Verified — show brief success before redirect
  if (verified) {
    return (
      <div className="rounded-md border border-status-success-border bg-status-success-bg p-8 text-center shadow-e0">
        <div className="mb-4 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10 text-status-success" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-content">Email verified</h2>
        <p className="mt-2 text-sm text-content-secondary">Taking you to checkout...</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-edge bg-surface-card p-8 shadow-e0">
        {/* Mail icon */}
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-interactive/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-7 w-7 text-interactive"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-center text-xl font-semibold text-content">Check your email</h2>

        {/* Body */}
        <p className="mt-3 text-center text-sm leading-relaxed text-content-secondary">
          {maskedEmail ? (
            <>
              We sent a verification link to{' '}
              <span className="font-semibold text-content">{maskedEmail}</span>.
              <br />
            </>
          ) : (
            <>We sent you a verification link. </>
          )}
          Click the link to verify your email, then you'll continue to checkout.
        </p>

        {/* Resend button */}
        <div className="mt-6 flex flex-col items-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={isButtonDisabled}
            aria-label={
              cooldownSeconds > 0
                ? `Resend email available in ${formatCooldown(cooldownSeconds)}`
                : 'Resend verification email'
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-edge-strong bg-surface-card px-5 text-sm font-medium text-content transition-colors hover:bg-surface-muted hover:border-edge-strong disabled:cursor-not-allowed disabled:text-content-tertiary max-[480px]:h-11 max-[480px]:w-full"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
            {cooldownSeconds > 0 ? (
              <span>
                Resend in{' '}
                <span className="inline-block min-w-[36px] tabular-nums">
                  {formatCooldown(cooldownSeconds)}
                </span>
              </span>
            ) : isResending ? (
              'Sending...'
            ) : (
              'Resend email'
            )}
          </button>

          {/* Resent confirmation */}
          {showResent ? (
            <p
              className="mt-3 flex items-center gap-2 text-xs text-status-success animate-in fade-in duration-200"
              role="status"
              aria-live="polite"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              Verification email resent
            </p>
          ) : null}

          {/* Resend error */}
          {resendError ? (
            <p className="mt-3 text-xs text-status-danger" role="alert">
              {resendError}
            </p>
          ) : null}
        </div>

        {/* Spam hint */}
        <div className="mt-6 border-t border-edge-subtle pt-5 text-center text-xs text-content-tertiary">
          Don't see it? Check your spam or promotions folder.
        </div>
      </div>

      {/* Footer link */}
      <p className="text-center">
        <Link
          href="/signup"
          className="text-sm text-content-secondary transition-colors hover:text-interactive"
        >
          Wrong email? Go back and update it
        </Link>
      </p>
    </>
  );
}

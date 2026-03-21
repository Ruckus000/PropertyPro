'use client';

import { useState, useEffect, type FormEvent } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { resetPasswordSchema } from '@/lib/auth/schemas';
import { updatePasswordAction } from '@/lib/auth/actions';
import { createBrowserClient } from '@propertypro/db/supabase/client';

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  // Manual fallback: user pastes their reset token directly
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualTokenError, setManualTokenError] = useState('');
  const [manualTokenLoading, setManualTokenLoading] = useState(false);

  useEffect(() => {
    // Supabase appends the auth code as a URL fragment (#access_token=...&type=recovery)
    // The browser client picks it up automatically via onAuthStateChange.
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session (page might have loaded with the token)
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    // Increased to 15 s to give Supabase more time to process the URL fragment
    const timeout = setTimeout(() => {
      setSessionReady((ready) => {
        if (!ready) setSessionError(true);
        return ready;
      });
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setLoading(true);

    try {
      const result = await updatePasswordAction(parsed.data.password);

      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualToken(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setManualTokenError('');

    const token = manualToken.trim();
    if (!token) {
      setManualTokenError('Please paste your reset token.');
      return;
    }

    setManualTokenLoading(true);

    try {
      const supabase = createBrowserClient();
      // verifyOtp with type 'recovery' exchanges the token for a session
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery',
      });

      if (otpError) {
        setManualTokenError('That token is invalid or has expired. Please request a new reset link.');
      } else {
        // Session is now active — show the password form
        setSessionError(false);
        setSessionReady(true);
        setShowManualFallback(false);
      }
    } catch {
      setManualTokenError('Something went wrong. Please try again.');
    } finally {
      setManualTokenLoading(false);
    }
  }

  if (sessionError) {
    if (showManualFallback) {
      return (
        <div data-testid="reset-password-manual-fallback">
          <h2 className="mb-1 text-xl font-semibold text-content">Enter your reset token</h2>
          <p className="mb-4 text-sm text-content-secondary">
            Paste the token from your reset email below. It looks like a long string of characters at
            the end of the link after <code className="font-mono text-xs">token_hash=</code>.
          </p>
          <form onSubmit={handleManualToken} className="space-y-4">
            <div>
              <label htmlFor="manualToken" className="mb-1 block text-sm font-medium text-content-secondary">
                Reset token
              </label>
              <input
                id="manualToken"
                name="manualToken"
                type="text"
                autoComplete="off"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
                placeholder="Paste your token here"
                disabled={manualTokenLoading}
              />
            </div>

            {manualTokenError && (
              <p className="text-sm text-status-danger" role="alert">
                {manualTokenError}
              </p>
            )}

            <button
              type="submit"
              disabled={manualTokenLoading}
              className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {manualTokenLoading ? 'Verifying...' : 'Verify token'}
            </button>

            <button
              type="button"
              onClick={() => setShowManualFallback(false)}
              className="w-full text-center text-sm text-content-secondary underline hover:text-content"
            >
              Back
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="text-center" data-testid="reset-password-expired">
        <h2 className="mb-2 text-xl font-semibold text-content">Invalid or expired link</h2>
        <p className="mb-4 text-content-secondary">
          This password reset link has expired or is invalid. Please request a new one.
        </p>
        <div className="space-y-3">
          <div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-block text-sm text-content-link underline hover:text-content"
            >
              Try again
            </button>
            <span className="mx-2 text-sm text-content-secondary">·</span>
            <button
              type="button"
              onClick={() => setShowManualFallback(true)}
              className="inline-block text-sm text-content-link underline hover:text-content"
            >
              Enter token manually
            </button>
          </div>
          <div>
            <a
              href="/auth/forgot-password"
              className="inline-block text-sm text-content-link underline hover:text-content"
            >
              Request new reset link
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center" data-testid="reset-password-success">
        <h2 className="mb-2 text-xl font-semibold text-content">Password updated</h2>
        <p className="mb-4 text-content-secondary">
          Your password has been updated successfully. You can now log in with your new password.
        </p>
        <a href="/auth/login" className="inline-block text-content-link underline hover:text-content-link">
          Go to login
        </a>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-testid="reset-password-loading">
        {/* Loading spinner */}
        <svg
          className="h-6 w-6 animate-spin text-interactive"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-content-secondary">Verifying reset link&hellip;</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="reset-password-form">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-content-secondary">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="At least 8 characters"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-content-secondary">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="Re-enter your new password"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-status-danger" role="alert" data-testid="reset-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Updating...' : 'Set new password'}
      </button>
    </form>
  );
}

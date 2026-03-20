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

    // If no session after a timeout, show error
    const timeout = setTimeout(() => {
      setSessionReady((ready) => {
        if (!ready) setSessionError(true);
        return ready;
      });
    }, 5000);

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

  if (sessionError) {
    return (
      <div className="text-center" data-testid="reset-password-expired">
        <h2 className="mb-2 text-xl font-semibold text-content">Invalid or expired link</h2>
        <p className="mb-4 text-content-secondary">
          This password reset link has expired or is invalid. Please request a new one.
        </p>
        <a
          href="/auth/forgot-password"
          className="inline-block text-content-link underline hover:text-content-link"
        >
          Request new reset link
        </a>
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
      <div className="text-center" data-testid="reset-password-loading">
        <p className="text-content-secondary">Verifying reset link...</p>
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

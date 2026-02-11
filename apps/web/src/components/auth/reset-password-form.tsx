'use client';

import { useState, useEffect, type FormEvent } from 'react';
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session (page might have loaded with the token)
    supabase.auth.getSession().then(({ data: { session } }) => {
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
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid or expired link</h2>
        <p className="text-gray-600 mb-4">
          This password reset link has expired or is invalid. Please request a new one.
        </p>
        <a
          href="/auth/forgot-password"
          className="inline-block text-blue-600 hover:text-blue-700 underline"
        >
          Request new reset link
        </a>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center" data-testid="reset-password-success">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Password updated</h2>
        <p className="text-gray-600 mb-4">
          Your password has been updated successfully. You can now log in with your new password.
        </p>
        <a
          href="/auth/login"
          className="inline-block text-blue-600 hover:text-blue-700 underline"
        >
          Go to login
        </a>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="text-center" data-testid="reset-password-loading">
        <p className="text-gray-600">Verifying reset link...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="reset-password-form">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="At least 8 characters"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="Re-enter your new password"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert" data-testid="reset-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Updating...' : 'Set new password'}
      </button>
    </form>
  );
}

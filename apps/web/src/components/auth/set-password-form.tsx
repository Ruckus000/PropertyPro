'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@propertypro/db/supabase/client';

interface Props {
  token: string;
  communityId: number;
}

export function SetPasswordForm({ token, communityId }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (password.length < 8 || password.length > 72) {
      setError('Password must be between 8 and 72 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/invitations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, communityId, password }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { code?: string; message?: string } };
        if (json?.error?.code === 'TOKEN_USED') {
          setError('This invitation link has already been used.');
        } else if (json?.error?.code === 'TOKEN_EXPIRED') {
          setError('This invitation link has expired.');
        } else {
          setError(json?.error?.message ?? 'Failed to accept invitation.');
        }
        setLoading(false);
        return;
      }

      const json = (await res.json()) as { data: { email: string } };
      const email = json.data.email;

      // Sign in the user with the new credentials
      const supabase = createBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError('Account created, but failed to sign in. Please log in manually.');
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

  if (success) {
    return (
      <div className="text-center" data-testid="invite-success">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Welcome aboard!</h2>
        <p className="mb-4 text-gray-600">Your account is ready.</p>
        <a href="/" className="inline-block text-blue-600 underline hover:text-blue-700">
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="set-password-form">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
          Password
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
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700">
          Confirm password
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
          placeholder="Re-enter your password"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert" data-testid="set-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Setting up...' : 'Set password and join'}
      </button>
    </form>
  );
}


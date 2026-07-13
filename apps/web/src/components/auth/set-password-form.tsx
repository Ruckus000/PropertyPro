'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@propertypro/db/supabase/client';
import { PASSWORD_POLICY } from '@propertypro/shared';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { useAcceptInvitation } from '@/hooks/use-invitations';

interface Props {
  token: string;
  communityId: number;
}

function validatePassword(pw: string): string | null {
  for (const rule of PASSWORD_POLICY.rules) {
    if (!rule.test(pw)) {
      return rule.message;
    }
  }
  return null;
}

export function SetPasswordForm({ token, communityId }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const acceptInvitation = useAcceptInvitation();

  function handlePasswordChange(value: string): void {
    setPassword(value);
    if (error) {
      setError('');
    }
  }

  function handleConfirmPasswordChange(value: string): void {
    setConfirmPassword(value);
    if (error) {
      setError('');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    let email: string;
    try {
      email = await acceptInvitation.mutateAsync({ token, communityId, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
      setLoading(false);
      return;
    }

    try {
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
    // B1: send invited residents to their role-tailored welcome screen (not the
    // bare dashboard). A full-page <a> load ensures the freshly-set Supabase auth
    // cookies are present when the /welcome server component authenticates; the
    // welcome page redirects to the dashboard once its checklist is bootstrapped,
    // so this only shows on first arrival.
    return (
      <div className="text-center" data-testid="invite-success">
        <h2 className="mb-2 text-xl font-semibold text-content">Welcome aboard!</h2>
        <p className="mb-4 text-content-secondary">Your account is ready.</p>
        <a
          href={`/welcome?communityId=${communityId}`}
          className="inline-block text-content-link underline hover:text-content-link"
        >
          Continue
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="set-password-form">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-content-secondary">
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
          onChange={(e) => handlePasswordChange(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="Min. 8 characters with mixed case, number & symbol"
          disabled={loading}
          aria-describedby="invite-password-strength"
        />
        <PasswordStrengthIndicator
          password={password}
          id="invite-password-strength"
          hideOnEmpty
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-content-secondary">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => handleConfirmPasswordChange(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="Re-enter your password"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-status-danger" role="alert" data-testid="set-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Setting up...' : 'Set password and join'}
      </button>
    </form>
  );
}

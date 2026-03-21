'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@propertypro/db/supabase/client';

interface Props {
  token: string;
  communityId: number;
}

interface PasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At most 72 characters', test: (pw) => pw.length <= 72 },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^a-zA-Z0-9]/.test(pw) },
];

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number.';
  if (!/[^a-zA-Z0-9]/.test(pw)) return 'Password must contain a special character.';
  return null;
}

export function SetPasswordForm({ token, communityId }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

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
        <h2 className="mb-2 text-xl font-semibold text-content">Welcome aboard!</h2>
        <p className="mb-4 text-content-secondary">Your account is ready.</p>
        <a href="/" className="inline-block text-content-link underline hover:text-content-link">
          Go to dashboard
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
          onChange={(e) => {
            setPassword(e.target.value);
            setShowRequirements(true);
          }}
          onFocus={() => setShowRequirements(true)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="Min. 8 characters with mixed case, number & symbol"
          disabled={loading}
        />
        {showRequirements && password.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Password requirements">
            {PASSWORD_REQUIREMENTS.map((req) => {
              const met = req.test(password);
              return (
                <li
                  key={req.label}
                  className={`flex items-center gap-1.5 text-xs ${met ? 'text-status-success' : 'text-content-tertiary'}`}
                >
                  <span aria-hidden="true">{met ? '✓' : '○'}</span>
                  {req.label}
                </li>
              );
            })}
          </ul>
        )}
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
          onChange={(e) => setConfirmPassword(e.target.value)}
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


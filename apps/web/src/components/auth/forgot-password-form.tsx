'use client';

import { useState, type FormEvent } from 'react';
import { forgotPasswordSchema } from '@/lib/auth/schemas';
import { requestPasswordReset } from '@/lib/auth/actions';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email');
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(parsed.data.email);

      if (!result.success && result.rateLimitResult && !result.rateLimitResult.allowed) {
        setError(result.message);
        setLoading(false);
        return;
      }

      setMessage(result.message);
      setSubmitted(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center" data-testid="forgot-password-success">
        <h2 className="text-xl font-semibold text-content mb-2">Check your email</h2>
        <p className="text-content-secondary">{message}</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block text-content-link hover:text-content-link underline"
        >
          Back to login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="forgot-password-form">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-content-secondary mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-2 focus:ring-focus/20"
          placeholder="you@example.com"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-status-danger" role="alert" data-testid="forgot-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send reset link'}
      </button>

      <p className="text-center text-sm text-content-tertiary">
        Remember your password?{' '}
        <a href="/auth/login" className="text-content-link hover:text-content-link underline">
          Log in
        </a>
      </p>
    </form>
  );
}

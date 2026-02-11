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
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-600">{message}</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block text-blue-600 hover:text-blue-700 underline"
        >
          Back to login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="forgot-password-form">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="you@example.com"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert" data-testid="forgot-password-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send reset link'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Remember your password?{' '}
        <a href="/auth/login" className="text-blue-600 hover:text-blue-700 underline">
          Log in
        </a>
      </p>
    </form>
  );
}

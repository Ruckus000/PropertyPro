'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface LoginFormProps {
  returnTo: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleEmailChange(value: string): void {
    setEmail(value);
    if (error) {
      setError(null);
    }
  }

  function handlePasswordChange(value: string): void {
    setPassword(value);
    if (error) {
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    let signInError: { message: string } | null;
    try {
      // Loaded on submit, not at module scope: the Supabase client is ~180 KiB
      // and nothing on this page needs it before the user signs in.
      const { createBrowserClient } = await import('@/lib/supabase/client');
      ({ error: signInError } = await createBrowserClient().auth.signInWithPassword({
        email,
        password,
      }));
    } catch {
      signInError = { message: "We couldn't reach the sign-in service. Please try again." };
    }

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(returnTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-edge bg-surface-card p-6">
      {error ? <p className="text-sm text-status-danger" role="alert">{error}</p> : null}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => handleEmailChange(event.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => handlePasswordChange(event.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-60"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}

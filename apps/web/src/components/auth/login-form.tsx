'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

interface LoginFormProps {
  returnTo: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
          onChange={(event) => setEmail(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
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

'use client';

/**
 * P1-4: Operator Console login page.
 *
 * Dark background (#111827) distinguishes this from the client-facing platform.
 * Shows an "Access Denied" message (no redirect loop) when the user's account
 * is not in platform_admin_users.
 */
import { useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import { safeReturnTo } from '@/lib/auth/safe-return-to';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const accessDenied = searchParams.get('error') === 'access_denied';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createBrowserClient(url, key, { cookieOptions: ADMIN_COOKIE_OPTIONS });
  }, []);

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-inverse-subtle px-4">
        <div className="w-full max-w-sm rounded-lg bg-surface-card p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-danger-subtle">
              <svg className="h-6 w-6 text-status-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-content">Access Denied</h1>
            <p className="mt-2 text-sm text-content-secondary">
              Your account does not have platform administrator privileges. Contact a super admin to be granted access.
            </p>
          </div>
          <a
            href="/auth/login"
            className="block w-full rounded-md bg-interactive px-4 py-2.5 text-center text-sm font-medium text-content-inverse hover:bg-interactive-hover transition-colors"
          >
            Return to Login
          </a>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!supabase) {
        throw new Error('Missing Supabase configuration');
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      // Middleware will verify platform_admin_users and redirect to /auth/login?error=access_denied
      // if this user isn't an admin. On success it passes through to returnTo.
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    // Skip-link target: the login page renders outside AdminLayout.
    <div id="main-content" className="flex min-h-screen items-center justify-center bg-surface-inverse-subtle px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <span className="text-xl font-bold text-white">PropertyPro</span>
            <span className="rounded bg-coral-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Operator Console</h1>
          <p className="mt-1 text-sm text-content-disabled">PropertyPro Platform Administration</p>
        </div>

        {/* Card */}
        <div className="rounded-lg bg-surface-card p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md border border-edge-strong px-3 py-2 text-sm placeholder-content-placeholder shadow-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
                placeholder="admin@getpropertypro.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border border-edge-strong px-3 py-2 text-sm placeholder-content-placeholder shadow-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { PropertyProLoader } from '@/components/brand/property-pro-loader';

interface LoginFormProps {
  returnTo: string;
  /** Shown on the loader after sign-in ("Opening Sunset Condos"). */
  destinationName?: string | null;
}

/**
 * If the dashboard has not replaced this page after this long, drop the
 * loader so the person is not stuck behind it with no way out.
 */
const ENTERING_TIMEOUT_MS = 20_000;

const UNREACHABLE = "We couldn't reach the sign-in service. Please try again.";

const INPUT_CLASS =
  'h-12 w-full rounded-sm border border-edge-strong bg-surface-card px-4 text-base text-content transition-colors duration-quick placeholder:text-content-placeholder focus-visible:border-interactive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus';

export function LoginForm({ returnTo, destinationName = null }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setEntering(false), ENTERING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [entering]);

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
      const { createBrowserClient, getSafeAuthErrorMessage } = await import('@/lib/supabase/client');
      const { error } = await createBrowserClient().auth.signInWithPassword({
        email,
        password,
      });
      // signInWithPassword RETURNS a network failure rather than throwing it, and
      // its message can name the Supabase host, so it is never rendered raw.
      signInError = error ? { message: getSafeAuthErrorMessage(error, UNREACHABLE) } : null;
    } catch {
      signInError = { message: UNREACHABLE };
    }

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    setEntering(true);
    router.replace(returnTo);
    router.refresh();
  }

  const busy = loading || entering;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-content">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => handleEmailChange(event.target.value)}
            className={INPUT_CLASS}
            required
          />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <label htmlFor="login-password" className="block text-sm font-medium text-content">
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-content-link hover:text-interactive-hover"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => handlePasswordChange(event.target.value)}
              className={`${INPUT_CLASS} pr-12`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-sm text-content-tertiary hover:text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse transition-colors duration-quick hover:bg-interactive-hover active:bg-interactive-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:bg-interactive-disabled"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      {entering ? (
        <PropertyProLoader
          fullScreen
          label={destinationName ? `Opening ${destinationName}` : 'Opening your portal'}
          detail="Getting everything ready for you"
        />
      ) : null}
    </>
  );
}

'use client';

/**
 * Two-factor step for the Operator Console (ponytail audit #14).
 *
 * The middleware sends every signed-in admin whose session is only `aal1`
 * (password alone) here. An admin with a verified authenticator answers a
 * 6-digit challenge; one without enrols a TOTP factor first. Either way a
 * successful verify raises the session to `aal2` and returns to `returnTo`.
 *
 * This page is public under `/auth/` (so it cannot redirect to itself), but
 * every call below needs a session: with none, `listFactors` fails and the page
 * sends the visitor to sign in.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import { safeReturnTo } from '@/lib/auth/safe-return-to';

type Step =
  | { kind: 'loading' }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'enroll'; factorId: string; qrCode: string; secret: string }
  | { kind: 'failed'; message: string };

const INPUT_CLASS =
  'block w-full rounded-md border border-edge-strong px-3 py-2 text-center text-lg tracking-widest placeholder-content-placeholder shadow-sm focus:border-coral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-500';

function MfaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createBrowserClient(url, key, { cookieOptions: ADMIN_COOKIE_OPTIONS });
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStep({ kind: 'failed', message: 'Missing Supabase configuration' });
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (aal?.currentLevel === 'aal2') {
        router.replace(returnTo);
        return;
      }

      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError || !factors) {
        router.replace(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      const verified = factors.totp.find((f) => f.status === 'verified');
      if (verified) {
        setStep({ kind: 'challenge', factorId: verified.id });
        return;
      }

      // An abandoned enrolment leaves an unverified factor behind, and a second
      // enrol with the same friendly name would fail. Clear them first.
      for (const stale of factors.all.filter(
        (f) => f.factor_type === 'totp' && f.status !== 'verified',
      )) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'PropertyPro Operator Console',
      });
      if (cancelled) return;
      if (enrollError || !enrolled) {
        setStep({
          kind: 'failed',
          message: enrollError?.message ?? 'Could not start authenticator setup.',
        });
        return;
      }
      setStep({
        kind: 'enroll',
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router, returnTo]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || (step.kind !== 'challenge' && step.kind !== 'enroll')) return;
    setError(null);
    setIsVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: step.factorId,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    router.replace('/auth/login');
  }

  return (
    // Skip-link target: this page renders outside the (console) group.
    <div id="main-content" className="flex min-h-screen items-center justify-center bg-surface-inverse-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <span className="text-xl font-bold text-white">PropertyPro</span>
            <span className="rounded bg-coral-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Two-factor verification</h1>
          <p className="mt-1 text-sm text-content-disabled">
            The Operator Console requires an authenticator app.
          </p>
        </div>

        <div className="rounded-lg bg-surface-card p-8 shadow-lg">
          {step.kind === 'loading' && (
            <p className="text-center text-sm text-content-secondary" role="status">
              Checking your session…
            </p>
          )}

          {step.kind === 'failed' && (
            <p
              role="alert"
              className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
            >
              {step.message}
            </p>
          )}

          {(step.kind === 'challenge' || step.kind === 'enroll') && (
            <form onSubmit={handleVerify} className="space-y-5">
              {step.kind === 'enroll' && (
                <div className="space-y-3">
                  <p className="text-sm text-content-secondary">
                    Scan this code with your authenticator app (1Password, Google Authenticator,
                    Authy), then enter the 6-digit code it shows.
                  </p>
                  {/* Supabase returns the QR code as an SVG data URI. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={step.qrCode}
                    alt="Authenticator setup QR code"
                    className="mx-auto h-44 w-44 rounded-md border border-edge bg-white p-2"
                  />
                  <p className="text-xs text-content-tertiary">
                    Can&apos;t scan it? Enter this key instead:
                  </p>
                  <code className="block break-all rounded-md bg-surface-muted px-3 py-2 text-xs text-content">
                    {step.secret}
                  </code>
                </div>
              )}

              <div>
                <label
                  htmlFor="mfa-code"
                  className="mb-1.5 block text-sm font-medium text-content-secondary"
                >
                  {step.kind === 'enroll' ? 'Code from your app' : 'Authentication code'}
                </label>
                <input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={INPUT_CLASS}
                  placeholder="123456"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isVerifying || code.length !== 6}
                className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-50 transition-colors"
              >
                {isVerifying ? 'Verifying…' : step.kind === 'enroll' ? 'Turn on two-factor' : 'Verify'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-5 block w-full text-center text-sm text-content-secondary underline hover:text-content"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { PropertyProTile } from '@/components/brand/property-pro-mark';
import { resolveReturnTo } from '@/lib/utils/auth';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <PropertyProTile size="sm" />
      <span className={`text-base font-semibold ${inverse ? 'text-content-inverse' : 'text-content'}`}>
        PropertyPro{' '}
        <span className={inverse ? 'text-content-inverse opacity-80' : 'text-content-link'}>Florida</span>
      </span>
    </span>
  );
}

/**
 * Split layout, matching the signup "front porch": a photo panel with the
 * brand on the left, the form on the right. Below 900px the photo panel is
 * hidden and the brand sits above the form.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const branding = await resolveAuthPageBranding();
  const returnTo = resolveReturnTo(params.returnTo, branding.hasTenantContext);
  const resetStatus = typeof params.reset === 'string' ? params.reset : null;

  const heading = branding.communityName
    ? `Sign in to ${branding.communityName}`
    : 'Sign in to PropertyPro';

  return (
    <main
      id="main-content"
      className="grid min-h-screen grid-cols-1 bg-surface-card min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      style={branding.cssVars as React.CSSProperties}
    >
      <aside className="relative hidden overflow-hidden bg-surface-inverse min-[900px]:block">
        {/* Decorative: nothing on the panel depends on the photo. */}
        <Image
          src="/site-looks/sunset.webp"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="(min-width: 900px) 45vw, 0px"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30"
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <BrandMark inverse />
          <div className="max-w-md text-content-inverse">
            <p className="text-balance font-display text-3xl font-semibold leading-tight tracking-tight">
              Your association&apos;s records, meetings and notices — in one place.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Statutory documents posted on time',
                'Meeting notices that track the 14-day and 48-hour windows',
                'One portal for owners, tenants and the board',
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none opacity-90" aria-hidden="true" />
                  <span className="opacity-90">{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 flex items-center gap-2 border-t border-white/20 pt-5 text-sm opacity-80">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Built for Florida §718 &amp; §720 associations
            </p>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-col">
        <div className="flex items-center px-5 pt-6 min-[900px]:hidden">
          <BrandMark />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 min-[900px]:px-12">
          <div className="w-full max-w-sm">
            {branding.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={branding.communityName ?? 'Community logo'}
                className="mb-6 h-14 w-14 rounded-md border border-edge object-contain"
              />
            ) : null}
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
              Welcome back
            </p>
            <h1 className="text-balance font-display text-3xl font-semibold leading-tight tracking-tight text-content">
              {heading}
            </h1>
            <p className="mt-3 text-base text-content-secondary">
              Use your email and password to access your community portal.
            </p>

            {resetStatus === 'success' ? (
              <div
                role="status"
                className="mt-6 flex items-start gap-3 rounded-md border border-status-success-border bg-status-success-bg px-4 py-3 text-sm text-status-success"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <span>Your password has been updated. Sign in with your new password to continue.</span>
              </div>
            ) : null}

            <div className="mt-8">
              <LoginForm returnTo={returnTo} destinationName={branding.communityName} />
            </div>

            <p className="mt-8 border-t border-edge-subtle pt-6 text-center text-sm text-content-secondary">
              New to PropertyPro?{' '}
              <Link href="/signup" className="font-medium text-content-link hover:text-interactive-hover">
                Create your account
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

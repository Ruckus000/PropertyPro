import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { resolveReturnTo } from '@/lib/utils/auth';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const branding = await resolveAuthPageBranding();
  const returnTo = resolveReturnTo(params.returnTo, branding.hasTenantContext);

  const heading = branding.communityName
    ? `Sign in to ${branding.communityName}`
    : 'Sign in to PropertyPro';

  return (
    <>
      {branding.fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <main
        className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12"
        style={branding.cssVars as React.CSSProperties}
      >
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            {branding.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={branding.communityName ?? 'Community logo'}
                className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain"
              />
            )}
            <h1 className="text-2xl font-semibold text-gray-900">{heading}</h1>
            <p className="mt-2 text-sm text-gray-600">
              Use your email and password to access your community portal.
            </p>
          </div>
          <LoginForm returnTo={returnTo} />
          <div className="text-center text-sm">
            <Link href="/auth/forgot-password" className="text-blue-600 hover:text-blue-500">
              Forgot password?
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

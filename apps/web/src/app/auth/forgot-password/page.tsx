import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

export const metadata: Metadata = {
  title: 'Forgot Password | PropertyPro Florida',
  description: 'Request a password reset link for your PropertyPro account.',
};

export default async function ForgotPasswordPage() {
  const branding = await resolveAuthPageBranding();

  const heading = branding.communityName
    ? `Reset your ${branding.communityName} password`
    : 'Reset your password';

  return (
    <>
      {branding.fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <main
        className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12"
        style={branding.cssVars as React.CSSProperties}
      >
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            {branding.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={branding.communityName ?? 'Community logo'}
                className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain"
              />
            )}
            <h1 className="text-2xl font-bold text-content">{heading}</h1>
            <p className="mt-2 text-sm text-content-secondary">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>
          <ForgotPasswordForm />
        </div>
      </main>
    </>
  );
}

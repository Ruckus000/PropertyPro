import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

export const metadata: Metadata = {
  title: 'Reset Password | PropertyPro Florida',
  description: 'Set a new password for your PropertyPro account.',
};

export default async function ResetPasswordPage() {
  const branding = await resolveAuthPageBranding();

  const heading = branding.communityName
    ? `Set new ${branding.communityName} password`
    : 'Set new password';

  return (
    <>
      {branding.fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <main
        className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12"
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
            <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter your new password below.
            </p>
          </div>
          <ResetPasswordForm />
        </div>
      </main>
    </>
  );
}

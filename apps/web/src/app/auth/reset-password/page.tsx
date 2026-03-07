import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { BrandedAuthLayout } from '@/components/auth/branded-auth-layout';
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
    <BrandedAuthLayout
      branding={branding}
      heading={heading}
      description="Enter your new password below."
    >
      <ResetPasswordForm />
    </BrandedAuthLayout>
  );
}

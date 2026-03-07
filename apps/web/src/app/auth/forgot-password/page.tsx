import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { BrandedAuthLayout } from '@/components/auth/branded-auth-layout';
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
    <BrandedAuthLayout
      branding={branding}
      heading={heading}
      description="Enter your email and we'll send you a link to reset your password."
    >
      <ForgotPasswordForm />
    </BrandedAuthLayout>
  );
}

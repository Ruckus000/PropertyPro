import { SetPasswordForm } from '@/components/auth/set-password-form';
import { BrandedAuthLayout } from '@/components/auth/branded-auth-layout';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

export const metadata = {
  title: 'Accept Invitation',
  description: 'Set your password to activate your PropertyPro account.',
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; communityId?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? '';
  const communityId = Number(params.communityId ?? '');

  const branding = await resolveAuthPageBranding();

  if (!token || !communityId || Number.isNaN(communityId)) {
    return (
      <div className="text-center">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Invalid invitation link</h2>
        <p className="text-gray-600">This link is missing required information.</p>
      </div>
    );
  }

  const heading = branding.communityName
    ? `Join ${branding.communityName}`
    : 'Set your password';

  return (
    <BrandedAuthLayout
      branding={branding}
      heading={heading}
      description="Choose a password to activate your account."
      maxWidth="max-w-md"
    >
      <SetPasswordForm token={token} communityId={communityId} />
    </BrandedAuthLayout>
  );
}

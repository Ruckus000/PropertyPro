import { SetPasswordForm } from '@/components/auth/set-password-form';
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
    <>
      {branding.fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div
        className="mx-auto max-w-md"
        style={branding.cssVars as React.CSSProperties}
      >
        {branding.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={branding.logoUrl}
            alt={branding.communityName ?? 'Community logo'}
            className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain"
          />
        )}
        <h1 className="mb-3 text-2xl font-semibold text-gray-900">{heading}</h1>
        <p className="mb-6 text-gray-600">
          Choose a password to activate your account.
        </p>
        <SetPasswordForm token={token} communityId={communityId} />
      </div>
    </>
  );
}

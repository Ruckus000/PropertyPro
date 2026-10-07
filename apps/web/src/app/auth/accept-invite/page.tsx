import { captureException } from '@sentry/nextjs';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { resolveAuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';
import { getNoticeConsentInviteContext } from '@/lib/services/invitations-service';

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
        <h2 className="mb-2 text-xl font-semibold text-content">Invalid invitation link</h2>
        <p className="text-content-secondary">This link is missing required information.</p>
      </div>
    );
  }

  // Owners only: decides whether the form offers the electronic-notice box.
  // The box is optional, so a failed lookup hides it rather than breaking the
  // page every invitee needs.
  const noticeConsent = await getNoticeConsentInviteContext(communityId, token).catch((err: unknown) => {
    captureException(err, { tags: { page: 'accept-invite', phase: 'notice_consent' } });
    return null;
  });

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
        <div className="text-center">
          {branding.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logoUrl}
              alt={branding.communityName ?? 'Community logo'}
              className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain"
            />
          )}
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-content">{heading}</h1>
        <p className="mb-6 text-content-secondary">
          Choose a password to activate your account.
        </p>
        <SetPasswordForm
          token={token}
          communityId={communityId}
          noticeConsentEmail={noticeConsent?.email ?? null}
        />
      </div>
    </>
  );
}

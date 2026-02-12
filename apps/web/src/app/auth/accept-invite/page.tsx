import { SetPasswordForm } from '@/components/auth/set-password-form';

export const metadata = {
  title: 'Accept Invitation',
  description: 'Set your password to activate your PropertyPro account.',
};

export default function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string; communityId?: string };
}) {
  const token = searchParams.token ?? '';
  const communityId = Number(searchParams.communityId ?? '');

  if (!token || !communityId || Number.isNaN(communityId)) {
    return (
      <div className="text-center">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Invalid invitation link</h2>
        <p className="text-gray-600">This link is missing required information.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-3 text-2xl font-semibold text-gray-900">Set your password</h1>
      <p className="mb-6 text-gray-600">
        Choose a password to activate your account.
      </p>
      <SetPasswordForm token={token} communityId={communityId} />
    </div>
  );
}


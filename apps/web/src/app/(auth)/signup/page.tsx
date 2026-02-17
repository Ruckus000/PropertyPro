import Link from 'next/link';
import type { CommunityType } from '@propertypro/shared';
import { SignupForm } from '@/components/signup/signup-form';

interface SignupPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseCommunityType(value: string | undefined): CommunityType {
  if (value === 'condo_718' || value === 'hoa_720' || value === 'apartment') {
    return value;
  }
  if (value === 'pm') {
    return 'apartment';
  }
  return 'condo_718';
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const requestedType = pickFirst(params.communityType) ?? pickFirst(params.type);
  const signupRequestId = pickFirst(params.signupRequestId);
  const verified = pickFirst(params.verified) === '1';

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gray-900">Start Your PropertyPro Signup</h1>
          <p className="mt-2 text-sm text-gray-600">
            Capture your community details now. Billing checkout opens after email verification.
          </p>
        </div>

        <SignupForm
          initialCommunityType={parseCommunityType(requestedType)}
          initialSignupRequestId={signupRequestId}
          verificationReturn={verified}
        />

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

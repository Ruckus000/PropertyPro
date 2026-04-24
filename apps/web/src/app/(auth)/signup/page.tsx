import type { CommunityType } from '@propertypro/shared';
import { CleanSignupWizard } from '@/components/signup/clean-wizard/clean-signup-wizard';
import '@/components/signup/clean-wizard/clean-wizard.css';

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

  // PM signup → Contact Sales (no self-serve checkout)
  if (requestedType === 'pm') {
    return (
      <main id="main-content" className="min-h-screen bg-surface-page px-4 py-12">
        <div className="mx-auto w-full max-w-lg space-y-6 text-center">
          <h1 className="text-3xl font-semibold text-content">Property Manager Plans</h1>
          <p className="text-sm text-content-secondary">
            We&apos;ll set up your account with a plan tailored to your portfolio.
          </p>
          <a
            href="mailto:sales@getpropertypro.com?subject=Property%20Manager%20Inquiry"
            className="inline-block rounded-md bg-interactive px-6 py-3 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            Contact Sales
          </a>
          <p className="text-xs text-content-tertiary">
            Or email us directly at sales@getpropertypro.com
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="clean-signup-root min-h-screen w-full max-w-full overflow-x-hidden"
    >
      <div
        className="mx-auto flex w-full min-w-0 max-w-6xl flex-col"
        style={{ minHeight: '100vh' }}
      >
        <div className="w-full min-w-0 flex-1 px-4 py-0 md:px-6">
          <CleanSignupWizard
            initialCommunityType={parseCommunityType(requestedType)}
            initialSignupRequestId={signupRequestId}
            verificationReturn={verified}
          />
        </div>
      </div>
    </main>
  );
}

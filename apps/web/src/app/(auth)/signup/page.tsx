import { redirect } from 'next/navigation';
import type { CommunityType } from '@propertypro/shared';
import { createServerClient } from '@propertypro/db/supabase/server';
import { SignupFlow } from '@/components/signup/front-porch/signup-flow';
import { PLAN_IDS, type PlanId } from '@propertypro/shared';

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
  const requestedPlan = pickFirst(params.plan);
  const verified = pickFirst(params.verified) === '1';

  // PM signup has no self-serve checkout. This used to be a dead-end page whose
  // only action was a `mailto:sales@…` — a different address from the one the
  // pricing page used — and it produced no lead record. Both now land on the
  // portfolio inquiry form. See docs/gtm/03-LAUNCH-READINESS.md item B3.
  //
  // A temporary redirect on purpose: this is a product decision that may be
  // revisited if self-serve PM signup ships, and the URL carries a query string,
  // so there is no SEO equity worth making permanent.
  if (requestedType === 'pm') {
    redirect('/contact?from=pm-signup');
  }

  // The emailed email-first link signs the user in (/auth/verify-signup)
  // and lands here; a confirmed session goes straight to the questions.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const confirmed = Boolean(user?.email && user.email_confirmed_at);
  const plan = PLAN_IDS.find((id) => id === requestedPlan) ?? null;

  return (
    <SignupFlow
      initialStep={confirmed ? 'type' : 'email'}
      sessionEmail={confirmed ? user?.email ?? null : null}
      linkNotice={
        confirmed ? null : pickFirst(params.link) === 'other-device' ? 'other-device' : verified ? 'expired' : null
      }
      initialType={requestedType ? parseCommunityType(requestedType) : null}
      initialPlan={plan as PlanId | null}
    />
  );
}

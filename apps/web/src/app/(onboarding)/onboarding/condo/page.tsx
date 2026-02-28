import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadWizardState } from '@/lib/queries/wizard-state';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { CondoWizard } from '@/components/onboarding/condo-wizard';
import type { CondoWizardStatePayload } from '@/lib/onboarding/condo-wizard-types';

interface OnboardingPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CondoOnboardingPage({ searchParams }: OnboardingPageProps) {
    const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);

    const context = resolveCommunityContext({
        searchParams: toUrlSearchParams(resolvedSearchParams),
        host: requestHeaders.get('host'),
    });

    if (!context.communityId) {
        redirect('/dashboard');
    }

    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(context.communityId, userId);

    const features = getFeaturesForCommunity(membership.communityType);

    // Guard: Condo wizard is only valid for communities WITH compliance tracking
    if (!features.hasCompliance) {
        redirect('/dashboard');
    }

    const wizardState = await loadWizardState<CondoWizardStatePayload>(context.communityId, 'condo');

    // Once completed or definitively skipped, hide wizard
    if (wizardState?.status === 'completed' || wizardState?.status === 'skipped') {
        redirect(`/dashboard?communityId=${context.communityId}`);
    }

    return (
        <main className="min-h-screen bg-[var(--surface-page)] text-[var(--color-text)]">
            <CondoWizard
                communityId={context.communityId}
                communityType={membership.communityType}
                initialState={wizardState ?? undefined}
            />
        </main>
    );
}

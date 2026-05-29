/**
 * PR #5b · Onboarding wizard for the public community site.
 *
 * Route: /pm/onboarding/website/?communityId=X
 * Auth: pm_admin or cam required.
 *
 * Step 1 ships here (layout chooser). Steps 2-5 land in follow-up
 * slices; the page renders placeholders so PMs see the full path.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole } from '@/lib/api/role-guard';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { listThemePresetsForWizard } from '@/lib/db/theme-preset-catalog';
import { LayoutChooser } from '@/components/pm/onboarding-wizard/LayoutChooser';
import { PresetChooser } from '@/components/pm/onboarding-wizard/PresetChooser';
import { IdentityEditor } from '@/components/pm/onboarding-wizard/IdentityEditor';
import { WelcomeMessageEditor } from '@/components/pm/onboarding-wizard/WelcomeMessageEditor';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteOnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Select a Community</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Choose a community to run the website onboarding wizard.
        </p>
        <a
          href="/pm/dashboard/communities"
          className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Go to Communities
        </a>
      </main>
    );
  }

  const communityId = rawId;
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (!hasRole(membership, ['pm_admin', 'cam'])) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const [branding, community, presets] = await Promise.all([
    getBrandingForCommunity(communityId),
    getCommunityPublicInfo(communityId),
    listThemePresetsForWizard(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-content">Customize your community site</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Five quick steps. You can come back anytime — your site stays live with default
          settings until you publish changes.
          {community && (
            <>
              {' '}Current URL:{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
                {community.slug}.getpropertypro.com
              </code>
              .
            </>
          )}
        </p>
      </div>

      <LayoutChooser communityId={communityId} initialLayoutId={branding?.layoutId ?? null} />

      <div className="mt-6">
        <PresetChooser
          communityId={communityId}
          presets={presets}
          initialPresetSlug={branding?.themePresetSlug ?? null}
        />
      </div>

      <div className="mt-6">
        <IdentityEditor
          communityId={communityId}
          initialTagline={branding?.tagline ?? null}
          establishedYear={null}
        />
      </div>

      <div className="mt-6">
        <WelcomeMessageEditor
          communityId={communityId}
          defaultHeadline={community?.name ? `Welcome to ${community.name}` : 'Welcome'}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3">
        {[
          { n: 5, label: 'Confirm + publish' },
        ].map((step) => (
          <div
            key={step.n}
            className="rounded-md border border-dashed border-default bg-surface-muted/40 p-3 text-xs text-content-secondary"
          >
            <p className="font-medium uppercase tracking-wide">Step {step.n} of 5</p>
            <p className="mt-1">{step.label} — coming next.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

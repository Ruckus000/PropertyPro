/**
 * PR #5b · Onboarding wizard for the public community site.
 *
 * Route: /pm/onboarding/website/?communityId=X
 * Auth: pm_admin or cam required.
 *
 * All five steps are live: layout + theme chooser, identity, welcome
 * message, and confirm-publish (which stamps site_onboarding_completed_at).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { listThemePresetsForWizard } from '@/lib/db/theme-preset-catalog';
import { WizardLayoutThemePreview } from '@/components/pm/onboarding-wizard/WizardLayoutThemePreview';
import { IdentityEditor } from '@/components/pm/onboarding-wizard/IdentityEditor';
import { WelcomeMessageEditor } from '@/components/pm/onboarding-wizard/WelcomeMessageEditor';
import { ConfirmPublish } from '@/components/pm/onboarding-wizard/ConfirmPublish';
import { PageBody } from '@/components/shared/page-body';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteOnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  // No community in scope — bounce to the portfolio rather than rendering a
  // community-scoped page with none, which leaves the shell resolving
  // community = null and swapping the PM rail for the community nav. Matches
  // what /pm/site-preview already does.
  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities');
  }

  const communityId = rawId;
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (!hasRole(membership, PM_MANAGER_ROLES)) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const [branding, community, presets] = await Promise.all([
    getBrandingForCommunity(communityId),
    getCommunityPublicInfo(communityId),
    listThemePresetsForWizard(),
  ]);

  return (
    <PageBody width="content" spacing="none">
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

      <WizardLayoutThemePreview
        communityId={communityId}
        presets={presets}
        initialLayoutId={branding?.layoutId ?? null}
        initialPresetSlug={branding?.themePresetSlug ?? null}
      />

      <div className="mt-6">
        <IdentityEditor
          communityId={communityId}
          initialName={community?.name ?? null}
          initialTagline={branding?.tagline ?? null}
          establishedYear={null}
          heroFallbackHeadline={community?.name ? `Welcome to ${community.name}` : 'Welcome'}
        />
      </div>

      <div className="mt-6">
        <WelcomeMessageEditor
          communityId={communityId}
          defaultHeadline={community?.name ? `Welcome to ${community.name}` : 'Welcome'}
        />
      </div>

      <div className="mt-6">
        <ConfirmPublish
          communityId={communityId}
          communitySlug={community?.slug ?? null}
        />
      </div>
    </PageBody>
  );
}

// breadcrumbs:exempt — redirect-only page
/**
 * PR #9c — permanent redirect from the legacy branding-only page to the
 * site editor's Branding tab.
 *
 * The standalone /pm/settings/branding route was the multi-community
 * BrandingForm + BrandingTable page from Phase 2. Per spec §4.2 (the
 * 5-tab site editor), branding controls now live inside
 * /pm/settings/website?communityId=X#branding. The #branding anchor
 * scrolls to the Branding tab once the 5-tab layout lands in a later
 * slice — until then the redirect just lands the user on the site
 * editor for that community, which is the closest current equivalent.
 *
 * communityId is preserved across the redirect when present so PMs
 * coming from cached deep-links don't drop into "Select a Community."
 */
import { permanentRedirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function BrandingSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);
  const target =
    Number.isInteger(rawId) && rawId > 0
      ? `/pm/settings/website?communityId=${rawId}#branding`
      : `/pm/settings/website#branding`;
  permanentRedirect(target);
}

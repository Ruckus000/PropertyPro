// breadcrumbs:exempt — redirect-only page
/**
 * Redirect from the retired website onboarding wizard to the website home.
 *
 * Route: /pm/onboarding/website?communityId=X → /pm/website?communityId=X
 *
 * ## Why the route still exists at all
 *
 * A community's site is live from day one now, and the only onboarding choice
 * is the look, made on the website home's look picker. The wizard is gone, but
 * its path is in the wild: help-article deep links, PM bookmarks, browser
 * history, and a few in-app links not yet repointed. Deleting it outright would
 * 404 all of them.
 *
 * ## Why this is a temporary redirect, not `permanentRedirect`
 *
 * `redirect()` answers 307. A 308 is cached hard by browsers and CDNs and is
 * effectively impossible to retract; this is a route retirement, so a 307
 * leaves room to change our minds.
 *
 * No auth or role check here on purpose: the redirect leaks nothing, and the
 * destination re-runs the full session / role / tenancy / plan chain.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteOnboardingRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  // No community in scope: bounce to the portfolio rather than forwarding to a
  // page that would only bounce again.
  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities');
  }

  redirect(`/pm/website?communityId=${rawId}`);
}

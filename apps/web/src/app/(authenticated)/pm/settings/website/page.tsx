// breadcrumbs:exempt — redirect-only page
/**
 * Redirect from the retired stacked-form website editor to the v3 editor.
 *
 * Route: /pm/settings/website?communityId=X → /pm/website-editor?communityId=X
 *
 * ## Why the route still exists at all
 *
 * Every link in the app has been repointed at `/pm/website-editor`, but this
 * path is in the wild: help-article deep links, PM bookmarks, and browser
 * history. Deleting it outright would 404 all of them.
 *
 * ## Why this is a temporary redirect, not `permanentRedirect`
 *
 * A 308 is cached hard by browsers and CDNs and is effectively impossible to
 * retract. This is a route retirement, not a permanent identity change for a
 * resource, so a 307 leaves room to change our minds. The
 * `/pm/settings/branding` redirect beside it is a genuine 308 because that page
 * is never coming back.
 *
 * No auth or role check here on purpose: the redirect leaks nothing, and the
 * destination re-runs the full session / role / tenancy / plan / subscription
 * chain. Duplicating those checks would mean two places to keep in sync.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  // Same no-community-in-scope behaviour the retired page had: bounce to the
  // portfolio rather than forwarding to an editor that would only bounce again.
  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities');
  }

  redirect(`/pm/website-editor?communityId=${rawId}`);
}

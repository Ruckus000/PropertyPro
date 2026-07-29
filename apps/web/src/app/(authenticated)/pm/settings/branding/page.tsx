// breadcrumbs:exempt — redirect-only page
/**
 * Permanent redirect from the retired branding-only page into the website
 * editor's Colours tool.
 *
 * The standalone /pm/settings/branding route was the multi-community
 * BrandingForm + BrandingTable page from Phase 2. Its controls now live in the
 * editor, so this is where a cached deep-link should land.
 *
 * ## Why this points at the editor directly, not at /pm/settings/website
 *
 * That path is itself now a redirect. Chaining two 308s would make every cached
 * deep-link take two hops through a route that exists only to forward, and
 * `permanentRedirect` responses are cached hard by browsers and CDNs — so a
 * chain, once cached, is expensive to unwind. One hop to the real destination.
 *
 * The old `#branding` fragment is dropped: the editor is tabbed, so there is no
 * anchor to scroll to. The Colours tool is the equivalent surface, but it is
 * selected by the editor's own tab state rather than by URL, so this lands on
 * the editor and the PM picks the tool.
 *
 * communityId is preserved when present so PMs don't drop into
 * "Select a Community."
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
      ? `/pm/website-editor?communityId=${rawId}`
      : '/pm/dashboard/communities';
  permanentRedirect(target);
}

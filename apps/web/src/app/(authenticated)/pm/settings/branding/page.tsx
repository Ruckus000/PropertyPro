// breadcrumbs:exempt — redirect-only page
/**
 * Permanent redirect from the retired branding-only page to the website
 * overview's Settings tab (design D).
 *
 * The standalone /pm/settings/branding route was the multi-community
 * BrandingForm + BrandingTable page from Phase 2. Its two halves now live in
 * two places: the logos on the overview's Settings tab (they save at once), and
 * the colours in the editor's Pages & design (they are drafts). The overview
 * links to the editor, so it is the one landing that reaches both.
 *
 * One hop to the real destination, never through another redirect:
 * `permanentRedirect` responses are cached hard by browsers and CDNs, so a
 * chain, once cached, is expensive to unwind. A browser that cached the old
 * target (the editor) still lands somewhere that works.
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
      ? `/pm/website?communityId=${rawId}&tab=settings`
      : '/pm/dashboard/communities';
  permanentRedirect(target);
}

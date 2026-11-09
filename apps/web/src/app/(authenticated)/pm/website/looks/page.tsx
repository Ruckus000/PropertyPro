/**
 * The look picker's old address (website builder, Phase 4), kept for bookmarks
 * and old emails.
 *
 * Route: /pm/website/looks?communityId=X
 *
 * Looks are chosen in the editor now, as a draft like every other change
 * (design D): this sends the manager to the editor's Look row. The editor runs
 * every gate (role, plan, subscription) itself, so this adds none; an address
 * with no valid community goes where the editor would send it.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LooksRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }
  redirect(`/pm/website-editor?communityId=${communityId}&item=look`);
}

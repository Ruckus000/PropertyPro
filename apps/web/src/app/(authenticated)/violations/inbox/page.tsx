/**
 * Legacy URL: /violations/inbox → /violations (preserves ?communityId=)
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ViolationsInboxRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  redirect(`/violations?communityId=${rawId}`);
}

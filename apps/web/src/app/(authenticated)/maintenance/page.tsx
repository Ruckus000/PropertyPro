import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LegacyMaintenancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params.communityId);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  redirect(`/communities/${communityId}/operations?tab=requests&from=maintenance`);
}

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Compatibility redirect: /communities/[id]/finance -> /communities/[id]/payments?tab=overview
 */
export default async function FinancePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-community');
  }

  redirect(`/communities/${communityId}/payments?tab=overview`);
}

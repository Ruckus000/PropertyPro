export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile documents list page.
 *
 * Fetches accessible documents for the authenticated user using the same
 * access-control helper as the desktop portal.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getAccessibleDocuments } from '@propertypro/db';
import { CompactCard } from '@/components/mobile/CompactCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileDocumentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  const docs = await getAccessibleDocuments({
    communityId,
    role: membership!.role,
    communityType: membership!.communityType,
  });

  return (
    <div>
      <div className="mobile-page-header">Documents</div>
      {docs.length === 0 ? (
        <p className="mobile-empty">No documents available</p>
      ) : (
        docs.map((doc: Record<string, unknown>) => (
          <CompactCard
            key={doc['id'] as number}
            title={doc['title'] as string}
            subtitle={doc['fileName'] as string}
            meta={new Date(doc['createdAt'] as string).toLocaleDateString()}
          />
        ))
      )}
    </div>
  );
}

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
import { resolveTimezone } from '@/lib/utils/timezone';
import { CompactCard } from '@/components/mobile/CompactCard';


interface PageProps {
  searchParams: Promise<SearchParams>;
}

interface DocumentRow {
  id: number;
  title: string;
  fileName: string;
  createdAt: string;
}

function toDocumentRow(doc: Record<string, unknown>): DocumentRow {
  return {
    id: doc['id'] as number,
    title: doc['title'] as string,
    fileName: doc['fileName'] as string,
    createdAt: doc['createdAt'] as string,
  };
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

  const timezone = resolveTimezone(membership!.timezone);
  const docs = await getAccessibleDocuments({
    communityId,
    role: membership!.role,
    communityType: membership!.communityType,
    isUnitOwner: membership!.isUnitOwner,
    permissions: membership!.permissions,
  });

  return (
    <div>
      {docs.length === 0 ? (
        <p className="mobile-empty">No documents available</p>
      ) : (
        docs.map(toDocumentRow).map((doc) => (
          <CompactCard
            key={doc.id}
            title={doc.title}
            subtitle={doc.fileName}
            meta={new Date(doc.createdAt).toLocaleDateString('en-US', { timeZone: timezone })}
          />
        ))
      )}
    </div>
  );
}

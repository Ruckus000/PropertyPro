export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getAccessibleDocuments } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { MobileDocumentsContent } from '@/components/mobile/MobileDocumentsContent';

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

  const timezone = resolveTimezone(membership!.timezone);
  const docs = await getAccessibleDocuments({
    communityId,
    role: membership!.role,
    communityType: membership!.communityType,
    isUnitOwner: membership!.isUnitOwner,
    permissions: membership!.permissions,
  });

  const serialized = (docs as Record<string, unknown>[]).map((doc) => ({
    id: doc['id'] as number,
    title: doc['title'] as string,
    fileName: doc['fileName'] as string,
    mimeType: (doc['mimeType'] as string) ?? 'application/octet-stream',
    category: (doc['category'] as string) ?? 'Other',
    createdAt: doc['createdAt'] as string,
    requiresSignature: (doc['requiresSignature'] as boolean) ?? false,
  }));

  return <MobileDocumentsContent communityId={communityId} documents={serialized} timezone={timezone} />;
}

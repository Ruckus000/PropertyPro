import { headers } from 'next/headers';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { DocumentLibrary } from '@/components/documents/document-library';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-2 text-sm text-red-600">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  return (
    <DocumentLibrary
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
      isUnitOwner={membership.isUnitOwner}
      permissions={membership.permissions}
    />
  );
}

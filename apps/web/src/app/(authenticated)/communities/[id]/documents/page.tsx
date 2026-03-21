import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { DocumentLibrary } from '@/components/documents/document-library';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function DocumentsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { q } = await searchParams;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Documents</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
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
      initialSearchQuery={q}
    />
  );
}

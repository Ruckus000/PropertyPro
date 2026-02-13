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
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-2 text-sm text-red-600">Invalid community ID</p>
      </main>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <DocumentLibrary
        communityId={communityId}
        userId={userId}
        userRole={membership.role}
      />
    </main>
  );
}

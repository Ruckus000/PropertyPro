// breadcrumbs:exempt — redirect-only page
//
// This page creates a draft on mount and replaces the route with the draft
// editor. The breadcrumb is rendered by author-editor-client.tsx on the
// destination route.
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { CreateAndRedirect } from '@/components/documents/author/create-and-redirect';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

export default async function AuthorNewDocumentPage({ params, searchParams }: PageProps) {
  const [{ id }, { source }] = await Promise.all([params, searchParams]);
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Author document</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID.</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'write');

  const sourceDocumentId =
    source != null && /^\d+$/.test(source) ? Number(source) : null;

  return (
    <CreateAndRedirect
      communityId={communityId}
      sourceDocumentId={sourceDocumentId}
      redirectTo={`/communities/${communityId}/documents/author/__DRAFT_ID__`}
    />
  );
}

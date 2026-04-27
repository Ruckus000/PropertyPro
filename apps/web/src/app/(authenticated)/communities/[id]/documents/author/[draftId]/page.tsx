// breadcrumbs:exempt — delegated to apps/web/src/components/documents/author/author-editor-client.tsx
//
// The breadcrumb is rendered inside AuthorEditorClient via PageHeader so the
// "Saved · 12:04 pm" autosave affordance and the dynamic title can update
// from the editor's own state.
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { AuthorEditorClient } from '@/components/documents/author/author-editor-client';

interface PageProps {
  params: Promise<{ id: string; draftId: string }>;
}

export default async function AuthorDocumentEditorPage({ params }: PageProps) {
  const { id, draftId: rawDraftId } = await params;
  const communityId = Number(id);
  const draftId = Number(rawDraftId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Author document</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID.</p>
      </div>
    );
  }
  if (!Number.isInteger(draftId) || draftId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Author document</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid draft ID.</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'write');

  return (
    <AuthorEditorClient
      communityId={communityId}
      draftId={draftId}
      currentUserId={userId}
      parentLabel="Documents"
      parentHref={`/communities/${communityId}/documents`}
    />
  );
}

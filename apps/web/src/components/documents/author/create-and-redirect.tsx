'use client';

/**
 * Client-side "create and redirect" used by the author entry-point pages.
 * Fires a single POST /api/v1/documents/drafts on mount, then router.replace()
 * to the draft editor. Renders a small loading affordance while it works.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useCreateDocumentDraft } from '@/hooks/use-document-draft';

interface CreateAndRedirectProps {
  communityId: number;
  targetMeetingId?: number | null;
  targetCategoryId?: number | null;
  sourceDocumentId?: number | null;
  initialTitle?: string;
  /** Where to send the user after the draft is created. Path may include
   *  a `__DRAFT_ID__` placeholder which is replaced with the new id. */
  redirectTo: string;
}

export function CreateAndRedirect({
  communityId,
  targetMeetingId,
  targetCategoryId,
  sourceDocumentId,
  initialTitle,
  redirectTo,
}: CreateAndRedirectProps) {
  const router = useRouter();
  const create = useCreateDocumentDraft(communityId);
  const startedRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    create
      .mutateAsync({
        title: initialTitle,
        targetMeetingId: targetMeetingId ?? null,
        targetCategoryId: targetCategoryId ?? null,
        sourceDocumentId: sourceDocumentId ?? null,
      })
      .then((draft) => {
        const target = redirectTo.replace('__DRAFT_ID__', String(draft.id));
        router.replace(target);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to create draft');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-status-danger bg-status-danger-subtle p-4 text-sm text-status-danger">
        Couldn&apos;t start a new draft: {error}
      </div>
    );
  }

  return (
    <div className="px-4 py-6 text-sm text-content-secondary" aria-live="polite">
      Creating a new draft…
    </div>
  );
}

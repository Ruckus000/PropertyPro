'use client';

/**
 * Author editor view — loads a draft, mounts the lazy-loaded TipTap editor,
 * runs autosave, and exposes Publish + Cancel actions. Wraps the full
 * authoring lifecycle in one client component.
 */
import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { DocumentLinkPicker } from '@/components/documents/author/document-link-picker';
import {
  useDocumentDraft,
  useAutosave,
  useUploadDraftImage,
  usePublishDocumentDraft,
  useDeleteDocumentDraft,
  useSaveDocumentDraft,
  type DocumentLinkPickerResult,
} from '@/hooks/useDocumentDraft';

// The editor pulls TipTap onto the page; gate it behind next/dynamic with
// ssr:false so it only ships on these author routes.
const Editor = dynamic(
  () => import('@propertypro/ui/editor').then((m) => ({ default: m.Editor })),
  { ssr: false, loading: () => <div className="px-4 py-6 text-sm text-content-secondary">Loading editor…</div> },
);

interface AuthorEditorClientProps {
  communityId: number;
  draftId: number;
  currentUserId: string;
  /** Breadcrumb section name for the parent crumb. Defaults to "Documents". */
  parentLabel?: string;
  /** Optional href for the parent crumb. Defaults to /communities/[id]/documents. */
  parentHref?: string;
}

function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AuthorEditorClient({
  communityId,
  draftId,
  currentUserId,
  parentLabel = 'Documents',
  parentHref,
}: AuthorEditorClientProps) {
  const router = useRouter();
  const draftQuery = useDocumentDraft(communityId, draftId);
  const autosave = useAutosave(communityId, draftId, 5000);
  const saveImmediate = useSaveDocumentDraft(communityId, draftId);
  const uploadImage = useUploadDraftImage(communityId, draftId);
  const publish = usePublishDocumentDraft(communityId, draftId);
  const remove = useDeleteDocumentDraft(communityId, draftId);

  const [title, setTitle] = React.useState('');
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [coverSheet, setCoverSheet] = React.useState(false);
  const [letterheadHeader, setLetterheadHeader] = React.useState(true);
  const [letterheadFooter, setLetterheadFooter] = React.useState(true);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [pickResolver, setPickResolver] = React.useState<
    ((result: DocumentLinkPickerResult | null) => void) | null
  >(null);

  // Hydrate state from the draft once loaded.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (hydratedRef.current) return;
    if (!draftQuery.data) return;
    setTitle(draftQuery.data.title);
    setCoverSheet(Boolean(draftQuery.data.coverSheetEnabled));
    const lh = draftQuery.data.letterheadOptions ?? {};
    setLetterheadHeader(lh.header !== false);
    setLetterheadFooter(lh.footer !== false);
    hydratedRef.current = true;
  }, [draftQuery.data]);

  // Soft-lock warning: another admin edited this draft within the last 60s.
  const lockWarning = React.useMemo(() => {
    if (!draftQuery.data) return null;
    if (draftQuery.data.lastEditorId == null) return null;
    if (draftQuery.data.lastEditorId === currentUserId) return null;
    const last = new Date(draftQuery.data.lastEditedAt).getTime();
    if (!Number.isFinite(last)) return null;
    if (Date.now() - last > 60_000) return null;
    return 'Another editor was working on this draft within the last minute. Your changes may overwrite theirs.';
  }, [draftQuery.data, currentUserId]);

  const onTitleChange = (next: string) => {
    setTitle(next);
    autosave.schedule({ title: next });
  };

  const onBodyChange = (html: string) => {
    autosave.schedule({ bodyHtml: html });
  };

  // Reflect successful saves in the "Saved · HH:MM" pill.
  React.useEffect(() => {
    if (saveImmediate.isSuccess) setSavedAt(new Date());
  }, [saveImmediate.isSuccess]);
  React.useEffect(() => {
    // Hook into autosave's mutation result by polling on isSaving transitions.
    // Sonner toast on errors keeps the user informed.
    if (autosave.error) {
      toast.error('Autosave failed — please try again.');
    }
  }, [autosave.error]);

  const persistOptions = React.useCallback(() => {
    autosave.schedule({
      coverSheetEnabled: coverSheet,
      letterheadOptions: { header: letterheadHeader, footer: letterheadFooter },
    });
  }, [autosave, coverSheet, letterheadHeader, letterheadFooter]);

  React.useEffect(() => {
    if (!hydratedRef.current) return;
    persistOptions();
  }, [persistOptions]);

  const onImageUpload = async (file: File): Promise<{ url: string; alt?: string }> => {
    const result = await uploadImage.mutateAsync(file);
    return { url: result.url, alt: file.name };
  };

  const onPickDocument = async (): Promise<DocumentLinkPickerResult | null> => {
    return new Promise((resolve) => {
      setPickResolver(() => resolve);
      setPickerOpen(true);
    });
  };

  const handlePicked = (result: DocumentLinkPickerResult) => {
    pickResolver?.(result);
    setPickResolver(null);
  };

  const handlePickerClose = (open: boolean) => {
    setPickerOpen(open);
    if (!open && pickResolver) {
      pickResolver(null);
      setPickResolver(null);
    }
  };

  const handlePublish = async () => {
    try {
      // Flush any pending autosave before we publish, otherwise we'd
      // publish a stale body.
      await autosave.flush();
      const result = await publish.mutateAsync();
      toast.success('Document published.');
      router.push(`/communities/${communityId}/documents`);
      router.refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      toast.error(message);
      return null;
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Discard this draft? This can\'t be undone.')) return;
    try {
      await remove.mutateAsync();
      toast.success('Draft discarded.');
      router.push(`/communities/${communityId}/documents`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to discard draft';
      toast.error(message);
    }
  };

  if (draftQuery.isLoading) {
    return <div className="px-4 py-6 text-sm text-content-secondary">Loading draft…</div>;
  }
  if (draftQuery.error) {
    return (
      <div role="alert" className="rounded-md border border-status-danger bg-status-danger-subtle p-4 text-sm text-status-danger">
        Couldn&apos;t load this draft. {draftQuery.error.message}
      </div>
    );
  }
  if (!draftQuery.data) return null;

  const breadcrumbHref =
    parentHref ?? `/communities/${communityId}/documents`;
  const savedLabel = savedAt
    ? `Saved · ${formatTimeShort(savedAt)}`
    : autosave.isSaving
    ? 'Saving…'
    : 'Not saved yet';

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[{ label: parentLabel, href: breadcrumbHref }]}
            currentLabel={title || 'Untitled'}
          />
        }
        title={title || 'Untitled'}
        description="Author a new document. Drafts autosave every few seconds."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-live="polite"
              className="text-xs text-content-secondary"
            >
              {savedLabel}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-edge-strong px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publish.isPending}
              className="rounded-md bg-interactive px-3 py-2 text-sm font-medium text-white hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:opacity-60"
            >
              {publish.isPending ? 'Generating PDF…' : 'Publish'}
            </button>
          </div>
        }
      />

      {lockWarning && (
        <div role="alert" className="rounded-md border border-status-warning bg-status-warning-subtle p-3 text-sm text-status-warning">
          {lockWarning}
        </div>
      )}

      {publish.isPending && (
        <div className="rounded-md border border-edge bg-surface-muted p-3 text-sm text-content-secondary">
          Generating PDF — this may take up to 20 seconds on the first publish in a session.
        </div>
      )}

      <div className="rounded-md border border-edge bg-surface-card p-4">
        <label htmlFor="draft-title" className="block text-xs font-medium text-content-secondary">
          Title
        </label>
        <input
          id="draft-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-base font-medium text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        />
      </div>

      <div className="rounded-md border border-edge bg-surface-card p-4">
        <h2 className="text-sm font-semibold text-content">Document options</h2>
        <p className="text-xs text-content-secondary">
          Toggle the chrome that appears around your printed document.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-content">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={coverSheet}
              onChange={(e) => setCoverSheet(e.target.checked)}
            />
            Include cover sheet
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={letterheadHeader}
              onChange={(e) => setLetterheadHeader(e.target.checked)}
            />
            Community letterhead (header)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={letterheadFooter}
              onChange={(e) => setLetterheadFooter(e.target.checked)}
            />
            Compliance footer
          </label>
        </div>
      </div>

      <Editor
        mode="authored"
        initialHtml={draftQuery.data.bodyHtml}
        onChange={onBodyChange}
        onImageUpload={onImageUpload}
        onPickDocument={onPickDocument}
        ariaLabel="Document body"
      />

      <DocumentLinkPicker
        communityId={communityId}
        draftId={draftId}
        open={pickerOpen}
        onOpenChange={handlePickerClose}
        onPicked={handlePicked}
      />
    </div>
  );
}

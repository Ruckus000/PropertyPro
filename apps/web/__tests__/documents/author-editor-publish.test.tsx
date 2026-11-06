/**
 * Publishing an authored document posts it to owners at once, so the editor
 * asks for the §718.111(12)(c) redaction attestation first and sends it to the
 * publish route, which refuses (400) without it for minutes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mutateAsyncMock, flushMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  flushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The TipTap editor is irrelevant here and loads lazily in the browser.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/documents/author/document-link-picker', () => ({
  DocumentLinkPicker: () => null,
}));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock('@/hooks/use-document-draft', () => ({
  useDocumentDraft: () => ({
    isLoading: false,
    error: null,
    data: {
      title: 'Minutes — August Board Meeting',
      bodyHtml: '<p>The board met.</p>',
      coverSheetEnabled: false,
      letterheadOptions: {},
      lastEditorId: null,
      lastEditedAt: null,
    },
  }),
  useAutosave: () => ({ schedule: vi.fn(), flush: flushMock, isSaving: false, error: null }),
  useSaveDocumentDraft: () => ({ isSuccess: false }),
  useUploadDraftImage: () => ({ mutateAsync: vi.fn() }),
  usePublishDocumentDraft: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  useDeleteDocumentDraft: () => ({ mutateAsync: vi.fn() }),
}));

import { AuthorEditorClient } from '@/components/documents/author/author-editor-client';

describe('AuthorEditorClient — publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flushMock.mockResolvedValue(undefined);
    mutateAsyncMock.mockResolvedValue({ documentId: 900 });
  });

  it('keeps Publish disabled until the redaction box is ticked, then sends it', async () => {
    render(<AuthorEditorClient communityId={42} draftId={5} currentUserId="author-1" />);

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    expect(screen.getByText('Confirm redaction before publishing')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction before publishing/ }));
    expect(publish).toBeEnabled();

    fireEvent.click(publish);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ redactionAttested: true }));
  });
});

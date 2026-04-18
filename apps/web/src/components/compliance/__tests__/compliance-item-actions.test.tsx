import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ComplianceItemActions } from '../compliance-item-actions';
import type { ChecklistItemData } from '../compliance-checklist-item';

// Stub DocumentViewer so we don't pull in pdfjs-dist (which isn't friendly to jsdom).
// We only care about: which document is mounted, and that onClose works.
vi.mock('@/components/documents/document-viewer', () => ({
  DocumentViewer: ({
    document,
    onClose,
  }: {
    document: { id: number; title: string; mimeType: string; fileName: string } | null;
    onClose?: () => void;
  }) =>
    document ? (
      <div data-testid="stub-document-viewer">
        <div data-testid="viewer-doc-id">{document.id}</div>
        <div data-testid="viewer-doc-title">{document.title}</div>
        <div data-testid="viewer-doc-mime">{document.mimeType}</div>
        <div data-testid="viewer-doc-filename">{document.fileName}</div>
        <button type="button" onClick={onClose}>Stub close</button>
      </div>
    ) : null,
}));

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const baseSatisfiedItem: ChecklistItemData = {
  id: 11,
  templateKey: '718_bylaws',
  title: 'Bylaws',
  description: null,
  category: 'governing_documents',
  statuteReference: '\u00a7718.111(12)(g)',
  documentId: 555,
  documentPostedAt: new Date().toISOString(),
  status: 'satisfied',
};

const baseHandlers = {
  onUpload: vi.fn(),
  onLink: vi.fn(),
  onMarkNA: vi.fn(),
  onMarkApplicable: vi.fn(),
  onUnlink: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComplianceItemActions \u2014 View Document', () => {
  it('does not call window.open and instead fetches metadata + mounts DocumentViewer', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: {
          url: 'https://signed.example/file.pdf',
          fileName: 'bylaws.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      }),
    );

    render(
      <ComplianceItemActions
        item={baseSatisfiedItem}
        communityId={9}
        {...baseHandlers}
      />,
    );

    const viewBtn = screen.getByRole('button', { name: /view document/i });
    await act(async () => {
      fireEvent.click(viewBtn);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/documents/555/download?communityId=9',
      );
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();

    const viewer = await screen.findByTestId('stub-document-viewer');
    expect(viewer).toBeTruthy();
    expect(screen.getByTestId('viewer-doc-id').textContent).toBe('555');
    expect(screen.getByTestId('viewer-doc-mime').textContent).toBe('application/pdf');
    expect(screen.getByTestId('viewer-doc-filename').textContent).toBe('bylaws.pdf');
  });

  it('unmounts the viewer when onClose is called', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: {
          url: 'https://signed.example/file.pdf',
          fileName: 'bylaws.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      }),
    );

    render(
      <ComplianceItemActions
        item={baseSatisfiedItem}
        communityId={9}
        {...baseHandlers}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    });

    const stubClose = await screen.findByRole('button', { name: /stub close/i });
    await act(async () => {
      fireEvent.click(stubClose);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('stub-document-viewer')).toBeNull();
    });
  });

  it('surfaces an error message when the metadata fetch fails', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ error: { message: 'Document not found' } }, 404),
    );

    render(
      <ComplianceItemActions
        item={baseSatisfiedItem}
        communityId={9}
        {...baseHandlers}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/document not found/i);
    expect(screen.queryByTestId('stub-document-viewer')).toBeNull();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/pdf/pdf-viewer', () => ({
  PdfViewer: ({ pdfUrl }: { pdfUrl?: string }) => (
    <div data-testid="pdf-viewer">{pdfUrl}</div>
  ),
}));

import { DocumentViewer } from '../../src/components/documents/document-viewer';

describe('DocumentViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads PDFs through the download route and renders PdfViewer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          url: 'https://storage.example.com/budget.pdf',
          fileName: 'budget.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      }),
    }));

    render(
      <DocumentViewer
        communityId={9}
        document={{
          id: 5,
          title: 'Budget Packet',
          description: null,
          fileName: 'budget.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: 1,
          createdAt: '2026-03-25T12:00:00.000Z',
          uploadedBy: null,
        }}
      />,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/documents/5/download?communityId=9');
    });
    expect(await screen.findByTestId('pdf-viewer')).toHaveTextContent(
      'https://storage.example.com/budget.pdf',
    );
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/v1/documents/5/download?communityId=9&attachment=true',
    );
  });

  it('keeps the signed-url flow for images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          url: 'https://storage.example.com/image.png',
          fileName: 'inspection.png',
          mimeType: 'image/png',
          fileSize: 1024,
        },
      }),
    }));

    render(
      <DocumentViewer
        communityId={9}
        document={{
          id: 6,
          title: 'Inspection Photo',
          description: null,
          fileName: 'inspection.png',
          fileSize: 1024,
          mimeType: 'image/png',
          categoryId: 1,
          createdAt: '2026-03-25T12:00:00.000Z',
          uploadedBy: null,
        }}
      />,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/documents/6/download?communityId=9');
    });
    expect(await screen.findByAltText('Inspection Photo')).toHaveAttribute(
      'src',
      'https://storage.example.com/image.png',
    );
  });

  it('shows an explicit missing-file state and hides download for previewable docs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'DOCUMENT_FILE_MISSING',
          message: 'Document file is missing from storage',
        },
      }),
    }));

    render(
      <DocumentViewer
        communityId={9}
        document={{
          id: 7,
          title: 'Missing Packet',
          description: null,
          fileName: 'missing.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: 1,
          createdAt: '2026-03-25T12:00:00.000Z',
          uploadedBy: null,
        }}
      />,
    );

    expect(await screen.findByText(/backing file is missing from storage/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('shows a retry action for transient storage failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 'DOCUMENT_STORAGE_UNAVAILABLE',
            message: 'Document storage is temporarily unavailable',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            url: 'https://storage.example.com/recovered.pdf',
            fileName: 'recovered.pdf',
            mimeType: 'application/pdf',
            fileSize: 1024,
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DocumentViewer
        communityId={9}
        document={{
          id: 8,
          title: 'Recovered Packet',
          description: null,
          fileName: 'recovered.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: 1,
          createdAt: '2026-03-25T12:00:00.000Z',
          uploadedBy: null,
        }}
      />,
    );

    const retryButton = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('pdf-viewer')).toHaveTextContent(
      'https://storage.example.com/recovered.pdf',
    );
  });

  it('shows the unsupported preview state without fetching metadata', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DocumentViewer
        communityId={9}
        document={{
          id: 9,
          title: 'Board Notes',
          description: null,
          fileName: 'notes.docx',
          fileSize: 1024,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          categoryId: 1,
          createdAt: '2026-03-25T12:00:00.000Z',
          uploadedBy: null,
        }}
      />,
    );

    expect(screen.getByText('Preview not available for this file type')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/v1/documents/9/download?communityId=9&attachment=true',
    );
  });
});

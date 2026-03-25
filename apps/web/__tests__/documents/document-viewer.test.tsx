import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocumentViewer } from '../../src/components/documents/document-viewer';

describe('DocumentViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the same-origin preview route for PDFs', async () => {
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

    const iframe = await screen.findByTitle('Budget Packet');
    expect(iframe).toHaveAttribute('src', '/api/v1/documents/5/preview?communityId=9');
  });

  it('keeps the signed-url flow for images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          url: 'https://storage.example.com/image.png',
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
});

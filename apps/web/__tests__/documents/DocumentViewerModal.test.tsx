import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { DocumentViewerModal } from '@/components/documents/DocumentViewerModal';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DocumentViewerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a spinner then renders an iframe for non-iOS desktops', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { url: 'https://storage.example/doc.pdf', fileName: 'doc.pdf' },
      }),
    });

    render(
      <DocumentViewerModal
        open
        onOpenChange={() => {}}
        communityId={2}
        documentId={9}
        fileName="Quarterly.pdf"
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/documents/9/download?communityId=2');
    });

    await waitFor(() => {
      expect(document.querySelector('iframe[src="https://storage.example/doc.pdf"]')).toBeTruthy();
    });
  });

  it('surfaces retry on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'nope' } }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { url: 'https://storage.example/fixed.pdf', fileName: 'fixed.pdf' },
      }),
    });

    render(
      <DocumentViewerModal
        open
        onOpenChange={() => {}}
        communityId={2}
        documentId={11}
      />,
      { wrapper },
    );

    await screen.findByText(/nope/i);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(document.querySelector('iframe[src="https://storage.example/fixed.pdf"]')).toBeTruthy();
    });
  });
});

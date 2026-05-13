import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type DefaultOptions } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ComplianceItemActions } from '../compliance-item-actions';
import type { ChecklistItemData } from '../compliance-checklist-item';

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

function createQueryWrapper(options?: DefaultOptions) {
  const queryClient = new QueryClient({
    defaultOptions: options ?? {
      queries: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComplianceItemActions \u2014 View Document', () => {
  it('opens the shared document modal and loads the signed URL from the download API', async () => {
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
      <ComplianceItemActions item={baseSatisfiedItem} communityId={9} {...baseHandlers} />,
      { wrapper: createQueryWrapper() },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/documents/555/download?communityId=9',
        { signal: expect.any(AbortSignal) },
      );
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();

    expect(screen.getByTestId('compliance-document-viewer')).toBeVisible();

    await waitFor(() => {
      const frame = document.querySelector('iframe[src="https://signed.example/file.pdf"]');
      expect(frame).toBeTruthy();
    });
  });

  it('closes the modal via the dialog close control', async () => {
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
      <ComplianceItemActions item={baseSatisfiedItem} communityId={9} {...baseHandlers} />,
      { wrapper: createQueryWrapper() },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    });

    await screen.findByTestId('compliance-document-viewer');

    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    const dialogClose = closeButtons[closeButtons.length - 1];
    expect(dialogClose).toBeTruthy();

    await act(async () => {
      fireEvent.click(dialogClose!);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('compliance-document-viewer')).not.toBeInTheDocument();
    });
  });

  it('shows an in-modal error state when the signed URL request fails', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: { message: 'Document not found' } }, 404));

    render(
      <ComplianceItemActions item={baseSatisfiedItem} communityId={9} {...baseHandlers} />,
      { wrapper: createQueryWrapper() },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('compliance-document-viewer')).toBeVisible();
    });

    expect(
      await screen.findByText(/document not found/i),
    ).toBeVisible();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

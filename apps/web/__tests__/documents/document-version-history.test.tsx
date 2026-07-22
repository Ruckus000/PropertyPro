import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentVersionItem } from '../../src/hooks/use-documents';
import type { DocumentListItem } from '../../src/components/documents/document-list';

const useDocumentVersionsMock = vi.fn();

vi.mock('@/hooks/use-documents', () => ({
  useDocumentVersions: (opts: unknown) => useDocumentVersionsMock(opts),
}));

vi.mock('@/components/documents/DocumentViewerModal', () => ({
  DocumentViewerModal: ({ open, documentId }: { open: boolean; documentId: number | null }) => (
    <div data-testid="viewer-modal" data-open={open} data-doc={documentId ?? ''} />
  ),
}));

import { DocumentVersionHistory } from '../../src/components/documents/document-version-history';

const currentDoc = {
  id: 2,
  title: 'Annual Budget',
} as DocumentListItem;

const currentVersion: DocumentVersionItem = {
  id: 2,
  title: 'Annual Budget',
  fileName: 'budget-current.pdf',
  fileSize: 4096,
  mimeType: 'application/pdf',
  createdAt: '2026-05-10T12:00:00.000Z',
  uploadedBy: 'Jane Admin',
};

const olderPdf: DocumentVersionItem = {
  id: 7,
  title: 'Annual Budget',
  fileName: 'budget-old.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  createdAt: '2026-04-01T09:00:00.000Z',
  uploadedBy: null,
};

const olderDoc: DocumentVersionItem = {
  id: 8,
  title: 'Annual Budget',
  fileName: 'budget.docx',
  fileSize: 2048,
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  createdAt: '2026-03-01T09:00:00.000Z',
  uploadedBy: null,
};

function setQuery(state: {
  data?: DocumentVersionItem[];
  isPending?: boolean;
  isError?: boolean;
}) {
  useDocumentVersionsMock.mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
  });
}

function renderHistory(props: Partial<Parameters<typeof DocumentVersionHistory>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentVersionHistory communityId={42} document={currentDoc} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useDocumentVersionsMock.mockReset();
});

describe('DocumentVersionHistory', () => {
  it('shows the loading state while the query is pending', () => {
    setQuery({ isPending: true });
    renderHistory();
    expect(screen.getByTestId('document-version-history-loading')).toBeDefined();
  });

  it('renders the exact error literal on query error', () => {
    setQuery({ isError: true });
    renderHistory();
    expect(screen.getByText('Failed to load version history')).toBeDefined();
  });

  it('renders the empty state when there are no other versions', () => {
    setQuery({ data: [] });
    renderHistory();
    expect(screen.getByText('No other versions found')).toBeDefined();
  });

  it('renders version rows with active badge, numbering and download link', () => {
    setQuery({ data: [currentVersion, olderPdf] });
    renderHistory();

    expect(screen.getByText('Current Version')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Version 1')).toBeDefined();

    const downloadLinks = screen.getAllByText('Download');
    const href = downloadLinks[0].closest('a')?.getAttribute('href');
    expect(href).toBe('/api/v1/documents/2/download?communityId=42&attachment=true');
  });

  it('opens the viewer modal for a previewable older version', () => {
    setQuery({ data: [currentVersion, olderPdf] });
    renderHistory({ onSelectVersion: vi.fn() });

    fireEvent.click(screen.getByText('View'));

    const modal = screen.getByTestId('viewer-modal');
    expect(modal.getAttribute('data-open')).toBe('true');
    expect(modal.getAttribute('data-doc')).toBe('7');
  });

  it('calls onSelectVersion for a non-previewable older version', () => {
    const onSelectVersion = vi.fn();
    setQuery({ data: [currentVersion, olderDoc] });
    renderHistory({ onSelectVersion });

    fireEvent.click(screen.getByText('View'));

    expect(onSelectVersion).toHaveBeenCalledWith(olderDoc);
    expect(screen.getByTestId('viewer-modal').getAttribute('data-open')).toBe('false');
  });

  it('hides the View button when onSelectVersion is not provided', () => {
    setQuery({ data: [currentVersion, olderPdf] });
    renderHistory();
    expect(screen.queryByText('View')).toBeNull();
  });
});

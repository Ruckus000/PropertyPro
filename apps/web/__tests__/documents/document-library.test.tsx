/**
 * The Documents screen.
 *
 * Two things are worth holding still here. The version→viewer hand-off, which
 * moved into `DocumentInspector` when the row-level verbs did; and the
 * statutory gate, which is not defensive coding — `GET /api/v1/compliance`
 * requires `compliance:read` (a TENANT has documents:read but NOT that) and
 * throws Forbidden for a community without `hasCompliance` (every apartment).
 * Firing it anyway 403s the screen for those viewers.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useComplianceChecklistMock } = vi.hoisted(() => ({
  useComplianceChecklistMock: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

let searchParams = new URLSearchParams();
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => '/communities/9/documents',
  useSearchParams: () => searchParams,
}));

vi.mock('@/hooks/use-compliance-checklist', () => ({
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
  useComplianceChecklist: useComplianceChecklistMock,
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: () => ({ categories: [], isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-documents', () => ({
  useDocuments: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDeletedDocuments: () => ({ data: [], isLoading: false, error: null }),
  useRestoreDocument: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDocumentsInvalidator: () => vi.fn(),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useSetDocumentPublicAccess: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
  useDocumentDownloadUrl: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../src/components/documents/document-upload-area', () => ({
  DocumentUploadArea: () => <div>upload area</div>,
}));

vi.mock('../../src/components/documents/document-category-filter', () => ({
  DocumentCategoryFilter: () => <div>category filter</div>,
}));

vi.mock('../../src/components/documents/document-search', () => ({
  DocumentSearch: () => <div>document search</div>,
}));

vi.mock('../../src/components/documents/documents-table', () => ({
  DocumentsTable: ({
    showStatutoryColumns,
    onSelectDocument,
  }: {
    showStatutoryColumns: boolean;
    onSelectDocument?: (document: {
      id: number;
      title: string;
      description: null;
      fileName: string;
      fileSize: number;
      mimeType: string;
      categoryId: number | null;
      createdAt: string;
      uploadedBy: null;
    }) => void;
  }) => (
    <div>
      <div data-testid="statutory-columns">{String(showStatutoryColumns)}</div>
      <button
        type="button"
        onClick={() =>
          onSelectDocument?.({
            id: 1,
            title: 'Board Packet',
            description: null,
            fileName: 'board.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            categoryId: 1,
            createdAt: '2026-03-25T12:00:00.000Z',
            uploadedBy: null,
          })
        }
      >
        Select Document
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/documents/documents-board', () => ({
  DocumentsBoard: () => <div>board view</div>,
}));

vi.mock('../../src/components/documents/documents-timeline', () => ({
  DocumentsTimeline: () => <div>timeline view</div>,
}));

vi.mock('../../src/components/documents/document-viewer', () => ({
  DocumentViewer: ({
    document,
    onViewVersions,
  }: {
    document: { title: string; mimeType: string } | null;
    onViewVersions?: (document: { title: string; mimeType: string }) => void;
  }) => (
    <div>
      <div data-testid="viewer-mime">{document?.mimeType ?? 'none'}</div>
      {document && onViewVersions && (
        <button type="button" onClick={() => onViewVersions(document)}>
          View Versions
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../src/components/documents/document-version-history', () => ({
  DocumentVersionHistory: ({
    onSelectVersion,
  }: {
    onSelectVersion?: (version: {
      id: number;
      fileName: string;
      fileSize: number;
      mimeType: string;
      createdAt: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectVersion?.({
          id: 2,
          fileName: 'board.png',
          fileSize: 2048,
          mimeType: 'image/png',
          createdAt: '2026-03-26T12:00:00.000Z',
        })
      }
    >
      Select PNG Version
    </button>
  ),
}));

import { DocumentLibrary } from '../../src/components/documents/document-library';

function renderLibrary(props: Partial<React.ComponentProps<typeof DocumentLibrary>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentLibrary
        communityId={9}
        communityType="condo_718"
        userRole="property_manager"
        hasEsign
        hasCompliance
        canReadCompliance
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('DocumentLibrary', () => {
  it('updates mimeType when selecting a document version', () => {
    renderLibrary();

    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'Select Document' }));
    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('application/pdf');

    fireEvent.click(screen.getByRole('button', { name: 'View Versions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select PNG Version' }));

    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('image/png');
  });

  it('shows the statutory reading to a viewer who can read compliance', () => {
    renderLibrary();

    expect(screen.getByText(/statutory records/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /All records/i })).toBeDefined();
    expect(screen.getByTestId('statutory-columns')).toHaveTextContent('true');
  });

  it('never asks for the checklist a tenant is not permitted to read', () => {
    // A tenant has documents:read but compliance:read is FALSE. The request
    // would 403, so it must not be made at all.
    useComplianceChecklistMock.mockClear();
    renderLibrary({ userRole: 'resident', isUnitOwner: false, canReadCompliance: false });

    expect(screen.queryByText(/statutory records/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /All records/i })).toBeNull();
    expect(screen.getByTestId('statutory-columns')).toHaveTextContent('false');
    expect(useComplianceChecklistMock).toHaveBeenCalledWith(9, { enabled: false });
  });

  it('never asks for the checklist an apartment community does not have', () => {
    useComplianceChecklistMock.mockClear();
    renderLibrary({ communityType: 'apartment', hasCompliance: false });

    expect(screen.queryByText(/statutory records/i)).toBeNull();
    expect(useComplianceChecklistMock).toHaveBeenCalledWith(9, { enabled: false });
  });
});

describe('the view switcher', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    routerReplace.mockClear();
  });

  it('offers exactly the three readings', () => {
    renderLibrary();
    expect(screen.getByRole('tab', { name: 'List' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Board' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeDefined();
  });

  it('opens on List, and treats anything unknown as List', () => {
    const { unmount } = renderLibrary();
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    searchParams = new URLSearchParams('view=zzz');
    renderLibrary();
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
  });

  it('mounts only the view the URL names', () => {
    searchParams = new URLSearchParams('view=board');
    const { unmount } = renderLibrary();
    expect(screen.getByText('board view')).toBeDefined();
    expect(screen.queryByText('timeline view')).toBeNull();
    unmount();

    searchParams = new URLSearchParams('view=timeline');
    renderLibrary();
    expect(screen.getByText('timeline view')).toBeDefined();
    expect(screen.queryByText('board view')).toBeNull();
  });

  it('writes the view with replace, keeping the other params', async () => {
    // `push` would make Back walk every view the user glanced at instead of
    // leaving the page. Radix activates a tab on mousedown/focus, not on a bare
    // click event, so this needs the full pointer sequence userEvent sends.
    const user = userEvent.setup();
    searchParams = new URLSearchParams('q=budget');
    renderLibrary();

    await user.click(screen.getByRole('tab', { name: 'Board' }));

    expect(routerReplace).toHaveBeenCalled();
    const [url, opts] = routerReplace.mock.calls.at(-1)!;
    expect(url).toContain('view=board');
    expect(url).toContain('q=budget');
    expect(opts).toEqual({ scroll: false });
  });
});

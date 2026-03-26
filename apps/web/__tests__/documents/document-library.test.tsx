import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/documents/document-upload-area', () => ({
  DocumentUploadArea: () => <div>upload area</div>,
}));

vi.mock('../../src/components/documents/document-category-filter', () => ({
  DocumentCategoryFilter: () => <div>category filter</div>,
}));

vi.mock('../../src/components/documents/document-search', () => ({
  DocumentSearch: () => <div>document search</div>,
}));

vi.mock('../../src/components/documents/document-list', () => ({
  DocumentList: ({
    onSelectDocument,
  }: {
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
    <button
      type="button"
      onClick={() => onSelectDocument?.({
        id: 1,
        title: 'Board Packet',
        description: null,
        fileName: 'board.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        categoryId: 1,
        createdAt: '2026-03-25T12:00:00.000Z',
        uploadedBy: null,
      })}
    >
      Select Document
    </button>
  ),
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
        <button
          type="button"
          onClick={() => onViewVersions(document)}
        >
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
      onClick={() => onSelectVersion?.({
        id: 2,
        fileName: 'board.png',
        fileSize: 2048,
        mimeType: 'image/png',
        createdAt: '2026-03-26T12:00:00.000Z',
      })}
    >
      Select PNG Version
    </button>
  ),
}));

import { DocumentLibrary } from '../../src/components/documents/document-library';

describe('DocumentLibrary', () => {
  it('updates mimeType when selecting a document version', () => {
    render(
      <DocumentLibrary
        communityId={9}
        userId="user-1"
        userRole="board_president"
      />,
    );

    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'Select Document' }));
    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('application/pdf');

    fireEvent.click(screen.getByRole('button', { name: 'View Versions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select PNG Version' }));

    expect(screen.getByTestId('viewer-mime')).toHaveTextContent('image/png');
  });
});

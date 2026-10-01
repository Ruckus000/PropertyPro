import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentReplaceFile } from '../../src/components/documents/document-replace-file';
import type { DocumentRow } from '../../src/lib/documents/document-state';

const { useDocumentCategoriesMock, useDocumentUploadMock, replaceFileMock } = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  useDocumentUploadMock: vi.fn(),
  replaceFileMock: vi.fn(),
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));
vi.mock('@/hooks/use-document-upload', () => ({
  useDocumentUpload: useDocumentUploadMock,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const DOC: DocumentRow = {
  id: 71,
  title: '2026 Annual Budget',
  description: null,
  fileName: 'budget.pdf',
  fileSize: 1000,
  mimeType: 'application/pdf',
  categoryId: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  uploadedBy: null,
  publicAccess: false,
  sourceType: 'library',
};

function chooseFile() {
  fireEvent.change(screen.getByLabelText(/New file for/), {
    target: { files: [new File(['v2'], 'budget-v2.pdf', { type: 'application/pdf' })] },
  });
}

describe('DocumentReplaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentUploadMock.mockReturnValue({
      replaceFile: replaceFileMock,
      isUploading: false,
      progress: 0,
      error: null,
    });
    useDocumentCategoriesMock.mockReturnValue({
      // Not redaction-sensitive.
      categories: [{ id: 1, name: 'Rules', slug: 'rules', description: null }],
      isLoading: false,
      error: null,
    });
  });

  it('replaces the file on the same document and reports the result', async () => {
    const result = { id: 71, fileName: 'budget-v2.pdf', fileSize: 2, mimeType: 'application/pdf' };
    replaceFileMock.mockResolvedValue(result);
    const onReplaced = vi.fn();
    render(<DocumentReplaceFile communityId={8} document={DOC} onReplaced={onReplaced} />);

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));

    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(result));
    expect(replaceFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 8, documentId: 71, redactionAttested: false }),
    );
  });

  it('asks the redaction question for a sensitive category, and blocks until it is answered', () => {
    useDocumentCategoriesMock.mockReturnValue({
      // normalizes to `lease_docs`, which is redaction-sensitive
      categories: [{ id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null }],
      isLoading: false,
      error: null,
    });
    render(
      <DocumentReplaceFile communityId={8} document={{ ...DOC, categoryId: 4 }} onReplaced={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    chooseFile();

    const submit = screen.getByRole('button', { name: 'Replace file' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction/ }));
    expect(submit).toBeEnabled();
  });

  it('asks nothing for a PUBLIC document in a non-sensitive category — the server requires nothing there', () => {
    render(
      <DocumentReplaceFile communityId={8} document={{ ...DOC, publicAccess: true }} onReplaced={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    chooseFile();

    expect(screen.queryByRole('checkbox', { name: /Confirm redaction/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeEnabled();
  });

  it('asks nothing for a DRAFT, even in a sensitive category — the server asks at posting', () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [{ id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null }],
      isLoading: false,
      error: null,
    });
    render(
      <DocumentReplaceFile communityId={8} document={{ ...DOC, categoryId: 4, postedAt: null }} onReplaced={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    chooseFile();

    expect(screen.queryByRole('checkbox', { name: /Confirm redaction/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeEnabled();
  });

  it('asks nothing for a private document in a non-sensitive category', () => {
    render(<DocumentReplaceFile communityId={8} document={DOC} onReplaced={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    chooseFile();

    expect(screen.queryByRole('checkbox', { name: /Confirm redaction/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeEnabled();
  });

  it('shows the server’s refusal', () => {
    useDocumentUploadMock.mockReturnValue({
      replaceFile: replaceFileMock,
      isUploading: false,
      progress: 0,
      error: 'This document changed while you were replacing its file.',
    });
    render(<DocumentReplaceFile communityId={8} document={DOC} onReplaced={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This document changed');
  });
});

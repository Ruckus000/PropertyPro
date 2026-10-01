import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';

const { useDocumentCategoriesMock, uploadDocumentFileMock, replaceDocumentFileMock, toastMock } =
  vi.hoisted(() => ({
    useDocumentCategoriesMock: vi.fn(),
    uploadDocumentFileMock: vi.fn(),
    replaceDocumentFileMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));
// The queue's state is real; only the network is mocked.
vi.mock('@/hooks/use-document-upload', () => ({
  uploadDocumentFile: uploadDocumentFileMock,
  replaceDocumentFile: replaceDocumentFileMock,
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import { DocumentUploadQueue } from '../../src/components/documents/document-upload-queue';

const LIBRARY = [
  { id: 71, title: '2026 Annual Budget', fileName: 'budget.pdf', categoryId: 1, sourceType: 'library', postedAt: '2026-01-01T00:00:00Z' },
];

function categories(...names: Array<[number, string]>) {
  useDocumentCategoriesMock.mockReturnValue({
    categories: names.map(([id, name]) => ({ id, name, slug: 'x', description: null })),
    isLoading: false,
    error: null,
  });
}

function choose(container: HTMLElement, ...files: File[]) {
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
    target: { files },
  });
}

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

describe('DocumentUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categories([1, 'Rules'], [4, 'Lease Agreements']); // 4 is redaction-sensitive
    uploadDocumentFileMock.mockResolvedValue({ document: { id: 90 }, warnings: [] });
  });

  it('names the category it was opened in', () => {
    render(<DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} />);
    expect(screen.getByRole('heading', { name: 'Add to Rules' })).toBeInTheDocument();
  });

  it('lists each chosen file, says which cannot be posted and why, and does not ask a category for it', () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} />,
    );

    choose(container, pdf('Pool Rules.pdf'), new File(['x'], 'Owner contact list.xlsx'));

    expect(screen.getByText('2 files · 1 ready, 1 can’t be posted')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Files to upload' });
    const refused = within(list).getByText('Owner contact list.xlsx').closest('li')!;
    expect(within(refused).getByText(/Spreadsheets can’t be posted/)).toBeInTheDocument();
    expect(within(refused).queryByLabelText(/Category for/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post 1 now' })).toBeInTheDocument();
  });

  it('posts the batch and reports it, closing the queue', async () => {
    const onComplete = vi.fn();
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} onComplete={onComplete} />,
    );
    choose(container, pdf('Pool Rules.pdf'), pdf('Gym Rules.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Post 2 now' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ sent: 2, action: 'post' })));
    expect(uploadDocumentFileMock).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledWith('2 documents posted. Owners can see them now.');
    expect(screen.queryByRole('list', { name: 'Files to upload' })).not.toBeInTheDocument();
  });

  it('POSTING into a sensitive category is blocked until the attestation is ticked', async () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={4} />,
    );
    choose(container, pdf('Lease.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tick the personal information check first.');
    expect(uploadDocumentFileMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

    await waitFor(() =>
      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ redactionAttested: true, draft: false }),
        expect.any(Function),
      ),
    );
  });

  it('SAVING AS DRAFT into a sensitive category asks nothing — owners cannot see it', async () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={4} />,
    );
    choose(container, pdf('Lease.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() =>
      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true, redactionAttested: false }),
        expect.any(Function),
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith('1 saved as draft. Owners can’t see it yet.');
  });

  it('asks for a category when none is chosen, and sends nothing', async () => {
    const { container } = render(<DocumentUploadQueue communityId={8} existingDocuments={[]} />);
    choose(container, pdf('a.pdf'), pdf('b.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Post 2 now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a category for 2 files.');
    expect(uploadDocumentFileMock).not.toHaveBeenCalled();
  });

  it('a same-name file offers Replace (default) or Keep both; keep both asks for a title and category', () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={LIBRARY} initialCategoryId={1} />,
    );
    choose(container, pdf('Budget.pdf'));

    expect(screen.getByText(/already in your library: “2026 Annual Budget”/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Replace the old one/ })).toBeChecked();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Keep both/ }));

    expect(screen.getByLabelText('Title')).toHaveValue('Budget');
    expect(screen.getByLabelText('Category for Budget.pdf')).toBeInTheDocument();
  });

  it('sends an optional description, entered after "Add a description"', async () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} />,
    );
    choose(container, pdf('Pool Rules.pdf'));

    expect(screen.queryByLabelText('Description (optional)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: '  Hours and guest rules for the pool.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

    await waitFor(() =>
      expect(uploadDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Hours and guest rules for the pool.' }),
        expect.any(Function),
      ),
    );
  });

  it('a REPLACEMENT of a posted document in a sensitive category raises the attestation — even as a draft', async () => {
    replaceDocumentFileMock.mockResolvedValue({ id: 72, fileName: 'lease.pdf', fileSize: 8, mimeType: 'application/pdf' });
    const library = [
      { id: 72, title: 'Lease', fileName: 'lease.pdf', categoryId: 4, sourceType: 'library', postedAt: '2026-01-01T00:00:00Z' },
    ];
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={library} initialCategoryId={1} />,
    );
    choose(container, pdf('Lease.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tick the personal information check first.');
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() =>
      expect(replaceDocumentFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: 72, redactionAttested: true }),
        expect.any(Function),
      ),
    );
  });

  it('a replacement of a DRAFT asks nothing', async () => {
    replaceDocumentFileMock.mockResolvedValue({ id: 73, fileName: 'memo.pdf', fileSize: 8, mimeType: 'application/pdf' });
    const library = [
      { id: 73, title: 'Memo', fileName: 'memo.pdf', categoryId: 4, sourceType: 'library', postedAt: null },
    ];
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={library} initialCategoryId={1} />,
    );
    choose(container, pdf('memo.pdf'));

    expect(screen.queryByRole('checkbox', { name: /Confirm redaction/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

    await waitFor(() => expect(replaceDocumentFileMock).toHaveBeenCalled());
  });

  it('keeps a failed row with the server’s message and does not close', async () => {
    uploadDocumentFileMock.mockRejectedValueOnce(new Error('We could not save this document.'));
    const onComplete = vi.fn();
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} onComplete={onComplete} />,
    );
    choose(container, pdf('a.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

    expect(await screen.findByText('We could not save this document.')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('removes a row', () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} />,
    );
    choose(container, pdf('a.pdf'), pdf('b.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }));

    expect(screen.getByText('1 file · 1 ready')).toBeInTheDocument();
  });

  it('has no axe violations with refused, warned, duplicate and ready rows', async () => {
    const { container } = render(
      <DocumentUploadQueue communityId={8} existingDocuments={LIBRARY} initialCategoryId={4} />,
    );
    choose(
      container,
      pdf('Lease.pdf'),
      new File(['x'], 'scan.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'list.xlsx'),
      pdf('budget.pdf'),
    );
    // Anti-vacuity: the rows rendered.
    expect(within(screen.getByRole('list', { name: 'Files to upload' })).getAllByRole('listitem')).toHaveLength(4);

    expect(await axe(container)).toHaveNoViolations();
  });
});

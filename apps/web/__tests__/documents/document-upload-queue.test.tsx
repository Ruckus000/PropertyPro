import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';

const {
  useDocumentCategoriesMock,
  uploadDocumentFileMock,
  replaceDocumentFileMock,
  patchChecklistItemMock,
  toastMock,
} = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  uploadDocumentFileMock: vi.fn(),
  replaceDocumentFileMock: vi.fn(),
  patchChecklistItemMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Radix Select reads these; jsdom has none.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));
// The queue's state is real; only the network is mocked.
vi.mock('@/hooks/use-document-upload', () => ({
  uploadDocumentFile: uploadDocumentFileMock,
  replaceDocumentFile: replaceDocumentFileMock,
}));
vi.mock('@/hooks/use-compliance-mutations', () => ({
  patchChecklistItem: patchChecklistItemMock,
}));
vi.mock('sonner', () => ({ toast: toastMock }));

/** The queue refreshes the checklist after a send, so it needs a query client. */
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

import { DocumentUploadQueue } from '../../src/components/documents/document-upload-queue';

const LIBRARY = [
  { id: 71, title: '2026 Annual Budget', fileName: 'budget.pdf', categoryId: 1, sourceType: 'library', postedAt: '2026-01-01T00:00:00Z' },
];

function categories(...names: Array<[number, string]>) {
  useDocumentCategoriesMock.mockReturnValue({
    categories: names.map(([id, name]) => ({ id, name, slug: 'x', description: null })),
    isLoading: false,
    error: null,
    // The library category a record files under, by its checklist category.
    resolveCategoryId: (name: string | null | undefined) =>
      name === 'governing_documents' ? 1 : name === 'financial_records' ? 5 : null,
  });
}

function checklistItem(over: Partial<ChecklistItemData>): ChecklistItemData {
  return { id: 0, templateKey: 'k', title: 'Item', category: 'governing_documents', status: 'unsatisfied', ...over };
}

const CHECKLIST: ChecklistItemData[] = [
  checklistItem({ id: 11, templateKey: '718_budget', title: 'Annual Budget', category: 'financial_records' }),
  checklistItem({ id: 12, templateKey: '718_rules', title: 'Rules & Regulations' }),
  checklistItem({
    id: 13,
    templateKey: '718_bylaws',
    title: 'Bylaws & Amendments',
    status: 'satisfied',
    documentId: 3,
    documentState: 'posted',
  }),
];

function openPicker(label: string) {
  fireEvent.pointerDown(screen.getByLabelText(label), { button: 0, ctrlKey: false, pointerType: 'mouse' });
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

  describe('which record is this?', () => {
    beforeEach(() => {
      categories([1, 'Rules'], [4, 'Lease Agreements'], [5, 'Financial Records']);
      patchChecklistItemMock.mockResolvedValue({});
    });

    it('is not offered without a checklist (an apartment)', () => {
      const { container } = render(<DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} />);
      choose(container, pdf('annual budget.pdf'));
      expect(screen.queryByLabelText(/Record for/)).not.toBeInTheDocument();
    });

    it('guesses from the file name, says so, offers only records still to fill, and the category follows the choice', () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={4} records={CHECKLIST} />,
      );
      choose(container, pdf('annual budget.pdf'));

      const record = screen.getByLabelText('Record for annual budget.pdf');
      expect(record).toHaveTextContent('Annual Budget');
      expect(record).toHaveAccessibleDescription('Suggested from the file name.');
      expect(screen.getByLabelText('Category for annual budget.pdf')).toHaveTextContent('Financial Records');

      openPicker('Record for annual budget.pdf');
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Match automatically',
        'Annual Budget',
        'Rules & Regulations',
      ]);
      fireEvent.click(screen.getByRole('option', { name: 'Rules & Regulations' }));

      expect(screen.getByLabelText('Record for annual budget.pdf')).toHaveTextContent('Rules & Regulations');
      expect(screen.queryByText('Suggested from the file name.')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Category for annual budget.pdf')).toHaveTextContent('Rules');
    });

    it('a record another file holds cannot be chosen again', () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('annual budget.pdf'), pdf('minutes.pdf'));

      expect(screen.getByLabelText('Record for minutes.pdf')).toHaveTextContent('Match automatically');
      openPicker('Record for minutes.pdf');
      expect(screen.getByRole('option', { name: 'Annual Budget (chosen for another file)' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('a replacement asks no record: its document keeps the one it has', () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={LIBRARY} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('budget.pdf'));
      expect(screen.queryByLabelText(/Record for/)).not.toBeInTheDocument();
    });

    it('posts, files the document into its record and says so', async () => {
      const onComplete = vi.fn();
      const { container } = render(
        <DocumentUploadQueue
          communityId={8}
          existingDocuments={[]}
          initialCategoryId={1}
          records={CHECKLIST}
          onComplete={onComplete}
        />,
      );
      choose(container, pdf('rules and regulations.pdf'));
      fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      expect(patchChecklistItemMock).toHaveBeenCalledWith(expect.objectContaining({ id: 12, documentId: 90 }));
      expect(toastMock.success).toHaveBeenCalledWith('1 document posted. Owners can see it now. 1 filed as record.');
    });

    it('when the link fails the row says the file is posted, and can no longer be edited', async () => {
      patchChecklistItemMock.mockRejectedValue(new Error('This record already has a file'));
      const onChanged = vi.fn();
      const { container } = render(
        <DocumentUploadQueue
          communityId={8}
          existingDocuments={[]}
          initialCategoryId={1}
          records={CHECKLIST}
          onChanged={onChanged}
        />,
      );
      choose(container, pdf('rules and regulations.pdf'));
      fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

      expect(
        await screen.findByText(/Posted, but we couldn’t file it as Rules & Regulations\. This record already has a file\./),
      ).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ documentIds: [90] }));
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Record for/)).not.toBeInTheDocument();
    });

    it('saving as a DRAFT files nothing, and says so', async () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('rules and regulations.pdf'));
      fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

      await waitFor(() =>
        expect(toastMock.success).toHaveBeenCalledWith(
          '1 saved as draft. Owners can’t see it yet. Drafts aren’t filed as records.',
        ),
      );
      expect(patchChecklistItemMock).not.toHaveBeenCalled();
    });

    it('a failed link is reported as posted-but-not-filed, not as a failed upload', async () => {
      patchChecklistItemMock.mockRejectedValue(new Error('boom'));
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('rules and regulations.pdf'));
      fireEvent.click(screen.getByRole('button', { name: 'Post 1 now' }));

      await waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith('1 file is posted but not filed as a record. Post again to retry.'),
      );
    });

    it('switching a duplicate to Replace gives up the record it chose', () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={LIBRARY} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('budget.pdf'));
      fireEvent.click(screen.getByRole('radio', { name: /Keep both/ }));
      openPicker('Record for budget.pdf');
      fireEvent.click(screen.getByRole('option', { name: 'Annual Budget' }));
      expect(screen.getByLabelText('Record for budget.pdf')).toHaveTextContent('Annual Budget');

      fireEvent.click(screen.getByRole('radio', { name: /Replace the old one/ }));
      fireEvent.click(screen.getByRole('radio', { name: /Keep both/ }));

      expect(screen.getByLabelText('Record for budget.pdf')).toHaveTextContent('Match automatically');
    });

    it('has no axe violations with a guessed record and an unchosen one', async () => {
      const { container } = render(
        <DocumentUploadQueue communityId={8} existingDocuments={[]} initialCategoryId={1} records={CHECKLIST} />,
      );
      choose(container, pdf('annual budget.pdf'), pdf('minutes.pdf'));
      // Anti-vacuity: both rows rendered a category AND a record field.
      expect(within(screen.getByRole('list', { name: 'Files to upload' })).getAllByRole('combobox')).toHaveLength(4);

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});

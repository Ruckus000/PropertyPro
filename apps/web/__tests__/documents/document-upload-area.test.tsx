import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DocumentUploadArea } from '../../src/components/documents/document-upload-area';

const {
  useDocumentCategoriesMock,
  useDocumentUploadMock,
  uploadDocumentMock,
  replaceFileMock,
} = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  useDocumentUploadMock: vi.fn(),
  uploadDocumentMock: vi.fn(),
  replaceFileMock: vi.fn(),
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));

vi.mock('@/hooks/use-document-upload', () => ({
  useDocumentUpload: useDocumentUploadMock,
}));

describe('DocumentUploadArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentUploadMock.mockReturnValue({
      uploadDocument: uploadDocumentMock,
      replaceFile: replaceFileMock,
      isUploading: false,
      progress: 0,
      error: null,
    });
  });

  it('renders an upload-blocking empty state when no categories exist', () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [],
      isLoading: false,
      error: null,
    });

    render(<DocumentUploadArea communityId={8} />);

    expect(screen.getByText('Create a category before uploading')).toBeInTheDocument();
  });

  it('requires a category before submit', async () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [
        { id: 1, name: 'Rules', slug: 'rules', description: null },
      ],
      isLoading: false,
      error: null,
    });

    const { container } = render(<DocumentUploadArea communityId={8} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['test'], 'rules.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Rules Packet' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Upload Document' }).closest('form')!);

    expect(await screen.findByText('Choose a category before uploading this document.')).toBeInTheDocument();
    expect(uploadDocumentMock).not.toHaveBeenCalled();
  });

  it('renders warning banners returned from successful uploads', async () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [
        { id: 1, name: 'Rules', slug: 'rules', description: null },
      ],
      isLoading: false,
      error: null,
    });
    uploadDocumentMock.mockResolvedValue({
      document: { id: 123 },
      warnings: [{ code: 'notification_dispatch_failed', message: 'Notifications failed.' }],
    });

    const { container } = render(
      <DocumentUploadArea communityId={8} initialCategoryId={1} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['test'], 'rules.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Rules Packet' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Upload Document' }).closest('form')!);

    expect(await screen.findByText('Uploaded with warnings')).toBeInTheDocument();
    expect(screen.getByText('Notifications failed.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Redaction attestation (§718.111(12)(c)).
  //
  // `POST /api/v1/documents` refuses a sensitive-category upload without
  // `redactionAttested: true`. Neither live upload UI ever sent the field, so
  // every such upload 400'd AFTER the bytes reached storage — and the hook
  // replaced the server's explanation with "Upload completed, but saving
  // document metadata failed". The component that owned the checkbox had zero
  // importers.
  //
  // For an apartment community this covered 4 of the 8 default categories
  // (Lease Agreements, Maintenance Records, Financials, Move In/Out Docs).
  // -------------------------------------------------------------------------

  it('blocks submit until redaction is attested for a sensitive category, then forwards it', async () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [
        // normalizes to `lease_docs`, which is redaction-sensitive
        { id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null },
      ],
      isLoading: false,
      error: null,
    });
    uploadDocumentMock.mockResolvedValue({ document: { id: 55 }, warnings: [] });

    const { container } = render(
      <DocumentUploadArea communityId={133} initialCategoryId={4} />,
    );

    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'lease.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Unit 4B Lease' },
    });

    const submit = screen.getByRole('button', { name: 'Upload Document' });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;

    // The prompt is shown, and the upload cannot proceed without it.
    expect(screen.getByText('Confirm redaction before uploading')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.click(checkbox);
    expect(submit).not.toBeDisabled();

    fireEvent.submit(submit.closest('form')!);

    await screen.findByPlaceholderText('Document title');
    expect(uploadDocumentMock).toHaveBeenCalledTimes(1);
    expect(uploadDocumentMock.mock.calls[0]![0]).toMatchObject({
      communityId: 133,
      categoryId: 4,
      redactionAttested: true,
    });
  });

  it('does not ask for an attestation on a category that does not need one', async () => {
    useDocumentCategoriesMock.mockReturnValue({
      // normalizes to `rules`, which is NOT redaction-sensitive
      categories: [{ id: 1, name: 'Rules', slug: 'rules', description: null }],
      isLoading: false,
      error: null,
    });
    uploadDocumentMock.mockResolvedValue({ document: { id: 56 }, warnings: [] });

    const { container } = render(
      <DocumentUploadArea communityId={133} initialCategoryId={1} />,
    );

    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'rules.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'House Rules' },
    });

    expect(screen.queryByText('Confirm redaction before uploading')).not.toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Upload Document' });
    expect(submit).not.toBeDisabled();
    fireEvent.submit(submit.closest('form')!);

    await screen.findByPlaceholderText('Document title');
    expect(uploadDocumentMock.mock.calls[0]![0]).toMatchObject({
      categoryId: 1,
      redactionAttested: false,
    });
  });

  it('revokes the attestation when the file is replaced', async () => {
    // An attestation is about a SPECIFIC document. Ticking the box for one file
    // and then swapping the file must not carry the tick across — that would
    // send redactionAttested:true for a document the uploader never saw, and
    // the server writes that into an append-only §718.111(12)(c) audit row.
    useDocumentCategoriesMock.mockReturnValue({
      categories: [
        { id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null },
      ],
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <DocumentUploadArea communityId={133} initialCategoryId={4} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [new File(['a'], 'lease-a.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);

    // Swap in a different file. It has to be a DROP, not the file input: once a
    // file is chosen the component renders the selected-file panel instead of
    // the <input type="file">, so the input is unmounted and replacing through
    // it is unreachable. The drop zone stays mounted, so drag-and-drop is the
    // real replace path.
    const dropZone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(['b'], 'lease-b.pdf', { type: 'application/pdf' })],
      },
    });

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Upload Document' })).toBeDisabled();
  });

  it('revokes the attestation when the file is removed', async () => {
    useDocumentCategoriesMock.mockReturnValue({
      categories: [
        { id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null },
      ],
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <DocumentUploadArea communityId={133} initialCategoryId={4} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [new File(['a'], 'lease-a.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    fireEvent.change(fileInput, {
      target: { files: [new File(['b'], 'lease-b.pdf', { type: 'application/pdf' })] },
    });

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Same-name files. A board re-uploading "2026 Annual Budget.pdf" almost
  // always means a revised copy of the record it already posted; the default
  // replaces that document's file so its link and compliance item survive.
  // -------------------------------------------------------------------------

  describe('a file whose name is already in the library', () => {
    const EXISTING = [
      { id: 71, title: '2026 Annual Budget', fileName: '2026 Annual Budget.pdf', categoryId: 1, sourceType: 'library' },
    ];

    beforeEach(() => {
      useDocumentCategoriesMock.mockReturnValue({
        // "Rules" is not redaction-sensitive, so no attestation is asked.
        categories: [{ id: 1, name: 'Rules', slug: 'rules', description: null }],
        isLoading: false,
        error: null,
      });
    });

    function pick(container: HTMLElement, name: string) {
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, {
        target: { files: [new File(['v2'], name, { type: 'application/pdf' })] },
      });
    }

    it('defaults to replacing the existing document’s file, keeping its id', async () => {
      replaceFileMock.mockResolvedValue({ id: 71, fileName: '2026 Annual Budget.pdf', fileSize: 2, mimeType: 'application/pdf' });
      const onReplaced = vi.fn();
      const { container } = render(
        <DocumentUploadArea communityId={8} existingDocuments={EXISTING} onReplaced={onReplaced} />,
      );

      pick(container, '2026 annual budget.pdf');

      expect(screen.getByText(/already in your library/)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Replace the old one/ })).toBeChecked();
      // A replacement keeps the title and category, so neither is asked.
      expect(screen.queryByPlaceholderText('Document title')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Replace File' }));

      await vi.waitFor(() => expect(onReplaced).toHaveBeenCalled());
      expect(replaceFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 8, documentId: 71 }),
      );
      expect(uploadDocumentMock).not.toHaveBeenCalled();
    });

    it('uploads a separate document when the uploader chooses to keep both', async () => {
      uploadDocumentMock.mockResolvedValue({ document: { id: 99 }, warnings: [] });
      const { container } = render(
        <DocumentUploadArea communityId={8} initialCategoryId={1} existingDocuments={EXISTING} />,
      );

      pick(container, '2026 Annual Budget.pdf');
      fireEvent.click(screen.getByRole('radio', { name: /Keep both/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));

      await vi.waitFor(() => expect(uploadDocumentMock).toHaveBeenCalled());
      expect(replaceFileMock).not.toHaveBeenCalled();
    });

    it('asks the redaction question by the REPLACED document’s category, not the picker’s', () => {
      useDocumentCategoriesMock.mockReturnValue({
        categories: [
          { id: 1, name: 'Rules', slug: 'rules', description: null },
          // normalizes to `lease_docs`, which is redaction-sensitive
          { id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null },
        ],
        isLoading: false,
        error: null,
      });
      const { container } = render(
        <DocumentUploadArea
          communityId={8}
          initialCategoryId={1}
          existingDocuments={[{ ...EXISTING[0]!, categoryId: 4 }]}
        />,
      );

      pick(container, '2026 Annual Budget.pdf');

      expect(screen.getByRole('checkbox', { name: /Confirm redaction/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace File' })).toBeDisabled();
    });

    it('says nothing about duplicates for a new name', () => {
      const { container } = render(
        <DocumentUploadArea communityId={8} existingDocuments={EXISTING} />,
      );

      pick(container, 'Rules 2026.pdf');

      expect(screen.queryByText(/already in your library/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload Document' })).toBeInTheDocument();
    });
  });

  describe('Save as Draft', () => {
    beforeEach(() => {
      useDocumentCategoriesMock.mockReturnValue({
        // Sensitive: posting would need the attestation; a draft must not.
        categories: [{ id: 4, name: 'Lease Agreements', slug: 'lease-agreements', description: null }],
        isLoading: false,
        error: null,
      });
      uploadDocumentMock.mockResolvedValue({ document: { id: 55 }, warnings: [] });
    });

    it('saves a draft without the attestation, and says owners cannot see it', async () => {
      const { container } = render(<DocumentUploadArea communityId={8} initialCategoryId={4} />);
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File(['x'], 'lease.pdf', { type: 'application/pdf' })] },
      });

      expect(screen.getByRole('button', { name: 'Upload Document' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));

      await vi.waitFor(() => expect(uploadDocumentMock).toHaveBeenCalled());
      expect(uploadDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true, redactionAttested: false }),
      );
    });

    it('the Upload button still posts', async () => {
      const { container } = render(<DocumentUploadArea communityId={8} initialCategoryId={4} />);
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File(['x'], 'lease.pdf', { type: 'application/pdf' })] },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));

      await vi.waitFor(() => expect(uploadDocumentMock).toHaveBeenCalled());
      expect(uploadDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({ draft: false, redactionAttested: true }),
      );
    });
  });
});


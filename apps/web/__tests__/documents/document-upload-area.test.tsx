import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DocumentUploadArea } from '../../src/components/documents/document-upload-area';

const {
  useDocumentCategoriesMock,
  useDocumentUploadMock,
  uploadDocumentMock,
} = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  useDocumentUploadMock: vi.fn(),
  uploadDocumentMock: vi.fn(),
}));

vi.mock('@/hooks/useDocumentCategories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));

vi.mock('@/hooks/useDocumentUpload', () => ({
  useDocumentUpload: useDocumentUploadMock,
}));

describe('DocumentUploadArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentUploadMock.mockReturnValue({
      uploadDocument: uploadDocumentMock,
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
});

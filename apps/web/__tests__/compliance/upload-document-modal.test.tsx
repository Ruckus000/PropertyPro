/**
 * The compliance "Upload & Link" modal, focused on the redaction attestation.
 *
 * This modal only closes when the upload returns NO warnings, so on a warning
 * it stays mounted. Before this was fixed it also kept `redactionAttested`
 * true, which meant the next file inherited a tick the uploader never gave it —
 * and the server writes that into `compliance_audit_log` as a
 * `document_redaction_attestation` row, in an APPEND-ONLY §718.111(12)(c)
 * record that cannot be corrected afterwards.
 *
 * Compliance checklist items map onto financial_records / meeting_records /
 * operations, all three of which the server treats as redaction-sensitive
 * (`operations` normalizes to `unknown`, which fails closed), so this modal
 * hits the attestation more often than not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UploadDocumentModal } from '../../src/components/compliance/upload-document-modal';

const {
  useDocumentCategoriesMock,
  useDocumentUploadMock,
  uploadDocumentMock,
} = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  useDocumentUploadMock: vi.fn(),
  uploadDocumentMock: vi.fn(),
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));

vi.mock('@/hooks/use-document-upload', () => ({
  useDocumentUpload: useDocumentUploadMock,
}));

// normalizes to `financial_records`, which is redaction-sensitive
const SENSITIVE_CATEGORY = { id: 9, name: 'Financial Records', slug: 'financial-records', description: null };

function renderModal(overrides?: { onUploaded?: (id: number) => void; onClose?: () => void }) {
  return render(
    <UploadDocumentModal
      communityId={133}
      defaultTitle="2026 Budget"
      categoryName="Financial Records"
      onUploaded={overrides?.onUploaded ?? vi.fn()}
      onClose={overrides?.onClose ?? vi.fn()}
    />,
  );
}

function chooseFile(container: HTMLElement, name: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
  });
}

describe('UploadDocumentModal redaction attestation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentUploadMock.mockReturnValue({
      uploadDocument: uploadDocumentMock,
      isUploading: false,
      progress: 0,
      error: null,
    });
    useDocumentCategoriesMock.mockReturnValue({
      categories: [SENSITIVE_CATEGORY],
      isLoading: false,
      error: null,
      resolveCategoryId: () => SENSITIVE_CATEGORY.id,
    });
  });

  it('blocks the upload until the attestation is given, then forwards it', async () => {
    uploadDocumentMock.mockResolvedValue({ document: { id: 11 }, warnings: [] });
    const { container } = renderModal();
    chooseFile(container, 'budget.pdf');

    const submit = screen.getByRole('button', { name: 'Upload & Link' });
    expect(screen.getByText('Confirm redaction before uploading')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await vi.waitFor(() => expect(uploadDocumentMock).toHaveBeenCalledTimes(1));
    expect(uploadDocumentMock.mock.calls[0]![0]).toMatchObject({
      communityId: 133,
      categoryId: SENSITIVE_CATEGORY.id,
      redactionAttested: true,
    });
  });

  it('does not carry the attestation to the next file when the modal stays open', async () => {
    // A warning keeps the modal mounted — this is the path that produced a
    // false attestation for a document the uploader never ticked.
    uploadDocumentMock.mockResolvedValue({
      document: { id: 12 },
      warnings: [{ code: 'notification_dispatch_failed', message: 'Notifications failed.' }],
    });

    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    chooseFile(container, 'budget.pdf');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload & Link' }));

    await screen.findByText('Uploaded with warnings');
    expect(onClose).not.toHaveBeenCalled();

    // The tick is gone and the upload is blocked again.
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);

    chooseFile(container, 'reserves.pdf');
    expect(screen.getByRole('button', { name: 'Upload & Link' })).toBeDisabled();
  });
});

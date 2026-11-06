/**
 * BulkDocumentDialog asks the redaction attestation the server now requires
 * (`POST /api/v1/pm/bulk/documents` refuses without it), and offers only the
 * file types the server accepts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DOCUMENT_ACCEPT } from '../../src/lib/documents/upload-rules';

const mutateMock = vi.fn();

vi.mock('@/hooks/use-bulk-documents', () => ({
  useBulkUploadDocuments: () => ({ mutate: mutateMock, reset: vi.fn(), isPending: false }),
}));

import { BulkDocumentDialog } from '../../src/components/pm/BulkDocumentDialog';

const communities = [
  { id: 1, name: 'Alpha Condos' },
  { id: 2, name: 'Beta HOA' },
];

function renderWithFile() {
  render(<BulkDocumentDialog selectedCommunities={communities} open onClose={() => {}} />);
  const input = screen.getByLabelText('Files') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(['%PDF-'], 'budget.pdf', { type: 'application/pdf' })] },
  });
  return input;
}

describe('BulkDocumentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers only the document types the server accepts', () => {
    expect(renderWithFile().accept).toBe(DOCUMENT_ACCEPT);
  });

  it('blocks review until the redaction attestation is confirmed', () => {
    renderWithFile();
    const review = screen.getByRole('button', { name: 'Review & Upload' });

    expect(review).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(review).toBeEnabled();
  });

  it('sends the attestation with the upload', () => {
    renderWithFile();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Review & Upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Upload' }));

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityIds: [1, 2], redactionAttested: true }),
      expect.anything(),
    );
  });
});

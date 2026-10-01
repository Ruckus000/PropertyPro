import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DocumentPostingControl,
  unpostConfirmation,
} from '../../src/components/documents/document-posting-control';
import type { ChecklistRow, DocumentRow } from '../../src/lib/documents/document-state';

const { useDocumentCategoriesMock, useSetDocumentPostedMock, mutateAsyncMock } = vi.hoisted(() => ({
  useDocumentCategoriesMock: vi.fn(),
  useSetDocumentPostedMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
}));

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: useDocumentCategoriesMock,
}));
vi.mock('@/hooks/use-documents', () => ({
  useSetDocumentPosted: useSetDocumentPostedMock,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const DRAFT: DocumentRow = {
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
  postedAt: null,
};
const POSTED: DocumentRow = { ...DRAFT, postedAt: '2026-09-02T00:00:00.000Z' };

function categories(name: string) {
  useDocumentCategoriesMock.mockReturnValue({
    categories: [{ id: 1, name, slug: 'x', description: null }],
    isLoading: false,
    error: null,
  });
}

describe('DocumentPostingControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsyncMock.mockResolvedValue({ id: 71, posted: true });
    useSetDocumentPostedMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      error: null,
    });
    categories('Rules'); // not redaction-sensitive
  });

  it('posts a draft in a non-sensitive category in one click, asking nothing', async () => {
    render(<DocumentPostingControl communityId={8} document={DRAFT} requirement={null} />);

    expect(screen.getByText(/Owners can’t see this document/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post now' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ id: 71, posted: true }));
  });

  it('asks the redaction question first for a sensitive category, and blocks until answered', async () => {
    categories('Lease Agreements'); // normalizes to lease_docs — sensitive
    render(<DocumentPostingControl communityId={8} document={DRAFT} requirement={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Post now' }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Post now' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm redaction/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Post now' }));

    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({ id: 71, posted: true, redactionAttested: true }),
    );
  });

  it('takes a posted document off the site only after the confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<DocumentPostingControl communityId={8} document={POSTED} requirement={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Take off the site' }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Take off the site' }));
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ id: 71, posted: false }));
    confirm.mockRestore();
  });
});

describe('unpostConfirmation', () => {
  const requirement = { id: 1, title: 'Annual Budget', category: 'financial', status: 'satisfied' } as ChecklistRow;

  it('says owners lose it, and nothing more, for a plain document', () => {
    const text = unpostConfirmation(POSTED, null);
    expect(text).toContain('owners can’t see it until you post it again');
    expect(text).not.toContain('public website');
    expect(text).not.toContain('missing');
  });

  it('warns when it comes off the public site, and when a requirement will read as missing', () => {
    const text = unpostConfirmation({ ...POSTED, publicAccess: true }, requirement);
    expect(text).toContain('also comes off the public website');
    expect(text).toContain('record for “Annual Budget”. That requirement will show as missing');
    expect(text).toContain('link the document again after you post it');
    // No legal-penalty claim: florida-compliance.md — we give no legal advice.
    expect(text).not.toMatch(/\$\d|fine/i);
  });
});

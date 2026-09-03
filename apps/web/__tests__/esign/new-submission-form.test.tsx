/**
 * Preselecting a template on the send form.
 *
 * "Send for Signing" on a template now links here with `?templateId=`, so the
 * manager should not have to find in a dropdown the template they just came
 * from. Preselection cannot be a `useState` initializer: the form holds the
 * whole template record, not an id, and the list arrives async.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { useEsignTemplatesMock, useCreateSubmissionMock } = vi.hoisted(() => ({
  useEsignTemplatesMock: vi.fn(),
  useCreateSubmissionMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-esign-templates', () => ({
  useEsignTemplates: (...a: unknown[]) => useEsignTemplatesMock(...a),
}));

vi.mock('@/hooks/use-esign-submissions', () => ({
  useCreateEsignSubmission: (...a: unknown[]) => useCreateSubmissionMock(...a),
}));

import { NewSubmissionForm } from '@/components/esign/new-submission-form';

const PROXY = {
  id: 5,
  name: 'Proxy Form',
  description: null,
  status: 'active',
  templateType: 'proxy',
  sourceDocumentPath: 'communities/1/esign/proxy.pdf',
  fieldsSchema: { version: 1, fields: [], signerRoles: ['owner', 'witness'] },
  createdAt: '2026-01-15T00:00:00Z',
};

const CONSENT = { ...PROXY, id: 9, name: 'Consent Form' };

function renderForm(props: { initialTemplateId?: number } = {}) {
  return render(<NewSubmissionForm communityId={1} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  useEsignTemplatesMock.mockReturnValue({
    data: [PROXY, CONSENT],
    isLoading: false,
  });
  useCreateSubmissionMock.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  });
});

describe('NewSubmissionForm — template preselection', () => {
  it('preselects the template named in the URL and seeds a row per signer role', async () => {
    renderForm({ initialTemplateId: 5 });

    await waitFor(() =>
      expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
        'Proxy Form',
      ),
    );
    // The signer step only renders once a template is chosen, and it takes
    // its rows from the template's signer roles.
    expect(screen.getByText(/Configure Signers/i)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/name/i).length).toBe(2);
  });

  it('preselects the right one when several templates are listed', async () => {
    renderForm({ initialTemplateId: 9 });

    await waitFor(() =>
      expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
        'Consent Form',
      ),
    );
  });

  it('selects nothing for an id that is not in the active list', async () => {
    // Archived or deleted templates are absent — the form must not blank out
    // or throw, it simply behaves as though no id was passed.
    renderForm({ initialTemplateId: 999 });

    await waitFor(() =>
      expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
        'Choose a template',
      ),
    );
    expect(screen.queryByText(/Configure Signers/i)).toBeNull();
  });

  it('selects nothing when no id is passed, exactly as before', async () => {
    renderForm();

    expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
      'Choose a template',
    );
    expect(screen.queryByText(/Configure Signers/i)).toBeNull();
  });

  it('does not preselect a template that has no source PDF', async () => {
    // It cannot be sent; `createSubmission` refuses it.
    useEsignTemplatesMock.mockReturnValue({
      data: [{ ...PROXY, sourceDocumentPath: null }],
      isLoading: false,
    });

    renderForm({ initialTemplateId: 5 });

    await waitFor(() =>
      expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
        'Choose a template',
      ),
    );
  });

  it('waits for the list before deciding, rather than giving up while it loads', async () => {
    useEsignTemplatesMock.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderForm({ initialTemplateId: 5 });

    expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
      'Choose a template',
    );

    useEsignTemplatesMock.mockReturnValue({ data: [PROXY, CONSENT], isLoading: false });
    rerender(<NewSubmissionForm communityId={1} initialTemplateId={5} />);

    await waitFor(() =>
      expect(screen.getByTestId('esign-template-select-trigger').textContent).toContain(
        'Proxy Form',
      ),
    );
  });
});

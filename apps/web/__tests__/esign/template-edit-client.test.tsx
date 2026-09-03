/**
 * TemplateEditClient — the page "Edit Fields" always implied and never had.
 *
 * The PATCH route, its field-schema validation and `useUpdateEsignTemplate`
 * all already existed; the hook had zero call sites. Nothing here needs an
 * upload: `PdfViewer` accepts a URL and the stored template PDF is already
 * served presigned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  useEsignTemplateMock,
  usePdfMock,
  useUpdateMock,
  updateMutate,
  routerPush,
  editorProps,
} = vi.hoisted(() => ({
  useEsignTemplateMock: vi.fn(),
  usePdfMock: vi.fn(),
  useUpdateMock: vi.fn(),
  updateMutate: vi.fn(),
  routerPush: vi.fn(),
  editorProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/hooks/use-esign-templates', () => ({
  useEsignTemplate: (...a: unknown[]) => useEsignTemplateMock(...a),
  useUpdateEsignTemplate: (...a: unknown[]) => useUpdateMock(...a),
}));

vi.mock('@/hooks/use-esign-template-pdf', () => ({
  useEsignTemplatePdfUrl: (...a: unknown[]) => usePdfMock(...a),
}));

// Capture what the shared editor is handed, rather than re-testing it here.
vi.mock('@/components/esign/template-field-editor', () => ({
  TemplateFieldEditor: (props: Record<string, unknown>) => {
    editorProps.current = props;
    return (
      <div data-testid="field-editor">
        <button type="button" onClick={props.onSave as () => void}>
          Save Template
        </button>
      </div>
    );
  },
}));

import { TemplateEditClient } from '../../src/app/(authenticated)/esign/templates/[id]/edit/template-edit-client';

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'Proxy Form',
    description: 'A proxy template',
    status: 'active',
    templateType: 'proxy',
    sourceDocumentPath: 'communities/1/esign/proxy.pdf',
    fieldsSchema: {
      version: 1,
      fields: [
        {
          id: 'f1',
          type: 'signature',
          signerRole: 'owner',
          page: 0,
          x: 10,
          y: 10,
          width: 20,
          height: 5,
          required: true,
        },
      ],
      signerRoles: ['owner', 'witness'],
    },
    inFlightSubmissionCount: 0,
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function setTemplate(data: unknown, state: Record<string, unknown> = {}) {
  useEsignTemplateMock.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    ...state,
  });
}

function renderClient() {
  return render(<TemplateEditClient communityId={1} templateId={5} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  editorProps.current = null;
  setTemplate(template());
  usePdfMock.mockReturnValue({
    data: { pdfUrl: 'https://signed.example/proxy.pdf' },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  updateMutate.mockResolvedValue(undefined);
  useUpdateMock.mockReturnValue({ mutateAsync: updateMutate, isPending: false, error: null });
});

describe('TemplateEditClient', () => {
  it('seeds the details form from the stored template', () => {
    renderClient();

    expect(screen.getByLabelText(/Template Name/i)).toHaveValue('Proxy Form');
    expect(screen.getByLabelText(/Description/i)).toHaveValue('A proxy template');
  });

  it('opens the editor on the stored PDF, with the stored fields and roles', async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByRole('button', { name: /Continue to Editor/i }));

    expect(screen.getByTestId('field-editor')).toBeInTheDocument();
    // The presigned URL, not an uploaded file — nothing is re-uploaded.
    expect(editorProps.current).toMatchObject({
      pdfUrl: 'https://signed.example/proxy.pdf',
      signerRoles: ['owner', 'witness'],
      templateName: 'Proxy Form',
    });
    expect((editorProps.current?.fields as unknown[]).length).toBe(1);
  });

  it('saves the name, description and fields together', async () => {
    const user = userEvent.setup();
    renderClient();

    const nameInput = screen.getByLabelText(/Template Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Proxy Form 2026');
    await user.click(screen.getByRole('button', { name: /Continue to Editor/i }));
    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 5,
        name: 'Proxy Form 2026',
        description: 'A proxy template',
        fieldsSchema: expect.objectContaining({ version: 1, signerRoles: ['owner', 'witness'] }),
      }),
    );
  });

  it('opens an empty editor for a template that never had a field schema', async () => {
    // Templates can exist without one; createSubmission is what rejects them.
    setTemplate(template({ fieldsSchema: null }));
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByRole('button', { name: /Continue to Editor/i }));

    expect(editorProps.current).toMatchObject({ signerRoles: ['signer'] });
    expect((editorProps.current?.fields as unknown[]).length).toBe(0);
  });

  it('refuses to edit fields while signatures are still out, and says what to do', () => {
    setTemplate(template({ inFlightSubmissionCount: 2 }));
    renderClient();

    expect(screen.queryByRole('button', { name: /Continue to Editor/i })).toBeNull();
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/2 signature requests still out/i);
    expect(banner.textContent).toMatch(/Clone/i);
  });

  it('cannot open the editor for a template with no stored PDF', () => {
    setTemplate(template({ sourceDocumentPath: null }));
    renderClient();

    expect(screen.queryByRole('button', { name: /Continue to Editor/i })).toBeNull();
    expect(screen.getByText(/no PDF/i)).toBeInTheDocument();
  });

  it('shows loading and error states rather than an empty form', () => {
    setTemplate(undefined, { isLoading: true });
    const { unmount } = renderClient();
    expect(screen.queryByLabelText(/Template Name/i)).toBeNull();
    unmount();

    setTemplate(undefined, { isLoading: false, error: new Error('Template not found') });
    renderClient();
    expect(screen.getByText('Template not found')).toBeInTheDocument();
  });

  it('surfaces a save failure instead of navigating away', async () => {
    useUpdateMock.mockReturnValue({
      mutateAsync: updateMutate,
      isPending: false,
      error: new Error('This template has 1 signature request still out.'),
    });
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByRole('button', { name: /Continue to Editor/i }));

    expect(editorProps.current?.errorMessage).toBe(
      'This template has 1 signature request still out.',
    );
  });
});

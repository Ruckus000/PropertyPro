/**
 * The e-sign builder shell.
 *
 * The state machine is covered without a DOM in `builder-state.test.ts`. What
 * needs a DOM is what this file tests: which step each entry point opens on,
 * what the two modes ask for, and that a seeded flow re-points the template's
 * fields at recipients rather than dropping them.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EsignFieldsSchema } from '@propertypro/shared';

const {
  useEsignTemplateMock,
  useEsignTemplatePdfUrlMock,
  fieldEditorSpy,
  pushMock,
} = vi.hoisted(() => ({
  useEsignTemplateMock: vi.fn(),
  useEsignTemplatePdfUrlMock: vi.fn(),
  fieldEditorSpy: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/use-esign-templates', () => ({
  useEsignTemplate: useEsignTemplateMock,
  useCreateEsignTemplate: () => ({ mutateAsync: vi.fn() }),
  useUpdateEsignTemplate: () => ({ mutateAsync: vi.fn() }),
  usePresignEsignTemplateUpload: () => ({ mutateAsync: vi.fn() }),
  useImportEsignLibraryDocument: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-esign-template-pdf', () => ({
  useEsignTemplatePdfUrl: useEsignTemplatePdfUrlMock,
}));

vi.mock('@/hooks/use-esign-submissions', () => ({
  useCreateEsignSubmission: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-documents', () => ({
  useDocuments: () => ({ data: [], isLoading: false }),
}));

// pdfjs-dist crashes outside a browser; the editor's own behaviour is not what
// this file is about. Recording the props is, because they are the contract
// between the builder and step 3.
vi.mock('@/components/esign/template-field-editor', () => ({
  TemplateFieldEditor: (props: Record<string, unknown>) => {
    fieldEditorSpy(props);
    return <div data-testid="field-editor" />;
  },
}));

import { EsignBuilder } from '@/components/esign/builder/esign-builder';

const SCHEMA: EsignFieldsSchema = {
  version: 1,
  signerRoles: ['owner', 'witness'],
  fields: [
    {
      id: 'f-owner',
      type: 'signature',
      signerRole: 'owner',
      page: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 5,
      required: true,
    },
    {
      id: 'f-witness',
      type: 'date',
      signerRole: 'witness',
      page: 0,
      x: 10,
      y: 40,
      width: 15,
      height: 4,
      required: true,
    },
  ],
};

const TEMPLATE = {
  id: 5,
  name: 'Limited proxy',
  description: 'For annual meetings',
  sourceDocumentPath: 'communities/1/esign-templates/proxy.pdf',
  fieldsSchema: SCHEMA,
};

beforeEach(() => {
  vi.clearAllMocks();
  useEsignTemplateMock.mockReturnValue({ data: undefined, isLoading: false });
  useEsignTemplatePdfUrlMock.mockReturnValue({ data: undefined });
});

describe('EsignBuilder — from scratch', () => {
  it('opens a send on the document step, with nothing else reachable yet', () => {
    render(<EsignBuilder communityId={1} mode="send" />);

    expect(screen.getByRole('button', { name: 'Document' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Recipients' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    // A disabled Next that says nothing is how a stepped form strands people.
    expect(screen.getByText(/Choose a document to continue/i)).toBeDefined();
  });

  it('asks a template for signer roles where a send asks for recipients', () => {
    render(<EsignBuilder communityId={1} mode="template" />);

    expect(screen.getByRole('button', { name: 'Signer roles' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Recipients' })).toBeNull();
  });

});

describe('EsignBuilder — seeded from a template', () => {
  beforeEach(() => {
    useEsignTemplateMock.mockReturnValue({ data: TEMPLATE, isLoading: false });
    useEsignTemplatePdfUrlMock.mockReturnValue({
      data: { pdfUrl: 'https://signed.example/proxy.pdf' },
    });
  });

  it('opens a send on the recipients step, which is what a template cannot supply', () => {
    render(<EsignBuilder communityId={1} mode="send" templateId={5} />);

    expect(screen.getByRole('button', { name: 'Recipients' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    // One row per role the template declares, waiting for a real person.
    expect(screen.getByDisplayValue('owner')).toBeDefined();
    expect(screen.getByDisplayValue('witness')).toBeDefined();
  });

  it('opens an edit on the fields step, which is what an edit is for', () => {
    render(<EsignBuilder communityId={1} mode="template" templateId={5} isEdit />);

    expect(screen.getByRole('button', { name: 'Place fields' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('field-editor')).toBeDefined();
  });

  it('re-points the template’s fields at recipients, keeping every one', () => {
    // Fields address a recipient, not a role: two recipients may share a role
    // and a role may be renamed, so a field keyed on a role string would end up
    // following the wrong person.
    render(<EsignBuilder communityId={1} mode="template" templateId={5} isEdit />);

    const props = fieldEditorSpy.mock.calls.at(-1)![0] as {
      signerRoles: string[];
      roleLabels: Record<string, string>;
      fields: Array<{ id: string; signerRole: string }>;
    };

    expect(props.fields).toHaveLength(2);
    // Each field now names a recipient id, and every one is a real recipient.
    for (const f of props.fields) {
      expect(props.signerRoles).toContain(f.signerRole);
    }
    // The two fields belong to different recipients, as they did to roles.
    expect(props.fields[0]!.signerRole).not.toBe(props.fields[1]!.signerRole);
    expect(Object.values(props.roleLabels).sort()).toEqual(['owner', 'witness']);
  });

  it('ends an edit with Save changes, not Send', () => {
    render(<EsignBuilder communityId={1} mode="template" templateId={5} isEdit />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: /Save changes/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Send for signing/i })).toBeNull();
  });

  it('hands the editor the stored PDF rather than waiting for an upload', () => {
    render(<EsignBuilder communityId={1} mode="template" templateId={5} isEdit />);

    const props = fieldEditorSpy.mock.calls.at(-1)![0] as {
      pdfUrl: string | null;
      pdfData: Uint8Array | null;
    };
    expect(props.pdfUrl).toBe('https://signed.example/proxy.pdf');
    expect(props.pdfData).toBeNull();
  });
});

/**
 * Unit tests for TemplateDetailClient (B5 batch 4C drain).
 *
 * The direct `fetch` for the presigned PDF URL moved into the
 * `useEsignTemplatePdfUrl` hook. These tests mock that hook (and the
 * template-data / mutation hooks) and assert the component renders the
 * loading / error / success / no-document branches off the hook state,
 * and that Retry calls the hook's `refetch`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// next/dynamic → resolve the importer eagerly so PdfViewer renders inline.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    function MockPdfViewer({ pdfUrl, children }: { pdfUrl: string; children?: ReactNode }) {
      return (
        <div data-testid="pdf-viewer" data-pdf-url={pdfUrl}>
          {children}
        </div>
      );
    }
    return MockPdfViewer;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/esign/field-overlay', () => ({
  FieldOverlay: () => <div data-testid="field-overlay" />,
}));

const useEsignTemplateMock = vi.fn();
const useArchiveMock = vi.fn();
const useCloneMock = vi.fn();
vi.mock('@/hooks/use-esign-templates', () => ({
  useEsignTemplate: (...a: unknown[]) => useEsignTemplateMock(...a),
  useArchiveEsignTemplate: (...a: unknown[]) => useArchiveMock(...a),
  useCloneEsignTemplate: (...a: unknown[]) => useCloneMock(...a),
}));

const usePdfMock = vi.fn();
vi.mock('@/hooks/use-esign-template-pdf', () => ({
  useEsignTemplatePdfUrl: (...a: unknown[]) => usePdfMock(...a),
}));

import { TemplateDetailClient } from '../../src/app/(authenticated)/esign/templates/[id]/template-detail-client';

function baseTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'Proxy Form',
    description: 'A proxy template',
    status: 'active',
    templateType: 'proxy',
    sourceDocumentPath: 'communities/1/esign/proxy.pdf',
    fieldsSchema: { fields: [], signerRoles: [] },
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function setPdf(state: Record<string, unknown>) {
  usePdfMock.mockReturnValue({
    data: undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
    ...state,
  });
}

describe('TemplateDetailClient', () => {
  beforeEach(() => {
    useEsignTemplateMock.mockReset();
    useArchiveMock.mockReset();
    useCloneMock.mockReset();
    usePdfMock.mockReset();
    useArchiveMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCloneMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    });
    useEsignTemplateMock.mockReturnValue({
      data: baseTemplate(),
      isLoading: false,
      error: null,
    });
  });

  it('renders the loading PDF state while the hook is loading', () => {
    setPdf({ isLoading: true });
    render(<TemplateDetailClient communityId={1} templateId={5} />);
    expect(screen.getByTestId('pdf-preview-loading')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Loading PDF preview' })).toBeDefined();
  });

  it('renders the loading PDF state while the hook is refetching', () => {
    setPdf({ isFetching: true });
    render(<TemplateDetailClient communityId={1} templateId={5} />);
    expect(screen.getByTestId('pdf-preview-loading')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Loading PDF preview' })).toBeDefined();
  });

  it('renders the exact error fallback literal and Retry triggers refetch', () => {
    const refetch = vi.fn();
    setPdf({ isError: true, refetch });
    render(<TemplateDetailClient communityId={1} templateId={5} />);

    expect(
      screen.getByText("We couldn't load the PDF preview. Please try again."),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the error fallback when the hook returns no url (settled, no data)', () => {
    setPdf({ data: undefined, isError: false });
    render(<TemplateDetailClient communityId={1} templateId={5} />);
    expect(
      screen.getByText("We couldn't load the PDF preview. Please try again."),
    ).toBeDefined();
  });

  it('renders the PdfViewer on success', () => {
    setPdf({ data: { pdfUrl: 'https://signed.example/proxy.pdf' } });
    render(<TemplateDetailClient communityId={1} templateId={5} />);
    const viewer = screen.getByTestId('pdf-viewer');
    expect(viewer).toBeDefined();
    expect(viewer.getAttribute('data-pdf-url')).toBe(
      'https://signed.example/proxy.pdf',
    );
  });

  // -------------------------------------------------------------------
  // Header actions. Both of these links pointed at
  // `/esign/templates/new?communityId=…` — the blank builder, with no
  // template id — and nothing asserted either, so the two verbs a manager
  // reaches for silently did nothing useful.
  // -------------------------------------------------------------------

  it('sends for signing through the submissions form, with the template preselected', () => {
    setPdf({ data: { pdfUrl: 'https://signed.example/proxy.pdf' } });
    render(<TemplateDetailClient communityId={1} templateId={5} />);

    expect(
      screen.getByRole('link', { name: /Send for Signing/i }).getAttribute('href'),
    ).toBe('/esign/submissions/new?communityId=1&templateId=5');
  });

  it('offers no Send link when the template has no source PDF', () => {
    useEsignTemplateMock.mockReturnValue({
      data: baseTemplate({ sourceDocumentPath: null }),
      isLoading: false,
      error: null,
    });
    setPdf({});
    render(<TemplateDetailClient communityId={1} templateId={5} />);

    expect(screen.queryByRole('link', { name: /Send for Signing/i })).toBeNull();
  });

  it('offers no Edit Fields link at all, rather than one to the blank builder', () => {
    // Field editing belongs in the shared stepped builder, which is not built
    // yet. Until then no button is honest; a button to `/esign/templates/new`
    // is not.
    setPdf({ data: { pdfUrl: 'https://signed.example/proxy.pdf' } });
    render(<TemplateDetailClient communityId={1} templateId={5} />);

    expect(screen.queryByRole('link', { name: /Edit Fields/i })).toBeNull();
    expect(
      screen.queryByRole('link', { name: /Send for Signing/i })?.getAttribute('href'),
    ).not.toContain('/esign/templates/new');
  });

  it('renders the "no PDF document uploaded" branch when sourceDocumentPath is null', () => {
    useEsignTemplateMock.mockReturnValue({
      data: baseTemplate({ sourceDocumentPath: null }),
      isLoading: false,
      error: null,
    });
    setPdf({});
    render(<TemplateDetailClient communityId={1} templateId={5} />);
    expect(
      screen.getByText('No PDF document uploaded for this template.'),
    ).toBeDefined();
  });
});

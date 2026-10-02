/**
 * The Documents tool: one row per records group, linked to the library, with
 * the website rule's threshold wording — and never a request for apartments,
 * which the compliance route refuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DocumentsPanel } from '@/components/pm/site-editor-v3/panels/DocumentsPanel';

const { useComplianceChecklistMock, useRequiredSectionsMock } = vi.hoisted(() => ({
  useComplianceChecklistMock: vi.fn(),
  useRequiredSectionsMock: vi.fn(),
}));

vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: useComplianceChecklistMock,
}));
vi.mock('@/components/pm/site-editor-v3/required-sections-context', () => ({
  useRequiredSections: useRequiredSectionsMock,
}));

const REQUIRED = {
  level: 'required',
  threshold: { minUnits: 25, unitNoun: 'units' },
  subject: { communityType: 'condo_718', unitCount: 40 },
};

function checklist(data: unknown[] | undefined, extra: Record<string, unknown> = {}) {
  useComplianceChecklistMock.mockReturnValue({ data, isError: false, refetch: vi.fn(), ...extra });
}

beforeEach(() => {
  vi.clearAllMocks();
  useRequiredSectionsMock.mockReturnValue(REQUIRED);
});

describe('DocumentsPanel', () => {
  it('links a draft group to that draft and a missing group to the library', () => {
    checklist([
      { id: 1, templateKey: 'a', title: 'Bylaws', category: 'governing_documents', status: 'unsatisfied', documentId: 42, documentState: 'draft' },
      { id: 2, templateKey: 'b', title: 'Budget', category: 'financial_records', status: 'unsatisfied', documentId: null, documentState: null },
      { id: 3, templateKey: 'c', title: 'Policy', category: 'insurance', status: 'satisfied', documentId: 7, documentState: 'posted' },
    ]);
    render(<DocumentsPanel communityId={5} communityType="condo_718" />);

    const governing = screen.getByTestId('records-group-governing_documents');
    expect(within(governing).getByText('Saved, not posted')).toBeInTheDocument();
    expect(within(governing).getByRole('link', { name: /Review and post/ })).toHaveAttribute(
      'href',
      '/communities/5/documents?doc=42',
    );

    const financial = screen.getByTestId('records-group-financial_records');
    expect(within(financial).getByText('Nothing posted')).toBeInTheDocument();
    expect(within(financial).getByRole('link', { name: /Upload/ })).toHaveAttribute(
      'href',
      '/communities/5/documents',
    );

    const insurance = screen.getByTestId('records-group-insurance');
    expect(within(insurance).getByText('Up to date')).toBeInTheDocument();
    expect(within(insurance).queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('records-recommended-note')).toBeNull();
  });

  it('says "recommended" below the size threshold, with no fine or deadline copy', () => {
    useRequiredSectionsMock.mockReturnValue({
      ...REQUIRED,
      level: 'recommended',
      subject: { communityType: 'condo_718', unitCount: 12 },
    });
    checklist([]);
    render(<DocumentsPanel communityId={5} communityType="condo_718" />);
    const note = screen.getByTestId('records-recommended-note');
    expect(note).toHaveTextContent('applies from 25 units');
    expect(note).toHaveTextContent('this association has 12');
    expect(screen.getByTestId('tool-panel-documents').textContent).not.toMatch(/\$\d|fine|due soon/i);
  });

  it('never asks for a checklist for an apartment community', () => {
    checklist(undefined);
    render(<DocumentsPanel communityId={5} communityType="apartment" />);
    expect(useComplianceChecklistMock).toHaveBeenCalledWith(5, { enabled: false });
    expect(screen.getByRole('link', { name: /Open documents/ })).toHaveAttribute(
      'href',
      '/communities/5/documents',
    );
    expect(screen.queryByRole('list', { name: 'Official records' })).toBeNull();
  });

  it('offers a retry when the checklist fails to load', () => {
    checklist(undefined, { isError: true });
    render(<DocumentsPanel communityId={5} communityType="hoa_720" />);
    expect(screen.getByText("Couldn't load your records")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

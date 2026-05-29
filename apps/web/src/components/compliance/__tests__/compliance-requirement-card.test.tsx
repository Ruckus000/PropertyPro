import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ComplianceRequirementCard } from '../compliance-requirement-card';
import type { ChecklistItemData } from '../compliance-checklist-item';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const overdueItem: ChecklistItemData = {
  id: 1,
  templateKey: '718_declaration',
  title: 'Conflict of Interest Contracts',
  description: 'Required by Florida law. Owners can request this at any time.',
  category: 'governing_documents',
  statuteReference: '§718.111(12)(g)',
  documentId: null,
  documentPostedAt: null,
  deadline: '2020-01-01T00:00:00.000Z',
  status: 'overdue',
};

const handlers = {
  onUpload: vi.fn(),
  onLink: vi.fn(),
  onView: vi.fn(),
  onMarkApplicable: vi.fn(),
  onMarkNA: vi.fn(),
  onUnlink: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe('ComplianceRequirementCard — collapsed', () => {
  it('renders the title, status label, and plain-language why', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    expect(screen.getByText('Conflict of Interest Contracts')).toBeVisible();
    expect(screen.getByText('Overdue')).toBeVisible();
    expect(
      screen.getByText(/required by florida law/i),
    ).toBeVisible();
  });

  it('renders the resolved primary CTA and fires its handler', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    // overdue + no document + non-board role => "Upload document" / upload
    const cta = screen.getByRole('button', { name: 'Upload document' });
    fireEvent.click(cta);
    expect(handlers.onUpload).toHaveBeenCalledWith(overdueItem);
  });

  it('hides the primary CTA for a read-only user with no document', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite={false} {...handlers} />,
      { wrapper: wrapper() },
    );
    expect(screen.queryByRole('button', { name: 'Upload document' })).toBeNull();
  });

  it('starts collapsed: expand control has aria-expanded=false', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    const toggle = screen.getByRole('button', { name: /show details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

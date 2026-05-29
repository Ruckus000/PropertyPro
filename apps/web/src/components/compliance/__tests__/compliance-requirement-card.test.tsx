import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ComplianceRequirementCard } from '../compliance-requirement-card';
import type { ChecklistItemData } from '../compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';

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

  it('shows and fires View document for a read-only user with a document', () => {
    const item = { ...overdueItem, documentId: 42 };
    render(
      <ComplianceRequirementCard item={item} communityId={9} canWrite={false} {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: 'View document' }));
    expect(handlers.onView).toHaveBeenCalledWith(item);
  });
});

describe('ComplianceRequirementCard — expanded', () => {
  it('reveals status checks, statute, and the full action row on expand', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));

    // status checks
    expect(screen.getByText(/document on file/i)).toBeVisible();
    expect(screen.getByText(/posted to owner portal/i)).toBeVisible();
    expect(screen.getByText(/audit trail/i)).toBeVisible();

    // expert detail
    expect(screen.getByText('§718.111(12)(g)')).toBeVisible();

    // guided "what's required" help text (HELP_TEXT['718_declaration'])
    expect(screen.getByText(/recorded declaration of condominium/i)).toBeVisible();

    // full action row (overdue, writable, no doc, non-board => Upload + Link + N/A)
    expect(screen.getByRole('button', { name: /upload document for/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /link existing document/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /mark .* as not applicable/i })).toBeVisible();
  });

  it('renders recent activity when supplied, empty message when not', () => {
    const events: AuditEntry[] = [
      {
        id: 7,
        userId: 'u1',
        action: 'unlink_document',
        resourceType: 'compliance_item',
        resourceId: '1',
        metadata: null,
        createdAt: '2026-05-20T12:00:00.000Z',
      },
    ];
    const { rerender } = render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite recentEvents={events} {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/unlink document/i)).toBeVisible();

    rerender(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite recentEvents={[]} {...handlers} />,
    );
    expect(screen.getByText(/no recent activity/i)).toBeVisible();
  });

  it('does not render write actions for a read-only user', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite={false} {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.queryByRole('button', { name: /upload document for/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /link existing document/i })).toBeNull();
  });
});

describe('ComplianceRequirementCard — done variant', () => {
  const satisfiedItem: ChecklistItemData = {
    id: 2,
    templateKey: '718_bylaws',
    title: 'Bylaws',
    description: null,
    category: 'governing_documents',
    statuteReference: '§718.112',
    documentId: 555,
    documentPostedAt: '2026-05-01T00:00:00.000Z',
    deadline: null,
    status: 'satisfied',
  };

  it('shows the View document CTA for a satisfied item', () => {
    render(
      <ComplianceRequirementCard item={satisfiedItem} communityId={9} canWrite variant="done" {...handlers} />,
      { wrapper: wrapper() },
    );
    // satisfied => resolveComplianceCta returns View document / view
    const cta = screen.getByRole('button', { name: 'View document' });
    fireEvent.click(cta);
    expect(handlers.onView).toHaveBeenCalledWith(satisfiedItem);
  });
});

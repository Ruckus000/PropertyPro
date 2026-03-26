/**
 * Unit tests for AuditTrailViewer component (P3-53).
 *
 * Tests cover:
 * - Renders loading state
 * - Renders audit entries
 * - Empty state
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuditTrailViewer } from '../../src/components/audit/AuditTrailViewer';

const fetchMock = vi.fn();
global.fetch = fetchMock;

function makeAuditResponse(entries: Record<string, unknown>[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: entries,
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
        users: {},
      }),
  };
}

describe('AuditTrailViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<AuditTrailViewer communityId={42} />);
    expect(screen.getByText('Loading audit trail...')).toBeDefined();
  });

  it('renders empty state when no entries', async () => {
    fetchMock.mockResolvedValue(makeAuditResponse());
    render(<AuditTrailViewer communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('No audit entries found.')).toBeDefined();
    });
  });

  it('renders audit entry rows', async () => {
    fetchMock.mockResolvedValue(
      makeAuditResponse([
        {
          id: 1,
          userId: 'user-abc',
          communityId: 42,
          action: 'create',
          resourceType: 'document',
          resourceId: '10',
          oldValues: null,
          newValues: null,
          metadata: null,
          createdAt: '2026-02-20T12:00:00Z',
        },
      ]),
    );

    render(<AuditTrailViewer communityId={42} />);

    await waitFor(() => {
      // "Create" appears in both the filter <option> and the entry <span>, so use getAllByText
      const createElements = screen.getAllByText('Create');
      expect(createElements.length).toBeGreaterThanOrEqual(2); // option + entry
      // Verify the audit entry rendered (resource info split across text nodes)
      const container = document.querySelector('.space-y-2');
      expect(container).not.toBeNull();
      expect(container?.textContent).toContain('document');
      expect(container?.textContent).toContain('#10');
    });
  });

  it('renders system-generated entries without a user id', async () => {
    fetchMock.mockResolvedValue(
      makeAuditResponse([
        {
          id: 2,
          userId: null,
          communityId: 42,
          action: 'update',
          resourceType: 'visitor_log',
          resourceId: '11',
          oldValues: null,
          newValues: { checkedOutAt: '2026-03-26T12:00:00Z' },
          metadata: { transition: 'auto_checkout' },
          createdAt: '2026-03-26T12:00:00Z',
        },
      ]),
    );

    render(<AuditTrailViewer communityId={42} />);

    await waitFor(() => {
      expect(screen.getByText('By: System')).toBeDefined();
    });
  });
});

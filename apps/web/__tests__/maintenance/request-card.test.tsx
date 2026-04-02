/**
 * Unit tests for RequestCard component.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RequestCard } from '../../src/components/maintenance/RequestCard';
import type { MaintenanceRequestItem } from '../../src/lib/api/maintenance-requests';

vi.mock('@/lib/api/maintenance-requests', () => ({
  addComment: vi.fn(),
  getRequest: vi.fn(),
}));

vi.mock('@/lib/utils/format-date', () => ({
  formatShortDate: vi.fn(() => 'Jan 1, 2026'),
}));

import { addComment, getRequest } from '@/lib/api/maintenance-requests';
const mockAddComment = addComment as ReturnType<typeof vi.fn>;
const mockGetRequest = getRequest as ReturnType<typeof vi.fn>;

const baseRequest: MaintenanceRequestItem = {
  id: 1,
  communityId: 42,
  title: 'Leaky faucet',
  description: 'The kitchen faucet is dripping.',
  status: 'submitted',
  priority: 'medium',
  category: 'plumbing',
  unitId: null,
  submittedById: 'user-1',
  assignedToId: null,
  internalNotes: null,
  resolutionDescription: null,
  resolutionDate: null,
  photos: null,
  comments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('RequestCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders request title and category', () => {
    render(<RequestCard request={baseRequest} communityId={42} />);
    expect(screen.getByText('Leaky faucet')).toBeDefined();
    expect(screen.getByText(/plumbing/)).toBeDefined();
  });

  it('shows status badge with "submitted" text', () => {
    render(<RequestCard request={baseRequest} communityId={42} />);
    expect(screen.getByText('submitted')).toBeDefined();
  });

  it('shows priority badge with "medium priority" text', () => {
    render(<RequestCard request={baseRequest} communityId={42} />);
    expect(screen.getByText('medium priority')).toBeDefined();
  });

  it('normalizes legacy status "open" to "submitted"', () => {
    const request = { ...baseRequest, status: 'open' };
    render(<RequestCard request={request} communityId={42} />);
    expect(screen.getByText('submitted')).toBeDefined();
  });

  it('normalizes legacy priority "normal" to "medium priority"', () => {
    const request = { ...baseRequest, priority: 'normal' };
    render(<RequestCard request={request} communityId={42} />);
    expect(screen.getByText('medium priority')).toBeDefined();
  });

  it('is collapsed by default — description and CommentThread not visible', () => {
    render(<RequestCard request={baseRequest} communityId={42} />);
    expect(screen.queryByText('The kitchen faucet is dripping.')).toBeNull();
    // The CommentThread form label only appears when expanded
    expect(screen.queryByText('Add a comment')).toBeNull();
  });

  it('expands the card on header click, revealing description', () => {
    render(<RequestCard request={baseRequest} communityId={42} />);
    const header = screen.getByText('Leaky faucet').closest('div[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    expect(screen.getByText('The kitchen faucet is dripping.')).toBeDefined();
  });

  it('shows comment count badge when request has comments', () => {
    const request = {
      ...baseRequest,
      comments: [
        {
          id: 1,
          requestId: 1,
          userId: 'user-1',
          text: 'A comment',
          isInternal: false,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          requestId: 1,
          userId: 'user-2',
          text: 'Another comment',
          isInternal: false,
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
    };
    render(<RequestCard request={request} communityId={42} />);
    expect(screen.getByText('2 comments')).toBeDefined();
  });

  it('shows photo thumbnails when card is expanded and photos are present', () => {
    const request = {
      ...baseRequest,
      photos: [
        {
          url: 'https://example.com/photo1.jpg',
          thumbnailUrl: 'https://example.com/photo1-thumb.jpg',
          storagePath: 'photos/photo1.jpg',
          uploadedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    render(<RequestCard request={request} communityId={42} />);
    const header = screen.getByText('Leaky faucet').closest('div[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    const img = screen.getByRole('img', { name: /Photo 1/ }) as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toBe('https://example.com/photo1-thumb.jpg');
  });

  it('shows photo placeholder when thumbnailUrl is null', () => {
    const request = {
      ...baseRequest,
      photos: [
        {
          url: 'https://example.com/photo1.jpg',
          thumbnailUrl: null,
          storagePath: 'photos/photo1.jpg',
          uploadedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    render(<RequestCard request={request} communityId={42} />);
    const header = screen.getByText('Leaky faucet').closest('div[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    expect(screen.getByText('Photo')).toBeDefined();
  });

  it('shows resolution box when request has resolutionDescription and card is expanded', async () => {
    const request = {
      ...baseRequest,
      status: 'resolved',
      resolutionDescription: 'Replaced the faucet washer.',
    };
    render(<RequestCard request={request} communityId={42} />);
    const header = screen.getByText('Leaky faucet').closest('div[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByText('Resolution')).toBeDefined();
      expect(screen.getByText('Replaced the faucet washer.')).toBeDefined();
    });
  });
});

/**
 * Unit tests for RequestCard component.
 *
 * Restored from fc58cddd7^ (deleted in #1382 as unreferenced). The card is now
 * the body of the Operations hub's request panel, so it no longer collapses:
 * the collapse/expand cases became "shows the detail". Status renders through
 * StatusBadge (icon + label + colour), so its label is "Submitted".
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestCard } from '../../src/components/maintenance/RequestCard';
import type { MaintenanceRequestItem } from '../../src/lib/api/maintenance-requests';

vi.mock('@/lib/api/maintenance-requests', () => ({
  addComment: vi.fn(),
  getRequest: vi.fn(),
  listMyRequests: vi.fn(),
}));

const TZ = 'America/New_York';

function renderCard(request: MaintenanceRequestItem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <RequestCard request={request} communityId={42} communityTimezone={TZ} />;
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseRequest: MaintenanceRequestItem = {
  id: 1,
  communityId: 42,
  title: 'Leaky faucet',
  description: 'The kitchen faucet is dripping.',
  status: 'submitted',
  priority: 'medium',
  category: 'plumbing',
  unitId: null,
  unitLabel: null,
  submittedById: 'user-1',
  assignedToId: null,
  internalNotes: null,
  resolutionDescription: null,
  resolutionDate: null,
  photos: null,
  comments: [],
  createdAt: '2026-01-01T15:00:00Z',
  updatedAt: '2026-01-01T15:00:00Z',
};

const photo = (overrides: Partial<NonNullable<MaintenanceRequestItem['photos']>[number]> = {}) => ({
  url: 'https://example.com/photo1.jpg',
  thumbnailUrl: 'https://example.com/photo1-thumb.jpg',
  storagePath: '42/maintenance/photo1.jpg',
  uploadedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('RequestCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders request title, category and submitted date', () => {
    renderCard(baseRequest);
    expect(screen.getByRole('heading', { name: 'Leaky faucet' })).toBeDefined();
    expect(screen.getByText(/plumbing/)).toBeDefined();
    expect(screen.getByText(/Submitted Jan 1, 2026/)).toBeDefined();
  });

  it('shows the status badge with its label', () => {
    renderCard(baseRequest);
    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
  });

  it('shows priority with "priority" text', () => {
    renderCard(baseRequest);
    expect(screen.getByText(/medium/).parentElement?.textContent).toMatch(/medium\s*priority/);
  });

  it('normalizes legacy status "open" to "Submitted"', () => {
    renderCard({ ...baseRequest, status: 'open' });
    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^open$/i)).toBeNull();
  });

  it('normalizes legacy priority "normal" to "medium priority"', () => {
    renderCard({ ...baseRequest, priority: 'normal' });
    expect(screen.getByText(/medium/).parentElement?.textContent).toMatch(/medium\s*priority/);
    expect(screen.queryByText(/normal/)).toBeNull();
  });

  it('shows the description and the comment box without any expanding', () => {
    renderCard(baseRequest);
    expect(screen.getByText('The kitchen faucet is dripping.')).toBeDefined();
    expect(screen.getByLabelText('Add a comment')).toBeDefined();
  });

  it('shows comment count badge when request has comments', () => {
    const comment = { requestId: 1, userId: 'user-1', isInternal: false, createdAt: '2026-01-01T00:00:00Z' };
    renderCard({
      ...baseRequest,
      comments: [
        { ...comment, id: 1, text: 'A comment' },
        { ...comment, id: 2, text: 'Another comment' },
      ],
    });
    expect(screen.getByText('2 comments')).toBeDefined();
  });

  it('shows the photo thumbnail, linked to the full-size photo', () => {
    renderCard({ ...baseRequest, photos: [photo()] });
    const img = screen.getByRole('img', { name: /Photo 1/ }) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/photo1-thumb.jpg');
    expect(img.closest('a')?.getAttribute('href')).toBe('https://example.com/photo1.jpg');
  });

  it('shows the full-size photo when thumbnailUrl is null', () => {
    renderCard({ ...baseRequest, photos: [photo({ thumbnailUrl: null })] });
    const img = screen.getByRole('img', { name: /Photo 1/ }) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/photo1.jpg');
  });

  it('shows a placeholder when the photo could not be signed (url null) and has no thumbnail', () => {
    renderCard({ ...baseRequest, photos: [photo({ thumbnailUrl: null, url: null })] });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Photo unavailable')).toBeDefined();
  });

  it('shows resolution box when request has resolutionDescription', () => {
    renderCard({
      ...baseRequest,
      status: 'resolved',
      resolutionDescription: 'Replaced the faucet washer.',
    });
    expect(screen.getByText('Resolution')).toBeDefined();
    expect(screen.getByText('Replaced the faucet washer.')).toBeDefined();
  });
});

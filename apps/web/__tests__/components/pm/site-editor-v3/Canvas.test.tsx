/**
 * The editor canvas — render path, states, and ordering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Canvas, sortBlocks } from '@/components/pm/site-editor-v3/canvas/Canvas';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';

const blocksState = vi.hoisted(() => ({
  value: { data: [] as unknown[], isPending: false, isError: false, error: null as Error | null },
}));
const refetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({ ...blocksState.value, refetch }),
  // Reached through SectionShell → FloatControls, which wraps every block.
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The canvas now renders inside the editor context (mounted by EditorRoot).
// Stubbed here so these tests stay about the render path, not selection.
vi.mock('@/components/pm/site-editor-v3/editor-context', () => ({
  useSiteEditor: () => ({
    isSelected: () => false,
    select: vi.fn(),
    move: vi.fn(),
    canMove: () => true,
    isMoving: false,
  }),
}));

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const CONTEXT: CanvasContext = {
  community: {
    id: 7,
    slug: 'sunset-condos',
    name: 'Sunset Condos',
    logoUrl: null,
    communityType: 'condo_718',
    city: null,
    state: null,
    timezone: 'America/New_York',
  },
  theme: {
    primaryColor: '#C2533A',
    secondaryColor: '#6B7280',
    accentColor: '#FCF1ED',
    headingFont: 'Fraunces',
    bodyFont: 'Inter',
  },
  layout: 'tidewater',
  preview: {
    announcements: [
      {
        id: 1,
        title: 'Recent notice',
        body: '',
        bodyHtml: '<p>Recent</p>',
        isPinned: false,
        publishedAt: new Date(NOW - 2 * DAY),
      },
      {
        id: 2,
        title: 'Ancient notice',
        body: '',
        bodyHtml: '<p>Ancient</p>',
        isPinned: false,
        publishedAt: new Date(NOW - 300 * DAY),
      },
    ] as never,
    documents: [],
    meetings: [],
    contact: { management: null, board: [] },
  },
};

function renderCanvas() {
  return render(<Canvas communityId={7} context={CONTEXT} now={NOW} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  blocksState.value = { data: [], isPending: false, isError: false, error: null };
});

describe('Canvas — states', () => {
  it('shows a busy skeleton while blocks load', () => {
    blocksState.value = { data: [], isPending: true, isError: false, error: null };
    const { container } = renderCanvas();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Loading your site')).toBeInTheDocument();
  });

  it('shows a recoverable error with a retry', () => {
    blocksState.value = {
      data: [],
      isPending: false,
      isError: true,
      error: new Error('network down'),
    };
    renderCanvas();
    expect(screen.getByText("We couldn't load your site")).toBeInTheDocument();
    expect(screen.getByText('network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows an empty state rather than a blank canvas', () => {
    renderCanvas();
    expect(screen.getByText('Your site is empty')).toBeInTheDocument();
  });
});

describe('Canvas — rendering blocks', () => {
  it('renders an authored block through the shared view', () => {
    blocksState.value = {
      data: [
        {
          id: 10,
          blockType: 'text',
          blockOrder: 0,
          content: { heading: 'About us', body: 'A community.' },
          isDraft: true,
          publishedAt: null,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByText('About us')).toBeInTheDocument();
    expect(screen.getByText('A community.')).toBeInTheDocument();
  });

  it('narrows system-of-record rows by the block config', () => {
    // The superset holds both announcements; a 30-day window must drop the old
    // one without any refetch.
    blocksState.value = {
      data: [
        {
          id: 11,
          blockType: 'announcements',
          blockOrder: 0,
          content: { limit: 5, timeWindowDays: 30 },
          isDraft: true,
          publishedAt: null,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByText('Recent notice')).toBeInTheDocument();
    expect(screen.queryByText('Ancient notice')).not.toBeInTheDocument();
  });

  it('falls back to schema defaults for half-configured blocks', () => {
    // A block mid-edit must still preview rather than vanish.
    blocksState.value = {
      data: [
        {
          id: 12,
          blockType: 'announcements',
          blockOrder: 0,
          content: {},
          isDraft: true,
          publishedAt: null,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByRole('heading', { name: 'Announcements' })).toBeInTheDocument();
  });

  it('shows the empty state when every block is unrenderable', () => {
    // The PM blocks endpoint returns tombstone rows (staged deletions). Counting
    // them before filtering left a bare bordered box with no explanation.
    blocksState.value = {
      data: [
        { id: 20, blockType: 'tombstone', blockOrder: 0, content: {}, isDraft: true, publishedAt: null },
        { id: 21, blockType: 'tombstone', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByText('Your site is empty')).toBeInTheDocument();
  });

  it('skips a block type it has no view for instead of crashing', () => {
    blocksState.value = {
      data: [
        { id: 13, blockType: 'tombstone', blockOrder: 0, content: {}, isDraft: true, publishedAt: null },
        {
          id: 14,
          blockType: 'text',
          blockOrder: 1,
          content: { heading: 'Still here', body: 'Rendered anyway.' },
          isDraft: true,
          publishedAt: null,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByText('Still here')).toBeInTheDocument();
  });
});

describe('sortBlocks', () => {
  const b = (id: number, blockType: string, blockOrder: number) =>
    ({ id, blockType, blockOrder, content: {}, isDraft: false, publishedAt: null }) as never;

  it('pins the hero first regardless of its stored order', () => {
    // The published site always leads with the hero; the canvas has to agree or
    // the preview misrepresents the running order.
    const out = sortBlocks([b(1, 'text', 0), b(2, 'hero', 5), b(3, 'documents', 1)]);
    expect(out.map((x) => x.blockType)).toEqual(['hero', 'text', 'documents']);
  });

  it('orders the rest by blockOrder', () => {
    const out = sortBlocks([b(1, 'text', 3), b(2, 'documents', 1), b(3, 'meetings', 2)]);
    expect(out.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate the input', () => {
    const input = [b(1, 'text', 3), b(2, 'hero', 0)];
    const copy = [...input];
    sortBlocks(input);
    expect(input).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(sortBlocks([])).toEqual([]);
  });
});

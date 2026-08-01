/**
 * The editor canvas — render path, states, ordering, and page scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Canvas, sortBlocks } from '@/components/pm/site-editor-v3/canvas/Canvas';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import { UndoableRemoveProvider } from '@/components/pm/site-editor-v3/undoable-remove-context';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';

const blocksState = vi.hoisted(() => ({
  value: { data: [] as unknown[], isPending: false, isError: false, error: null as Error | null },
}));
const refetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({ ...blocksState.value, refetch }),
  // Reached through SectionShell → FloatControls, which wraps every block.
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
  // Same path — FloatControls' undo replays a removed section through the upsert.
  useUpsertContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
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

/** The two pages every scope case uses. HOME is what EditorRoot seeds. */
const HOME_PAGE_ID = 10;
const ABOUT_PAGE_ID = 11;

/**
 * Renders with no `SelectedSitePageProvider`, so `useSelectedSitePage()` is
 * `null` and the canvas shows the whole (single-page) list — the pre-11b-3
 * behaviour every state/ordering case below is about.
 */
function renderCanvas() {
  return render(
    <UndoableRemoveProvider communityId={7}>
      <Canvas communityId={7} context={CONTEXT} now={NOW} />
    </UndoableRemoveProvider>,
  );
}

function renderCanvasOnPage(pageId: number | null) {
  return render(
    <UndoableRemoveProvider communityId={7}>
      <SelectedSitePageProvider pageId={pageId}>
        <Canvas communityId={7} context={CONTEXT} now={NOW} />
      </SelectedSitePageProvider>
    </UndoableRemoveProvider>,
  );
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
    expect(screen.getByText('This page is empty')).toBeInTheDocument();
    // No handler passed: the copy still stands on its own, and no dead button
    // is rendered.
    expect(screen.queryByRole('button', { name: 'Add a section' })).not.toBeInTheDocument();
  });

  it('offers a way to add from the empty canvas', () => {
    const onAddSection = vi.fn();
    render(
      <Canvas communityId={7} context={CONTEXT} now={NOW} onAddSection={onAddSection} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(onAddSection).toHaveBeenCalled();
  });
});

describe('Canvas — rendering blocks', () => {
  it('renders an authored block through the shared view', () => {
    blocksState.value = {
      data: [
        {
          id: 10,
          pageId: HOME_PAGE_ID,
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
          pageId: HOME_PAGE_ID,
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
          pageId: HOME_PAGE_ID,
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
        { id: 20, pageId: HOME_PAGE_ID, blockType: 'tombstone', blockOrder: 0, content: {}, isDraft: true, publishedAt: null },
        { id: 21, pageId: HOME_PAGE_ID, blockType: 'tombstone', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvas();
    expect(screen.getByText('This page is empty')).toBeInTheDocument();
  });

  it('skips a block type it has no view for instead of crashing', () => {
    blocksState.value = {
      data: [
        { id: 13, pageId: HOME_PAGE_ID, blockType: 'tombstone', blockOrder: 0, content: {}, isDraft: true, publishedAt: null },
        {
          id: 14,
          pageId: HOME_PAGE_ID,
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

describe('Canvas — page scope (D-C2)', () => {
  const textBlock = (id: number, pageId: number | null, heading: string) => ({
    id,
    pageId,
    blockType: 'text',
    blockOrder: id,
    content: { heading, body: `Body of ${heading}.` },
    isDraft: true,
    publishedAt: null,
  });

  function twoPages() {
    blocksState.value = {
      data: [
        textBlock(2, HOME_PAGE_ID, 'Home section'),
        textBlock(3, ABOUT_PAGE_ID, 'About section'),
      ],
      isPending: false,
      isError: false,
      error: null,
    };
  }

  it('renders only the selected page and not another page', () => {
    // THE regression. `useContentBlocks` returns EVERY page's blocks in one
    // response, so an unscoped canvas renders the whole site under whichever
    // page is open — and clicking a foreign section hands the inspector a block
    // that any edit writes against the wrong page.
    twoPages();
    renderCanvasOnPage(ABOUT_PAGE_ID);

    expect(screen.getByText('About section')).toBeInTheDocument();
    expect(screen.queryByText('Home section')).not.toBeInTheDocument();
  });

  it('follows the selection back to the home page', () => {
    twoPages();
    renderCanvasOnPage(HOME_PAGE_ID);

    expect(screen.getByText('Home section')).toBeInTheDocument();
    expect(screen.queryByText('About section')).not.toBeInTheDocument();
  });

  it('shows the empty state for a page that has no sections of its own', () => {
    // Without page scoping this rendered the OTHER page's sections and looked
    // like a working page, which is how an edit lands on the wrong one.
    //
    // The COPY is asserted here as well as the state, and that is the point of
    // the string this expects. For two rounds the canvas said "Your site is
    // empty" on a page-scoped surface — so the PM's first act after creating a
    // second page was being told their whole site had gone. `Canvas.tsx`'s own
    // comment claimed the opposite behaviour throughout.
    twoPages();
    renderCanvasOnPage(99);

    expect(screen.getByText('This page is empty')).toBeInTheDocument();
    expect(screen.queryByText(/your site is empty/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Home section')).not.toBeInTheDocument();
    expect(screen.queryByText('About section')).not.toBeInTheDocument();
  });

  it('shows everything when no page is selected, rather than blanking', () => {
    // A provider that has not resolved a page yet supplies null. Filtering to
    // nothing there would blank a single-page community's canvas on every load.
    twoPages();
    renderCanvasOnPage(null);

    expect(screen.getByText('Home section')).toBeInTheDocument();
    expect(screen.getByText('About section')).toBeInTheDocument();
  });

  it('does not fold an unadopted (pageId null) row into the selected page', () => {
    // A pre-11b row no write path has adopted yet. Rendering it on every page
    // would let an edit made while page B is open rewrite it — the same
    // cross-page write this scoping exists to stop.
    blocksState.value = {
      data: [textBlock(2, HOME_PAGE_ID, 'Home section'), textBlock(4, null, 'Orphan section')],
      isPending: false,
      isError: false,
      error: null,
    };
    renderCanvasOnPage(HOME_PAGE_ID);

    expect(screen.getByText('Home section')).toBeInTheDocument();
    expect(screen.queryByText('Orphan section')).not.toBeInTheDocument();
  });

  it('fails loudly on a block with an undefined pageId instead of hiding it', () => {
    // `__tests__` is outside the typecheck program, so a stale fixture would
    // otherwise type-check fine and silently vanish from the canvas — exactly
    // the symptom this slice exists to make impossible (D13′).
    blocksState.value = {
      data: [{ id: 5, blockType: 'text', blockOrder: 5, content: {}, isDraft: true, publishedAt: null }],
      isPending: false,
      isError: false,
      error: null,
    };
    expect(() => renderCanvasOnPage(HOME_PAGE_ID)).toThrow(/undefined pageId/);
  });
});

describe('sortBlocks', () => {
  const b = (id: number, blockType: string, blockOrder: number) =>
    ({ id, pageId: HOME_PAGE_ID, blockType, blockOrder, content: {}, isDraft: false, publishedAt: null }) as never;

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

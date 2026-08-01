/**
 * The in-editor preview dialog — draft content, no editing chrome, Radix a11y.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewDialog } from '@/components/pm/site-editor-v3/PreviewDialog';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';

const blocksState = vi.hoisted(() => ({
  value: { data: [] as unknown[], isPending: false, isError: false, error: null as Error | null },
}));
const refetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({ ...blocksState.value, refetch }),
  // Imported transitively (Canvas → SectionShell → FloatControls) because the
  // dialog reuses `sortBlocks` from Canvas. Never rendered here.
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

const onOpenChange = vi.fn();

function renderDialog(open = true) {
  return render(
    <PreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      communityId={7}
      context={CONTEXT}
      now={NOW}
    />,
  );
}

/** The two pages the scope cases use. */
const HOME_PAGE_ID = 10;
const ABOUT_PAGE_ID = 11;

const block = (
  id: number,
  blockType: string,
  blockOrder: number,
  content: unknown,
  pageId: number | null = HOME_PAGE_ID,
) => ({
  id,
  pageId,
  blockType,
  blockOrder,
  content,
  isDraft: true,
  publishedAt: null,
});

function renderDialogOnPage(pageId: number | null) {
  return render(
    <SelectedSitePageProvider pageId={pageId}>
      <PreviewDialog
        open
        onOpenChange={onOpenChange}
        communityId={7}
        context={CONTEXT}
        now={NOW}
      />
    </SelectedSitePageProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  blocksState.value = { data: [], isPending: false, isError: false, error: null };
});

describe('PreviewDialog — open state', () => {
  it('renders nothing while closed', () => {
    blocksState.value = {
      data: [block(10, 'text', 0, { heading: 'About us', body: 'A community.' })],
      isPending: false,
      isError: false,
      error: null,
    };
    const { container } = renderDialog(false);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('About us')).not.toBeInTheDocument();
  });

  it('falls back to the community name when the page is not known', () => {
    // The pages read can genuinely fail. A community-named preview is a worse
    // title than a page-named one and a far better one than an empty heading.
    renderDialog();
    expect(
      screen.getByRole('dialog', { name: /Preview — Sunset Condos/ }),
    ).toBeInTheDocument();
  });

  it('names the PAGE it is previewing, not the community', () => {
    // The dialog renders exactly one page (D-C2). Titling it after the
    // community reads as "this is your site" over a single page's sections —
    // the misreading the scoping exists to prevent, restated in the heading.
    //
    // Revert check (production line): `PreviewDialog.tsx`'s
    // `${pageName ?? context.community.name}`. Reverting only that expression
    // to `context.community.name` turns this red and leaves the fallback case
    // above green.
    render(
      <SelectedSitePageProvider pageId={HOME_PAGE_ID}>
        <PreviewDialog
          open
          onOpenChange={onOpenChange}
          communityId={7}
          context={CONTEXT}
          pageName="Amenities"
          now={NOW}
        />
      </SelectedSitePageProvider>,
    );

    expect(screen.getByRole('dialog', { name: /Preview — Amenities/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: /Preview — Sunset Condos/ }),
    ).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('PreviewDialog — draft content', () => {
  it('renders the draft sections through the shared views', () => {
    blocksState.value = {
      data: [
        block(10, 'text', 1, { heading: 'About us', body: 'A community.' }),
        block(11, 'announcements', 0, { limit: 5, timeWindowDays: 30 }),
      ],
      isPending: false,
      isError: false,
      error: null,
    };
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('About us')).toBeInTheDocument();
    expect(within(dialog).getByText('A community.')).toBeInTheDocument();
    // System-of-record rows are narrowed by the block config, same as the canvas.
    expect(within(dialog).getByText('Recent notice')).toBeInTheDocument();
    expect(within(dialog).queryByText('Ancient notice')).not.toBeInTheDocument();
  });

  it('carries no editing chrome', () => {
    blocksState.value = {
      data: [block(10, 'text', 0, { heading: 'About us', body: 'A community.' })],
      isPending: false,
      isError: false,
      error: null,
    };
    const { container } = renderDialog();
    // No SectionShell wrappers…
    expect(container.querySelector('[data-block-id]')).toBeNull();
    expect(screen.queryByRole('group', { name: /section$/ })).not.toBeInTheDocument();
    // …and therefore no FloatControls.
    expect(screen.queryByRole('button', { name: /Move .* section (up|down)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove .* section/ })).not.toBeInTheDocument();
    // The only control in the preview is the dialog's own close affordance
    // (plus the resize separators, which are not buttons).
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('tells the PM when there is nothing to preview', () => {
    renderDialog();
    expect(screen.getByText("There's nothing to preview yet")).toBeInTheDocument();
  });

  it('treats a site of only tombstones as empty rather than blank', () => {
    blocksState.value = {
      data: [block(20, 'tombstone', 0, {}), block(21, 'tombstone', 1, {})],
      isPending: false,
      isError: false,
      error: null,
    };
    renderDialog();
    expect(screen.getByText("There's nothing to preview yet")).toBeInTheDocument();
  });
});

describe('PreviewDialog — page scope (D-C2)', () => {
  function twoPages() {
    blocksState.value = {
      data: [
        block(2, 'text', 2, { heading: 'Home section', body: 'Home body.' }, HOME_PAGE_ID),
        block(3, 'text', 3, { heading: 'About section', body: 'About body.' }, ABOUT_PAGE_ID),
      ],
      isPending: false,
      isError: false,
      error: null,
    };
  }

  it('previews only the page being edited', () => {
    // A preview that concatenated every page into one scroll would not
    // correspond to any URL a visitor can open — a lie the PM would then
    // publish against.
    twoPages();
    renderDialogOnPage(ABOUT_PAGE_ID);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('About section')).toBeInTheDocument();
    expect(within(dialog).queryByText('Home section')).not.toBeInTheDocument();
  });

  it('follows the selection back to the home page', () => {
    twoPages();
    renderDialogOnPage(HOME_PAGE_ID);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Home section')).toBeInTheDocument();
    expect(within(dialog).queryByText('About section')).not.toBeInTheDocument();
  });

  it('says there is nothing to preview on a page with no sections', () => {
    twoPages();
    renderDialogOnPage(99);
    expect(screen.getByText("There's nothing to preview yet")).toBeInTheDocument();
  });

  it('previews everything when no page is selected', () => {
    twoPages();
    renderDialogOnPage(null);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Home section')).toBeInTheDocument();
    expect(within(dialog).getByText('About section')).toBeInTheDocument();
  });
});

describe('PreviewDialog — load states', () => {
  it('shows a busy skeleton while blocks load', () => {
    blocksState.value = { data: [], isPending: true, isError: false, error: null };
    const { baseElement } = renderDialog();
    expect(baseElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Loading your preview')).toBeInTheDocument();
  });

  it('shows a recoverable error with a retry', () => {
    blocksState.value = {
      data: [],
      isPending: false,
      isError: true,
      error: new Error('network down'),
    };
    renderDialog();
    expect(screen.getByText("We couldn't load your preview")).toBeInTheDocument();
    expect(screen.getByText('network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

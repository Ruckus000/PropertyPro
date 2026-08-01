/**
 * The review-and-publish sheet (Phase 5).
 *
 * The assertions here are mostly about the decisions the sheet encodes rather
 * than the markup it emits: that publishing is atomic (no tick boxes, ever),
 * that a blocking issue names the section it is about instead of saying "fix
 * errors", that a publish with nothing to publish is impossible rather than a
 * silent no-op request, that a 409 reads as "someone else published" and not as
 * a generic failure, and that a failure leaves a receipt behind that a
 * re-render cannot sweep away.
 *
 * `@/hooks/use-content-blocks` and `@/hooks/use-site-pages` are mocked
 * COMPLETELY — a partial factory fails only at module load for whichever
 * component happens to reach the missing export, and reads as an unrelated
 * component breaking.
 *
 * Phase 11b-3 note on the group ids below: every block now carries a `pageId`,
 * so a section change is filed under its PAGE (`change-group-1`), not under the
 * site-wide bucket. `change-group-site` is now reached only by a change that
 * genuinely belongs to no single page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOMBSTONE_BLOCK_TYPE, type Change } from '@propertypro/shared';
import {
  PublishSheet,
  groupChanges,
} from '@/components/pm/site-editor-v3/publish/PublishSheet';
import { PublishConflictError, type PublishSiteResult } from '@/hooks/use-publish-site';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import type { SitePageSummary } from '@/hooks/use-site-pages';

// ── block fixtures ─────────────────────────────────────────────────────────

const HOME_PAGE_ID = 1;
const CONTACT_PAGE_ID = 2;

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 1,
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: 2,
    content: { heading: 'Pool rules', body: 'No glass by the pool, please.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const heroBlock = (overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary =>
  block({
    id: 100,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Sunset Condos', subtitle: 'Miami Beach' },
    ...overrides,
  });

// ── page fixtures ──────────────────────────────────────────────────────────

function sitePage(overrides: Partial<SitePageSummary> = {}): SitePageSummary {
  return {
    id: HOME_PAGE_ID,
    name: 'Home',
    slug: '',
    inNav: true,
    sortOrder: 0,
    isHome: true,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    ...overrides,
  };
}

const HOME_PAGE = sitePage();
const CONTACT_PAGE = sitePage({
  id: CONTACT_PAGE_ID,
  name: 'Contact',
  slug: 'contact',
  sortOrder: 1,
  isHome: false,
});

const PUBLISHED: SiteBlockSummary[] = [heroBlock(), block({ id: 1, blockOrder: 2 })];

/** One edited text section — the ordinary case. */
const DRAFT_ONE_EDIT: SiteBlockSummary[] = [
  heroBlock(),
  block({
    id: 2,
    blockOrder: 2,
    isDraft: true,
    publishedAt: null,
    content: { heading: 'Pool rules', body: 'No glass by the pool, and no diving.' },
  }),
];

// ── hook mocks ─────────────────────────────────────────────────────────────

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  pages: [] as SitePageSummary[],
  token: null as string | null,
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

const refetch = vi.hoisted(() => vi.fn());

function draftQuery() {
  return {
    data: queries.isPending || queries.isError ? undefined : queries.draft,
    isPending: queries.isPending,
    isError: queries.isError,
    error: queries.error,
    refetch,
  };
}

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => draftQuery(),
  usePublishedBlocks: () => ({
    ...draftQuery(),
    data: queries.isPending || queries.isError ? undefined : queries.published,
  }),
  useSitePublishToken: () => ({
    ...draftQuery(),
    data: queries.isPending || queries.isError ? undefined : queries.token,
  }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const unstageAsync = vi.hoisted(() => vi.fn());
const unstageState = vi.hoisted(() => ({ isPending: false }));

vi.mock('@/hooks/use-site-pages', () => ({
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId],
  applyPageOrder: (pages: unknown) => pages,
  useSitePages: () => ({
    ...draftQuery(),
    data: queries.isPending || queries.isError ? undefined : queries.pages,
  }),
  useCreateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderSitePages: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUnstageSitePageDelete: () => ({
    mutate: vi.fn(),
    mutateAsync: unstageAsync,
    isPending: unstageState.isPending,
  }),
}));

const mutateAsync = vi.hoisted(() => vi.fn());
const publishState = vi.hoisted(() => ({ isPending: false }));

// The real PublishConflictError class is kept: the sheet branches on
// `instanceof`, so a stubbed sentinel would let a broken branch pass.
vi.mock('@/hooks/use-publish-site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-publish-site')>();
  return {
    ...actual,
    usePublishSite: () => ({ mutateAsync, isPending: publishState.isPending }),
  };
});

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
// `dismiss` is here because `useUndoableRemove` takes the undo toast down
// when its section unmounts. A factory missing a newly-added export yields
// `undefined` at call time, which reads as an unrelated component breaking.
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, dismiss: vi.fn() },
}));

// ── harness ────────────────────────────────────────────────────────────────

const PUBLISHED_OK: PublishSiteResult = {
  published: true,
  publishedAt: '2026-07-26T10:00:00.000Z',
  promotedCount: 1,
  retiredCount: 0,
};

interface RenderOptions {
  onOpenChange?: (open: boolean) => void;
  onFixIssue?: (slot: number) => void;
  open?: boolean;
}

function renderSheet({ onOpenChange = vi.fn(), onFixIssue, open = true }: RenderOptions = {}) {
  const element = (
    <PublishSheet
      open={open}
      onOpenChange={onOpenChange}
      communityId={7}
      {...(onFixIssue ? { onFixIssue } : {})}
    />
  );
  const view = render(element);
  return { ...view, element, onOpenChange, onFixIssue };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = DRAFT_ONE_EDIT;
  queries.published = PUBLISHED;
  queries.pages = [HOME_PAGE];
  queries.token = '2026-07-01T00:00:00.000Z';
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
  publishState.isPending = false;
  unstageState.isPending = false;
  unstageAsync.mockResolvedValue(undefined);
  mutateAsync.mockResolvedValue(PUBLISHED_OK);
});

// ── the change list ────────────────────────────────────────────────────────

describe('PublishSheet — the change list', () => {
  it('lists the pending changes when open', async () => {
    renderSheet();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const group = screen.getByTestId(`change-group-${HOME_PAGE_ID}`);
    expect(within(group).getByText('Text section')).toBeInTheDocument();
    expect(within(group).getByText('Edited')).toBeInTheDocument();
    // Named after the page, not its id.
    expect(within(group).getByText('Home')).toBeInTheDocument();
  });

  it('renders nothing at all while closed, so the blocks query never fires for it', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups changes by group with the site-wide group first', () => {
    const change = (group: string, title: string): Change => ({
      key: 'order',
      kind: 'reordered',
      group,
      title,
      blockType: null,
      fromSlot: null,
      toSlot: null,
    });
    const grouped = groupChanges([
      change('amenities', 'A'),
      change('site', 'B'),
      change('zzz', 'C'),
      change('site', 'D'),
    ]);
    expect(grouped.map((g) => g.group)).toEqual(['site', 'amenities', 'zzz']);
    // Insertion order within a group is preserved.
    expect(grouped[0]!.changes.map((c) => c.title)).toEqual(['B', 'D']);
  });

  it('orders page groups by nav position, not by the id read as a string', () => {
    // '10'.localeCompare('2') is negative, so without the rank map page 10
    // would render before page 2 on any site with ten pages — a plausible-
    // looking list in the wrong order.
    const change = (group: string): Change => ({
      key: 'order',
      kind: 'reordered',
      group,
      title: group,
      blockType: null,
      fromSlot: null,
      toSlot: null,
    });
    const rank = new Map([
      ['2', 1],
      ['10', 9],
    ]);
    const grouped = groupChanges([change('10'), change('site'), change('2')], rank);
    expect(grouped.map((g) => g.group)).toEqual(['site', '2', '10']);
  });

  it('sorts a group the pages query has not resolved after the ranked ones', () => {
    const change = (group: string): Change => ({
      key: 'order',
      kind: 'reordered',
      group,
      title: group,
      blockType: null,
      fromSlot: null,
      toSlot: null,
    });
    // '100', not '99'. The unranked id has to sort BEFORE the ranked one under
    // the plain string fallback, or the case passes without the ranked-wins
    // legs ever running: `'2'.localeCompare('99')` is already negative, so '2'
    // came first either way.  `'2'.localeCompare('100')` is positive, so only
    // the rank logic can put '2' first.
    const grouped = groupChanges([change('100'), change('2')], new Map([['2', 1]]));
    expect(grouped.map((g) => g.group)).toEqual(['2', '100']);
  });

  it('says so when the site has never been published', () => {
    queries.published = [];
    renderSheet();
    expect(screen.getByText(/first publish/i)).toBeInTheDocument();
  });

  it('shows a staged deletion as a removed section', () => {
    queries.draft = [
      heroBlock(),
      block({ id: 9, blockOrder: 2, blockType: TOMBSTONE_BLOCK_TYPE, content: {}, isDraft: true }),
    ];
    renderSheet();
    const group = screen.getByTestId(`change-group-${HOME_PAGE_ID}`);
    expect(within(group).getByText('Removed')).toBeInTheDocument();
    // A SECTION removal is not a page removal — no undo affordance here.
    expect(screen.queryByRole('button', { name: /keep the/i })).not.toBeInTheDocument();
  });

  it('files a section change under the page it belongs to', () => {
    queries.pages = [HOME_PAGE, CONTACT_PAGE];
    queries.draft = [
      ...PUBLISHED,
      block({
        id: 7,
        pageId: CONTACT_PAGE_ID,
        blockOrder: 3,
        isDraft: true,
        publishedAt: null,
        content: { heading: 'Reach us', body: 'Front desk, 9-5.' },
      }),
    ];
    renderSheet();

    const group = screen.getByTestId(`change-group-${CONTACT_PAGE_ID}`);
    expect(within(group).getByText('Contact')).toBeInTheDocument();
    expect(within(group).getByText('Added')).toBeInTheDocument();
  });

  it('handles loading and error states', async () => {
    queries.isPending = true;
    const pending = renderSheet();
    expect(await screen.findByText('Loading your changes')).toBeInTheDocument();
    pending.unmount();

    queries.isPending = false;
    queries.isError = true;
    queries.error = new Error('Network down');
    renderSheet();
    expect(await screen.findByText(/couldn't work out what's changed/i)).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });
});

// ── page-level changes (Phase 11b-3) ───────────────────────────────────────

describe('PublishSheet — page changes', () => {
  /** Contact is live and staged for removal on the next publish. */
  function stageContactRemoval() {
    queries.pages = [
      HOME_PAGE,
      { ...CONTACT_PAGE, deleteStagedAt: '2026-07-30T09:00:00.000Z' },
    ];
  }

  it('lists a page the publish will create, with the address it will occupy', () => {
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, isDraft: true, publishedAt: null }];
    renderSheet();

    const group = screen.getByTestId(`change-group-${CONTACT_PAGE_ID}`);
    expect(within(group).getByText('Added')).toBeInTheDocument();
    expect(within(group).getByText('Contact page')).toBeInTheDocument();
    // The address is the one thing that says which URL starts working.
    expect(within(group).getByText('/contact')).toBeInTheDocument();
  });

  it('lists a staged page removal and offers to call it off', async () => {
    const user = userEvent.setup();
    stageContactRemoval();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    const group = screen.getByTestId(`change-group-${CONTACT_PAGE_ID}`);
    expect(within(group).getByText('Removed')).toBeInTheDocument();
    expect(within(group).getByText('Contact page')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep the contact page/i }));

    expect(unstageAsync).toHaveBeenCalledWith({ pageId: CONTACT_PAGE_ID });
    // Cancelling one removal must not cost the PM the whole review.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalledWith('Contact page will stay on your site.');
  });

  it('says so, and leaves the removal staged, when the undo fails', async () => {
    const user = userEvent.setup();
    stageContactRemoval();
    unstageAsync.mockRejectedValue(new Error('Upstream timed out'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: /keep the contact page/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("We couldn't cancel that removal"),
    );
    // The row still says the page is going, because it still is.
    const group = screen.getByTestId(`change-group-${CONTACT_PAGE_ID}`);
    expect(within(group).getByText('Removed')).toBeInTheDocument();
  });

  it('disables the undo while the request is in flight', () => {
    stageContactRemoval();
    unstageState.isPending = true;
    renderSheet();
    expect(screen.getByRole('button', { name: /keep the contact page/i })).toBeDisabled();
  });

  it('counts a staged page removal as something to publish', () => {
    // Blocks are untouched, so without diffPages the sheet would say "nothing
    // to publish" while a publish was about to take a live page off the site.
    queries.draft = PUBLISHED;
    stageContactRemoval();
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeEnabled();
    expect(screen.getByText(/1 change ready to publish/i)).toBeInTheDocument();
  });
});

// ── the atomic decision, encoded ───────────────────────────────────────────

describe('PublishSheet — publishing is atomic', () => {
  it('offers no tick boxes, no per-change selection and no select-all', () => {
    renderSheet();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/select all/i)).not.toBeInTheDocument();
  });

  it('says the changes go live together', () => {
    renderSheet();
    expect(screen.getByText(/all-or-nothing/i)).toBeInTheDocument();
  });
});

// ── blocking issues ────────────────────────────────────────────────────────

/** A section whose type this build cannot render — a genuine blocking error. */
const DRAFT_WITH_BLOCKER: SiteBlockSummary[] = [
  heroBlock(),
  block({ id: 3, blockOrder: 3, blockType: 'not_a_real_block', content: {}, isDraft: true }),
];

describe('PublishSheet — blocking issues', () => {
  it('disables Publish and names the offending section', async () => {
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeDisabled();

    const alert = screen.getByRole('alert');
    // Named, not "fix errors": the slot and the offending type are both stated.
    expect(within(alert).getByText('Section 3 (not_a_real_block)')).toBeInTheDocument();
    expect(within(alert).getByText(/not a section type this site can show/i)).toBeInTheDocument();
    expect(screen.getByTestId('publish-hint')).toHaveTextContent(
      /fix the problems above before publishing/i,
    );
  });

  it('never fires a publish request while blocked', async () => {
    const user = userEvent.setup();
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();
    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('"Fix this" closes the sheet and hands the slot back to the editor', async () => {
    const user = userEvent.setup();
    queries.draft = DRAFT_WITH_BLOCKER;
    const onOpenChange = vi.fn();
    const onFixIssue = vi.fn();
    renderSheet({ onOpenChange, onFixIssue });

    await user.click(screen.getByRole('button', { name: /fix this/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onFixIssue).toHaveBeenCalledWith(3);
  });

  it('omits "Fix this" when the editor gave it nowhere to go', () => {
    queries.draft = DRAFT_WITH_BLOCKER;
    renderSheet();
    expect(screen.queryByRole('button', { name: /fix this/i })).not.toBeInTheDocument();
  });
});

// ── nothing to publish ─────────────────────────────────────────────────────

describe('PublishSheet — nothing to publish', () => {
  beforeEach(() => {
    queries.draft = PUBLISHED;
    queries.published = PUBLISHED;
  });

  it('makes publishing impossible rather than a silent no-op request', async () => {
    const user = userEvent.setup();
    renderSheet();

    const publishButton = screen.getByRole('button', { name: /publish changes/i });
    expect(publishButton).toBeDisabled();
    expect(screen.getByTestId('publish-hint')).toHaveTextContent(/nothing to publish yet/i);
    expect(screen.getByText(/matches what's already live/i)).toBeInTheDocument();

    await user.click(publishButton);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

// ── publishing ─────────────────────────────────────────────────────────────

describe('PublishSheet — publishing', () => {
  it('publishes with the authoritative token, toasts, and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      expectedPublishedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(toastSuccess).toHaveBeenCalledWith('Published — 1 section live.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('publish-receipt')).not.toBeInTheDocument();
  });

  it('sends a null token for a first-ever publish rather than inventing one', async () => {
    const user = userEvent.setup();
    queries.published = [];
    queries.token = null;
    renderSheet();
    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ expectedPublishedAt: null });
  });
});

// ── failure receipts ───────────────────────────────────────────────────────

describe('PublishSheet — failure', () => {
  it('reads a 409 as "someone else published", not as a generic failure', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new PublishConflictError('Site changed since load'));
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/someone else published while you were working/i)).toBeInTheDocument();
    expect(within(receipt).getByText(/reload the editor/i)).toBeInTheDocument();
    // Failure must not close the sheet out from under the message.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('renders a persistent receipt that survives a re-render', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Upstream timed out'));
    const { element, rerender } = renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText('Upstream timed out')).toBeInTheDocument();
    expect(within(receipt).getByText(/live site is unchanged/i)).toBeInTheDocument();

    rerender(element);
    expect(screen.getByTestId('publish-receipt')).toBeInTheDocument();
    expect(screen.getByText('Upstream timed out')).toBeInTheDocument();
  });

  it('keeps the receipt until it is dismissed', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Upstream timed out'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));
    await screen.findByTestId('publish-receipt');

    await user.click(screen.getByRole('button', { name: /dismiss this receipt/i }));
    expect(screen.queryByTestId('publish-receipt')).not.toBeInTheDocument();
  });

  it('leaves a receipt when the server says there was nothing to publish after all', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ published: false, reason: 'nothing-to-publish' });
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/nothing left to publish/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

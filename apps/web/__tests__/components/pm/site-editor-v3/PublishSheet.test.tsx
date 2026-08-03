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
  stagedPageRemoval,
} from '@/components/pm/site-editor-v3/publish/PublishSheet';
import { ApiRequestError } from '@/lib/api/request-json';
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
// `dismiss` is here because `useUndoableRemove` takes the undo toast down when
// its section unmounts, and `info` because the selection repair speaks through
// it. Every method the site-editor tree can reach is stubbed, not only the ones
// asserted here — corpus trap #3: a factory missing an export yields
// `undefined` at call time, which reads as an unrelated component breaking.
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, dismiss: vi.fn(), info: vi.fn() },
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
  onGoToPages?: () => void;
  open?: boolean;
}

function renderSheet({
  onOpenChange = vi.fn(),
  onFixIssue,
  // Defaulted, not optional-in-practice: `onGoToPages` is a REQUIRED prop, and
  // `BlockingIssues` no longer guards the button on its presence — so a harness
  // that omitted it rendered a live "Go to Pages" wired to `undefined` in every
  // page-issue case. Nothing clicked it, so it was latent rather than red, which
  // is exactly the shape that survives review. `__tests__` is outside the
  // `src/**` program, so the type system cannot catch it here.
  onGoToPages = vi.fn(),
  open = true,
}: RenderOptions = {}) {
  const element = (
    <PublishSheet
      open={open}
      onOpenChange={onOpenChange}
      communityId={7}
      onGoToPages={onGoToPages}
      {...(onFixIssue ? { onFixIssue } : {})}
    />
  );
  const view = render(element);
  return { ...view, element, onOpenChange, onFixIssue, onGoToPages };
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

  it('heads the site-wide group with a label, not with the raw group id', () => {
    /*
     * `GROUP_LABEL[SITE_GROUP]` ("Across the site") was asserted nowhere. The
     * heading falls back `GROUP_LABEL[group] ?? pageLabels.get(group) ?? group`,
     * so losing the entry does not throw or blank the heading — it silently
     * renders the literal string `site` above a group of changes, which reads
     * as a bug in the data rather than a missing label.
     *
     * Driven through the real sheet with a block on no page, which is the one
     * way to reach that group: a pre-11b row no write path has adopted yet.
     */
    queries.published = [heroBlock()];
    queries.draft = [
      heroBlock(),
      block({ id: 9, pageId: null, blockOrder: 4, isDraft: true, publishedAt: null }),
    ];
    renderSheet();

    const group = screen.getByTestId('change-group-site');
    expect(within(group).getByText('Across the site')).toBeInTheDocument();
    expect(within(group).queryByText('site')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /keep this page: contact page/i }));

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

    await user.click(screen.getByRole('button', { name: /keep this page: contact page/i }));

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
    expect(screen.getByRole('button', { name: /keep this page: contact page/i })).toBeDisabled();
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
    // No page suffix here — the default fixture is a single-page site, so
    // naming the only page there is would be noise. The multi-page case is
    // asserted below.
    expect(within(alert).getByText('Section 3 (not_a_real_block)')).toBeInTheDocument();
    expect(within(alert).getByText(/not a section type this site can show/i)).toBeInTheDocument();
    expect(screen.getByTestId('publish-hint')).toHaveTextContent(
      /fix the problems above before publishing/i,
    );
  });

  it('names the PAGE an offending section is on, once there is more than one', async () => {
    /*
     * `Section 12 (faq)` is a `block_order`, and a block_order appears on no
     * other surface in this editor — not on a `SectionList` row, not on the
     * canvas. On a single-page site that does not matter; the moment there are
     * two, a blocked publish was naming an offender the PM could not locate
     * without pressing "Fix this" and being carried out of the list they were
     * triaging.
     *
     * Cross-page issues are the norm here, not an edge case: the publish diff
     * is whole-site by design (D-C2) while the editor context is page-scoped,
     * which is the entire reason `handleSelectSlot` exists.
     *
     * The sibling branch of `describeTarget` has named its page since round 6;
     * this is the section half of the same function, which was left in machine
     * syntax.
     *
     * Revert check (production line): the `pageLabel`/`suffix` pair in
     * `describeTarget`'s `target` branch in `PublishSheet.tsx`.
     */
    queries.pages = [HOME_PAGE, CONTACT_PAGE];
    queries.draft = [
      heroBlock(),
      // The blocker lives on CONTACT, not on home.
      block({
        id: 9,
        pageId: CONTACT_PAGE_ID,
        blockOrder: 7,
        blockType: 'not_a_real_block',
        content: {},
        isDraft: true,
      }),
    ];
    renderSheet();

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByText('Section 7 (not_a_real_block) — Contact'),
    ).toBeInTheDocument();
  });

  it('does not block a publish over a section on a page being DELETED by it', async () => {
    /*
     * The client gate must be a strict SUBSET of the server's, and it was not.
     *
     * `SiteDiffState.pageIssues` states the contract in as many words: it "can
     * miss a refusal, never invent one, which is the only safe direction for a
     * gate that disables a button." `pageIssues` honoured it. `siteIssues` —
     * which is what actually owns the disabled state — ran over the whole-site
     * snapshot, including the sections of pages the publish is about to delete.
     *
     * The server does the opposite, and says why:
     *
     *     // A page being removed by this publish is about to stop existing;
     *     // holding the publish on its content would block the removal of a
     *     // broken page.
     *     if (page.deleteStagedAt !== null) continue;
     *
     * So a page holding an invalid section could not be got rid of. Staging it
     * for removal — the only remedy the product offers for a broken page — left
     * the PM with a disabled Publish naming a section on the page they had
     * already told the editor to delete, and a "Fix this" carrying them onto a
     * page whose own banner says it is being removed.
     *
     * Revert check (production line): `siteIssues(validated)` in
     * `PublishSheet.tsx`, restored to `siteIssues(next)`.
     */
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, deleteStagedAt: '2026-07-30T09:00:00.000Z' }];
    queries.draft = [
      heroBlock(),
      // Unrenderable, on the page that is going away.
      block({
        id: 9,
        pageId: CONTACT_PAGE_ID,
        blockOrder: 7,
        blockType: 'not_a_real_block',
        content: {},
        isDraft: true,
      }),
    ];
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeEnabled();
    expect(screen.queryByText(/stopping this publish/i)).not.toBeInTheDocument();
  });

  it('still blocks over the SAME section when its page is not being deleted', async () => {
    /*
     * The positive control, and it is what stops the fix from becoming "never
     * validate anything". Identical fixture, minus the staging: the gate must
     * still refuse.
     */
    queries.pages = [HOME_PAGE, CONTACT_PAGE];
    queries.draft = [
      heroBlock(),
      block({
        id: 9,
        pageId: CONTACT_PAGE_ID,
        blockOrder: 7,
        blockType: 'not_a_real_block',
        content: {},
        isDraft: true,
      }),
    ];
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeDisabled();
    expect(screen.getByText(/stopping this publish/i)).toBeInTheDocument();
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

// ── the undo discriminator ─────────────────────────────────────────────────

describe('stagedPageRemoval — what earns an undo, and what does not', () => {
  /*
   * The undo keys on `change.page.deleteStaged`, NOT on `kind === 'removed'`,
   * and the reason is written down: `diffPages` also emits `removed` for a
   * published page that vanished from the list entirely, where there is
   * nothing staged to unstage and the undo would be an affordance for a
   * request the server rejects.
   *
   * That reason had no test. The only assertion near it — "no undo button on
   * this row" — was satisfied by `Number(undefined) → NaN` failing the
   * safe-integer check three lines further down, a different mechanism
   * reaching the same answer. So deleting the `deleteStaged` line changed
   * nothing observable.
   *
   * Asserted on the function rather than through a render because the shape it
   * guards CANNOT be produced through the sheet's queries: `useSiteDiff` builds
   * both sides of `diffPages` from one page list, so no page can be in the
   * baseline and absent from `next`. A render-driven version of this test would
   * be asserting the fixture. The staged case's rendered proof is the sibling
   * describe above.
   *
   * Revert check (production line): `PublishSheet.tsx`'s
   * `if (change.page?.deleteStaged !== true) return null;`. Removing only that
   * line turns the first case here red, and the other two stay green — which is
   * what shows the check is doing its own work and not NaN's.
   */
  function pageChange(page: Partial<Change['page']> & { deleteStaged?: boolean }): Change {
    return {
      key: `page:${CONTACT_PAGE_ID}`,
      kind: 'removed',
      title: 'Contact page',
      group: String(CONTACT_PAGE_ID),
      blockType: null,
      fromSlot: null,
      toSlot: null,
      page: {
        pageId: String(CONTACT_PAGE_ID),
        name: 'Contact',
        slug: 'contact',
        isHome: false,
        inNav: true,
        deleteStaged: false,
        ...page,
      },
    } as Change;
  }

  it('refuses a removal that is not STAGED, even though its kind says removed', () => {
    // The published page that simply left the list. `pageId` is a perfectly
    // good number here, so the safe-integer check cannot be what rejects it.
    expect(stagedPageRemoval(pageChange({ deleteStaged: false }))).toBeNull();
  });

  it('accepts a staged removal and hands back the page id to unstage', () => {
    expect(stagedPageRemoval(pageChange({ deleteStaged: true }))).toBe(CONTACT_PAGE_ID);
  });

  it('refuses a change that is not a removal at all', () => {
    expect(
      stagedPageRemoval({ ...pageChange({ deleteStaged: true }), kind: 'added' } as Change),
    ).toBeNull();
  });
});

// ── page-set problems, stated before the button ────────────────────────────

describe('PublishSheet — the PAGE SET can block a publish too', () => {
  /*
   * The sheet computed `blocking` from `siteIssues` plus contrast and never ran
   * `pageIssues` at all — while the server runs it inside the publish
   * transaction and refuses on no home, two homes, a duplicate name or slug, or
   * a reserved slug. So a PM in any of those states got an ENABLED Publish
   * button, clicked it, and met an opaque "This site cannot be published yet."
   * with the reasons stripped off on the way through `requestJson`.
   *
   * Revert check (production line): the `pageSetIssues` term in
   * `PublishSheet.tsx`'s `issues` memo (`[...structural, ...pageSetIssues,
   * ...contrast]`). Removing only that term turns the two blocking cases here
   * red. Removing the `pageIssues` call in `use-site-diff.ts` instead turns the
   * same two red — the two lines are the two halves of one seam, and both are
   * production.
   */
  it('refuses a publish when two pages claim the same address, and says which', () => {
    queries.pages = [
      HOME_PAGE,
      CONTACT_PAGE,
      sitePage({ id: 3, name: 'Reach us', slug: 'contact', sortOrder: 2, isHome: false }),
    ];
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeDisabled();
    expect(screen.getByText(/Another page already uses "\/contact"/)).toBeInTheDocument();
  });

  it('names the offending PAGE, not its field path', () => {
    /*
     * Round 6. Running `pageIssues` client-side made the block visible before
     * the button — and then labelled it `page:3.slug`, because `describeTarget`
     * only understood `hero` / `sections.<n>` and fell through to the raw
     * field. Naming the offender in machine syntax is the dead end the whole
     * change set out to remove, just moved one screen earlier.
     *
     * Revert check (production line): the `page:` branch in
     * `PublishSheet.tsx`'s `describeTarget`. Removing it renders `page:3.slug`
     * and turns this red.
     */
    queries.pages = [
      HOME_PAGE,
      CONTACT_PAGE,
      sitePage({ id: 3, name: 'Reach us', slug: 'contact', sortOrder: 2, isHome: false }),
    ];
    renderSheet();

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Reach us page')).toBeInTheDocument();
    expect(within(alert).queryByText(/^page:3\./)).not.toBeInTheDocument();
  });

  it('offers a way out of a page problem, which "Fix this" cannot reach', async () => {
    /*
     * A page-set issue has no section slot, so `issueTarget` returns null and
     * the "Fix this" button is not rendered — which left these as the only
     * blocking issues in the sheet with NO action at all, under a footer
     * reading "Fix the problems above before publishing".
     *
     * Revert check (production line, verified): the `isPageIssue` branch in
     * `BlockingIssues` — the `Go to Pages` `<Button>`. Replacing the condition
     * with `false` turns this red and nothing else: 1 failed / 42 passed.
     *
     * The comment used to name `isPageIssue && onGoToPages`. That conjunct was
     * DELETED in the same commit that wrote this line, when `onGoToPages` became
     * required — so the named target could not be performed as written, which is
     * the exact failure mode five rounds of review have been chasing. Note too
     * that dropping only the `isPageIssue` guard (the transformation the old
     * wording literally described, minus the deleted half) leaves this GREEN,
     * because the button then renders for every issue.
     */
    const user = userEvent.setup();
    queries.pages = [CONTACT_PAGE]; // no home page
    const onOpenChange = vi.fn();
    const onGoToPages = vi.fn();
    render(
      <PublishSheet
        open
        onOpenChange={onOpenChange}
        communityId={7}
        onGoToPages={onGoToPages}
      />,
    );

    await user.click(screen.getByRole('button', { name: /go to pages/i }));

    // Closes first, then hands over — a sheet left open over the panel the PM
    // was just sent to is a second thing to dismiss.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onGoToPages).toHaveBeenCalled();
  });

  it('refuses a publish when the site has no home page at all', () => {
    queries.pages = [CONTACT_PAGE];
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeDisabled();
    expect(screen.getByText(/no home page/i)).toBeInTheDocument();
  });

  it('leaves a well-formed page set alone, so the gate is not a blanket block', () => {
    // The control. Without it, "Publish is disabled" above could equally be
    // explained by the gate refusing everything.
    queries.pages = [HOME_PAGE, CONTACT_PAGE];
    renderSheet();

    expect(screen.getByRole('button', { name: /publish changes/i })).toBeEnabled();
  });

  it('warns — without blocking — about a new page that has no sections', () => {
    /*
     * A page with nothing on it is a legitimate thing to publish (the nav entry
     * may be going up first), so this is a warning and Publish stays enabled.
     * But nothing said anything at all, and the result is a nav link to a page
     * that renders chrome with a gap where the content should be — which reads
     * to a resident as a broken site rather than an unfinished one.
     *
     * Revert check (production line): the `emptyPageWarnings` term in
     * `use-site-diff.ts`'s `allPageIssues`.
     */
    queries.pages = [
      HOME_PAGE,
      sitePage({
        id: 9,
        name: 'Pool Rules',
        slug: 'pool-rules',
        sortOrder: 2,
        isHome: false,
        isDraft: true,
        publishedAt: null,
      }),
    ];
    renderSheet();

    expect(screen.getByText(/"Pool Rules" has no sections yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish changes/i })).toBeEnabled();
  });

  it('says nothing about a new page that DOES have a section', () => {
    // Varying only the dimension under test: same draft page, one block on it.
    queries.pages = [
      HOME_PAGE,
      sitePage({
        id: 9,
        name: 'Pool Rules',
        slug: 'pool-rules',
        sortOrder: 2,
        isHome: false,
        isDraft: true,
        publishedAt: null,
      }),
    ];
    queries.draft = [
      ...DRAFT_ONE_EDIT,
      block({ id: 55, pageId: 9, blockOrder: 6, isDraft: true, publishedAt: null }),
    ];
    renderSheet();

    expect(screen.queryByText(/has no sections yet/)).not.toBeInTheDocument();
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

  it('does NOT report a page-only publish as "0 sections live"', async () => {
    /*
     * The most irreversible operation this phase ships reported nothing.
     *
     * A staged page removal deletes the page, every section on it and its whole
     * slug history — and `retiredCount` counts none of that, because the block
     * soft-delete happens in its own loop rather than in the retire update.
     * `promotedCount` is zero too, since a removal-only publish promotes no
     * drafts. So the success toast read "Published — 0 sections live." for a
     * publish that took a live page off the site, and the sheet CLOSES on
     * success, so no receipt survived to correct it. The PM's only record of
     * the delete said it did nothing.
     *
     * Revert check (production line): the `removedPageCount` clause in
     * `describePublishedCounts`. Removing it turns this red.
     *
     * An earlier version of this comment also claimed that removing
     * `removedPageCount: removedPageIds.length` from the SERVICE's return does
     * the same. It does not — this case drives `mutateAsync.mockResolvedValue`,
     * so the service is not in the render path at all. The service side is
     * pinned by the db-backed integration case, and the route between them by
     * `__tests__/api/pm/site/publish.test.ts`.
     */
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      published: true,
      publishedAt: '2026-07-26T10:00:00.000Z',
      promotedCount: 0,
      retiredCount: 0,
      addedPageCount: 0,
      removedPageCount: 1,
    });
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    expect(toastSuccess).toHaveBeenCalledWith('Published — 1 page removed.');
    expect(toastSuccess).not.toHaveBeenCalledWith(expect.stringContaining('0 sections'));
  });

  it('names sections and pages together when a publish carries both', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      published: true,
      publishedAt: '2026-07-26T10:00:00.000Z',
      promotedCount: 2,
      retiredCount: 1,
      addedPageCount: 1,
      removedPageCount: 1,
    });
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    expect(toastSuccess).toHaveBeenCalledWith(
      'Published — 2 sections live, 1 section removed, 1 page added, 1 page removed.',
    );
  });

  it('claims nothing about pages when the server did not say', async () => {
    /*
     * A browser tab open on a newer bundle than the server it is talking to —
     * routine mid-deploy, in both directions. The page counts are absent, and
     * the copy must not interpolate `undefined` or invent a `0` into the
     * sentence a PM reads after an irreversible action.
     *
     * The section-only wording is asserted verbatim here because preserving it
     * is what shows the clause builder did not quietly reword every existing
     * publish.
     */
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      published: true,
      publishedAt: '2026-07-26T10:00:00.000Z',
      promotedCount: 3,
      retiredCount: 0,
    });
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    expect(toastSuccess).toHaveBeenCalledWith('Published — 3 sections live.');
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

  it('does not claim the publish happened on the receipt that says it did not', async () => {
    /*
     * `attempted` is computed BEFORE the request and is only ever RENDERED on
     * the failure paths — success toasts and closes the sheet, so no receipt
     * survives. In the past tense it stacked, in this order:
     *
     *     Publish stopped
     *     You published 3 changes.
     *     Someone else published while you were working, so nothing was published.
     *
     * `ReceiptProps.attempted` documents itself as "What was attempted, e.g.
     * 'Publishing 3 changes'"; the caller was the half that drifted. Pre-dates
     * this phase (Phase 5), repaired here because 11b-3 newly makes a refusal
     * routine — the publish can now be blocked on page grounds.
     *
     * Revert check (production line): `attempted` in `PublishSheet.tsx`'s
     * `onPublish`, restored to `` `You published ${plural(…)}.` ``.
     */
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new PublishConflictError('Site changed since load'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/you tried to publish/i)).toBeInTheDocument();
    // The exact sentence that read as a false claim, beside "nothing was published".
    expect(within(receipt).queryByText(/^You published /)).not.toBeInTheDocument();
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

  it('gives the server\'s per-page reasons, and advice that is not "try again"', async () => {
    /*
     * The dead end this closes. `publishCommunitySite` refuses a page-set
     * violation with `ValidationError('This site cannot be published yet.',
     * { fields })`, where `fields` names each offending page. `requestJson`
     * dropped `fields` entirely, so the receipt said only that sentence next to
     * "Try publishing again" — an instruction for the one action guaranteed to
     * fail forever, with the actionable part sitting unread on the wire.
     *
     * Reachable even with the client-side gate above: the retired-slug rule is
     * server-only, and a co-manager can create the state between this sheet's
     * read and the publish click.
     *
     * Revert check (production line): `this.fields = readFields(init.details)`
     * in `ApiRequestError`'s constructor (`request-json.ts`). Removing only
     * that line drops the reasons list AND reverts `nextStep` to the "try
     * publishing again" branch, so both assertions here go red while every
     * other receipt case — which throws a plain `Error` — stays green.
     */
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiRequestError('This site cannot be published yet.', {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: {
          fields: [
            {
              field: 'page:2.slug',
              message:
                'Another page used to live at "/contact", and it still forwards visitors to its replacement.',
            },
          ],
        },
      }),
    );
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText('This site cannot be published yet.')).toBeInTheDocument();
    expect(
      within(receipt).getByText(/still forwards visitors to its replacement/),
    ).toBeInTheDocument();
    expect(within(receipt).getByText(/Fix the problems above in the Pages panel/)).toBeInTheDocument();
    expect(within(receipt).queryByText(/Try publishing again/)).not.toBeInTheDocument();
  });

  it('still says "try again" for a failure the server could not explain', async () => {
    // The control for the case above: a plain transient failure keeps the
    // retry advice, which is correct for it.
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Upstream timed out'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: /publish changes/i }));

    const receipt = await screen.findByTestId('publish-receipt');
    expect(within(receipt).getByText(/Try publishing again/)).toBeInTheDocument();
    expect(within(receipt).queryByTestId('publish-receipt-reasons')).not.toBeInTheDocument();
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

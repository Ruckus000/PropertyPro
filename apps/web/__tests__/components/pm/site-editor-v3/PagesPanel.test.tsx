/**
 * Website editor v3 — the Pages tool panel (Phase 11b-3, slices S4a + S4b).
 *
 * What this file protects:
 *
 *   1. all four data states render something useful — a panel that renders
 *      nothing while loading or after a failed read reads as a broken editor,
 *      and this is the surface that decides which page every block write lands
 *      on, so "looks empty" is not a survivable state;
 *   2. the row states a PM has to be able to tell apart (a page staged for
 *      removal, one that has never been published, one hidden from the nav) are
 *      each said in WORDS, not only in colour;
 *   3. a selection that no longer names a real page repairs itself to home,
 *      rather than leaving the manager saving into a 404 with no way back;
 *   4. the four mutations a PM can make — add, rename, reorder, remove — go to
 *      the server as the request the PM asked for, and the two irreversible
 *      edges are guarded:
 *        - an address control exists ONLY on a page that has never been
 *          published (D32′), because changing a live address is live-immediate
 *          and permanently reserves the old slug;
 *        - the confirmation for a never-published page states that the deletion
 *          is immediate, that it cannot be undone, and how many sections go with
 *          it, and never borrows the word "publish" (D36′) — that dialog is the
 *          ONLY guard on a path with no server-side way back.
 *
 * `@/hooks/use-site-pages` and `@/hooks/use-content-blocks` are mocked
 * COMPLETELY. A partial factory fails only at module load, and only for
 * whichever component reaches the missing export, so it reads as an unrelated
 * component breaking rather than a mock being short.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Imported, never spelled out: a literal here would keep passing after the
// constant moved, and the assertion it guards is a section COUNT the PM reads
// before an irreversible delete.
import { SITE_PAGE_SLUG_PATTERN, TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import { ApiRequestError } from '@/lib/api/request-json';

const {
  useSitePagesMock,
  refetchMock,
  createMutate,
  updateMutate,
  reorderMutate,
  deleteMutate,
  unstageMutate,
  blocksMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  useSitePagesMock: vi.fn(),
  refetchMock: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  reorderMutate: vi.fn(),
  deleteMutate: vi.fn(),
  unstageMutate: vi.fn(),
  blocksMock: { data: [] as unknown[] },
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/hooks/use-site-pages', () => ({
  useSitePages: useSitePagesMock,
  useCreateSitePage: () => ({ mutate: createMutate, isPending: false, error: null }),
  useUpdateSitePage: () => ({ mutate: updateMutate, isPending: false, error: null }),
  useReorderSitePages: () => ({ mutate: reorderMutate, isPending: false, error: null }),
  useDeleteSitePage: () => ({ mutate: deleteMutate, isPending: false, error: null }),
  useUnstageSitePageDelete: () => ({ mutate: unstageMutate, isPending: false, error: null }),
  applyPageOrder: (pages: unknown) => pages,
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId] as const,
}));

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({ data: blocksMock.data }),
}));

// Every method the site-editor tree can reach, not only the ones this file
// asserts on: corpus trap #3 — a factory missing an export yields `undefined`
// at call time, which reads as an unrelated component breaking. `info` is the
// selection repair's channel (`EditorRoot.tsx`) and had zero coverage repo-wide.
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, info: vi.fn(), dismiss: vi.fn() },
}));

import {
  PagesPanel,
  MAX_SITE_PAGES,
  PAGE_CAP_MESSAGE,
  slugifyPageName,
} from '@/components/pm/site-editor-v3/panels/PagesPanel';
import type { SitePageSummary } from '@/hooks/use-site-pages';

function page(overrides: Partial<SitePageSummary> & { id: number }): SitePageSummary {
  return {
    name: `Page ${overrides.id}`,
    slug: `page-${overrides.id}`,
    inNav: true,
    sortOrder: overrides.id,
    isHome: false,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    ...overrides,
  };
}

const HOME = page({ id: 1, name: 'Home', slug: '', isHome: true, sortOrder: 0 });
const AMENITIES = page({ id: 2, name: 'Amenities', slug: 'amenities' });
const DRAFT_PAGE = page({
  id: 3,
  name: 'Board',
  slug: 'board',
  isDraft: true,
  publishedAt: null,
  sortOrder: 2,
});

const onSelectPage = vi.fn();
const onPageRemoved = vi.fn();
const onFocusRestored = vi.fn();

function renderPanel({
  pages = [HOME, AMENITIES] as SitePageSummary[] | undefined,
  isPending = false,
  isError = false,
  error = null as Error | null,
  selectedPageId = 1 as number | null,
  restoreFocusToSelectedRow = false,
} = {}) {
  useSitePagesMock.mockReturnValue({
    data: isPending || isError ? undefined : pages,
    isPending,
    isError,
    error,
    refetch: refetchMock,
  });
  return render(
    <PagesPanel
      communityId={7}
      selectedPageId={selectedPageId}
      restoreFocusToSelectedRow={restoreFocusToSelectedRow}
      onFocusRestored={onFocusRestored}
      onSelectPage={onSelectPage}
      onPageRemoved={onPageRemoved}
    />,
  );
}

/** Opens a row's settings drawer and returns a scoped query helper for it. */
async function openSettings(user: ReturnType<typeof userEvent.setup>, pageId: number) {
  await user.click(screen.getByTestId(`site-page-settings-${pageId}`));
  return within(screen.getByTestId(`site-page-editor-${pageId}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  blocksMock.data = [];
});

describe('PagesPanel — data states', () => {
  it('renders placeholder rows while the list is in flight', () => {
    renderPanel({ isPending: true });
    expect(screen.getByTestId('site-pages-loading')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Site pages' })).not.toBeInTheDocument();
  });

  it('explains a failed read and offers a retry that refetches', async () => {
    const user = userEvent.setup();
    renderPanel({ isError: true, error: new Error('Network is down') });

    expect(screen.getByText("We couldn't load your pages.")).toBeInTheDocument();
    expect(screen.getByText('Network is down')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state rather than a bare list when there are no pages', () => {
    renderPanel({ pages: [] });
    expect(screen.getByTestId('site-pages-empty')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Site pages' })).not.toBeInTheDocument();
  });

  it('still offers the add form in the empty state', () => {
    // Otherwise a community whose last page vanished has no escape but a reload.
    renderPanel({ pages: [] });
    expect(screen.getByRole('button', { name: 'Add a page' })).toBeInTheDocument();
  });

  it('lists the pages with their public addresses', () => {
    renderPanel();

    const rows = within(screen.getByRole('list', { name: 'Site pages' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    // Home keeps the order the server sent — it is pinned at the site root.
    expect(within(rows[0]!).getByText('Home')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('/')).toBeInTheDocument();
    // `HOME.slug` is `''`, so `/` is what BOTH branches of the address
    // rendering produce — the `isHome` special case is invisible against this
    // fixture. The case below varies only that flag.
    expect(within(rows[1]!).getByText('Amenities')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('/amenities')).toBeInTheDocument();
  });

  it('renders the home page at the ROOT even if its row carries a slug', () => {
    // Home is pinned at `/` by the `isHome` flag, not by its slug happening to
    // be empty. A restored backup or a raw SQL fix can leave a non-empty slug
    // on the home row; rendering `/legacy-home` there would send the PM to an
    // address the public router never serves for that page.
    renderPanel({ pages: [page({ id: 1, name: 'Home', slug: 'legacy-home', isHome: true, sortOrder: 0 }), AMENITIES] });

    const rows = within(screen.getByRole('list', { name: 'Site pages' })).getAllByRole(
      'listitem',
    );
    expect(within(rows[0]!).getByText('/')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('/legacy-home')).not.toBeInTheDocument();
  });
});

describe('PagesPanel — selection', () => {
  it('marks exactly one row as the page being edited', () => {
    renderPanel({ selectedPageId: 2 });

    const current = screen
      .getAllByRole('button')
      // `'page'`, not `'true'`. `aria-current="page"` is the conventional
      // value for "this is the item you are on" and the one assistive tech
      // announces as a location; `"true"` is the generic fallback.
      .filter((node) => node.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Amenities');
  });

  it('reports a click as a page change', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedPageId: 1 });

    await user.click(screen.getByTestId('site-page-select-2'));
    // …carrying the words for the parent's live region. The panel's primary
    // action used to be its ONLY silent one: creation, reorder and selection
    // repair all announce, while an ordinary switch — which swaps the canvas,
    // the Sections list and the Inspector all at once — said nothing.
    //
    // Announced from HERE rather than in `EditorRoot` because this side knows
    // the page's name; held by the parent because the switch remounts this
    // panel and a live region inside it would be rebuilt before it could speak.
    expect(onSelectPage).toHaveBeenCalledWith(2, { announce: 'Now editing Amenities.' });
  });

  it('puts focus on the selected row when the parent asks it to', () => {
    /*
     * `EditorRoot`'s `key={effectivePageId}` (D-SEL) remounts this panel on
     * every page switch, which destroys the button the PM just activated —
     * so the panel's PRIMARY action was the one action that stranded a keyboard
     * user at `<body>`, at the top of the document, while the canvas, the
     * Sections list and the Inspector all swapped underneath.
     *
     * Simulated the way production does it: a fresh mount with the new
     * selection and the parent's flag set, which is exactly what the remount
     * produces.
     *
     * The title says "when the parent asks", not "after the parent remounts",
     * on purpose. This file supplies the flag itself, so it can only ever prove
     * the panel's half of the bargain. Whether the parent asks at the right
     * moments — and stops asking afterwards — is asserted in
     * `EditorRoot.test.tsx`, which is where the flag lives and where it latched.
     *
     * Revert check (production line): `selectedRowRef.current?.focus()` in
     * `PagesPanel.tsx`'s mount effect.
     */
    useSitePagesMock.mockReturnValue({
      data: [HOME, AMENITIES],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    render(
      <PagesPanel
        communityId={7}
        selectedPageId={2}
        restoreFocusToSelectedRow
        onFocusRestored={onFocusRestored}
        onSelectPage={onSelectPage}
        onPageRemoved={onPageRemoved}
      />,
    );

    expect(document.activeElement).toBe(screen.getByTestId('site-page-select-2'));
    // Spent, not left armed. Without this the parent's flag stayed true across
    // the tool switch that unmounts this panel, and the next reopen stole focus
    // — the ambush the flag exists to prevent. The seam is in
    // `EditorRoot.test.tsx`; this is the panel end of the same wire.
    //
    // Revert check (production line): the `onFocusRestored()` call in the mount
    // effect. The focus assertion above stays green without it.
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
  });

  it('consumes a flag raised while it is already mounted', () => {
    /*
     * The fix for round 8's HIGH, and the case that pins it.
     *
     * The first version of this consumer was a mount-only effect (`[]` deps),
     * which made the flag single-use PER REMOUNT rather than single-use. The
     * parent arms it from `handleSelectPage` on every row click — including
     * clicks that leave `effectivePageId` unchanged and therefore do not remount
     * this panel through `EditorRoot`'s `key`. Re-clicking the row you are
     * already on does that, and so does the very FIRST click on the home row
     * (`selectedPageId` moves `null → home.id` while `effectivePageId` was
     * already `home.id`). Nothing consumed the flag on those paths, so it stayed
     * armed until the next unmount/remount — and the PM's next trip to Sections
     * and back performed the focus ambush verbatim, which is the exact defect
     * the flag exists to prevent.
     *
     * Simulated the way production reaches it: a rerender of the SAME instance
     * with the flag flipping false → true. A remount would prove nothing here,
     * because the mount-only version handled that case correctly.
     *
     * Revert check (production line): the deps array on the focus effect in
     * `PagesPanel.tsx`, `[restoreFocusToSelectedRow, onFocusRestored]` → `[]`.
     * That is the pre-fix code exactly.
     */
    useSitePagesMock.mockReturnValue({
      data: [HOME, AMENITIES],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    const props = {
      communityId: 7,
      selectedPageId: 2,
      onFocusRestored,
      onSelectPage,
      onPageRemoved,
    };
    const { rerender } = render(<PagesPanel {...props} restoreFocusToSelectedRow={false} />);
    // Nothing yet: opening the tab must not steal focus.
    expect(onFocusRestored).not.toHaveBeenCalled();

    rerender(<PagesPanel {...props} restoreFocusToSelectedRow />);

    expect(document.activeElement).toBe(screen.getByTestId('site-page-select-2'));
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
  });

  it('does NOT steal focus when the panel is merely opened', () => {
    // The control, and the reason the flag exists rather than "focus the
    // selected row on mount": opening the Pages tab also mounts this panel,
    // and grabbing focus there would yank it out of whatever the PM was doing.
    renderPanel({ selectedPageId: 2 });

    expect(document.activeElement).not.toBe(screen.getByTestId('site-page-select-2'));
    expect(onFocusRestored).not.toHaveBeenCalled();
  });

  it('marks no row current until the parent says which page is selected', () => {
    // Controlled, deliberately: the panel renders the selection the block
    // writes actually use, never one of its own.
    //
    // The `null` half alone is a vacuous negative — it passes for a panel that
    // never marks anything, including one whose `aria-current` was deleted. The
    // POSITIVE control below is what makes the negative mean something: the
    // same fixture, differing only in `selectedPageId`, marks exactly one row.
    const current = () =>
      screen.getAllByRole('button').filter((n) => n.getAttribute('aria-current') === 'page');

    const { unmount } = renderPanel({ selectedPageId: null });
    expect(current()).toHaveLength(0);
    unmount();

    renderPanel({ selectedPageId: 2 });
    expect(current()).toHaveLength(1);
  });

  /*
   * Selection REPAIR is no longer this panel's job, and the cases that used to
   * live here have moved to `EditorRoot.test.tsx` rather than being dropped:
   *
   *  - repairs a stale selection  → 'returns the selection to home when the
   *    selected page leaves the list'
   *  - selects home when the editor arrived with no page → covered by the seed
   *    fallback, 'falls back to the client pages query when the seed came back
   *    empty'. `EditorRoot` now DERIVES home rather than calling back to ask
   *    for it, so there is no callback left to assert on.
   *  - leaves a valid selection alone → `EditorRoot`: 'swaps the list when the
   *    page changes' asserts the selection stays put.
   *  - does not repair while the list is loading → NOT re-asserted anywhere,
   *    stated plainly rather than implied. `EditorRoot`'s repair requires
   *    `home !== undefined`, which already fails whenever `pages` is
   *    `undefined`, so the `pages !== undefined` clause is belt-and-braces and
   *    a test for it would pass on either. The behaviour is safe; the coverage
   *    is genuinely absent.
   *
   * They cannot be asserted here any more, and that is the point: this panel is
   * dynamically imported and mounted only while its own tab is active, so a
   * repair living here never ran in the window that needed it most — a publish
   * applying a staged page removal, started from the shell header with Sections
   * showing. Keeping green versions of them here would assert a mechanism
   * production does not use.
   */

  // 'does not repair a selection when the read failed' was the sixth of the
  // cases above and is deleted with them. Left in place it would have been
  // VACUOUS: with repair gone from this panel, `onSelectPage` fires only from a
  // row click and from `create.onSuccess`, so `not.toHaveBeenCalled()` holds
  // whatever the error branch does. A case that cannot fail is not coverage.
});

describe('PagesPanel — row state', () => {
  it('says a staged removal in words', () => {
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', deleteStagedAt: '2026-07-30T00:00:00.000Z' })],
    });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Removing')).toBeInTheDocument();
  });

  it('says an unpublished page is a draft', () => {
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', isDraft: true, publishedAt: null })],
    });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Draft')).toBeInTheDocument();
  });

  it('says a page kept out of the nav is out of the NAV, not hidden', () => {
    // "Hidden" over-claimed. `in_nav` removes the navigation link and nothing
    // else: the page stays published, stays anon-readable at its own address,
    // and is deliberately still in `sitemap.xml` (D16). A PM reaching for this
    // to take a page down would have believed they had.
    renderPanel({ pages: [HOME, page({ id: 2, name: 'Amenities', inNav: false })] });
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.getByText('Not in nav')).toBeInTheDocument();
    expect(row.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('leads with the removal when a page is both staged and hidden', () => {
    renderPanel({
      pages: [
        HOME,
        page({
          id: 2,
          name: 'Amenities',
          inNav: false,
          isDraft: true,
          deleteStagedAt: '2026-07-30T00:00:00.000Z',
        }),
      ],
    });
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.getByText('Removing')).toBeInTheDocument();
    expect(row.queryByText('Not in nav')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('shows BOTH draft and nav state, which are independent facts', () => {
    // Under a single most-urgent-wins badge, a draft page the PM had taken out
    // of the nav showed only "Draft" — and the nav state appeared nowhere in
    // the collapsed list, only as an icon inside the expanded editor, which is
    // not the surface the PM reads.
    //
    // Revert check (production line): the `badges.push` for `!page.inNav` in
    // `PagesPanel.tsx`'s `rowBadges`, or making the two branches exclusive
    // again. Either turns this red and leaves the staged case above green.
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', isDraft: true, inNav: false })],
    });
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.getByText('Draft')).toBeInTheDocument();
    expect(row.getByText('Not in nav')).toBeInTheDocument();
  });

  it('badges nothing on an ordinary published page', () => {
    renderPanel();
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.queryByText('Removing')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
    expect(row.queryByText('Not in nav')).not.toBeInTheDocument();
  });
});

describe('PagesPanel — adding a page', () => {
  it('suggests an address from the name until the address is edited', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Pool Rules');
    expect(screen.getByLabelText('Web address')).toHaveValue('pool-rules');

    // Once the PM touches the address it is theirs — a later name edit must not
    // silently move the page's URL out from under them.
    await user.clear(screen.getByLabelText('Web address'));
    await user.type(screen.getByLabelText('Web address'), 'pool');
    await user.type(screen.getByLabelText('Page name'), ' 2026');
    expect(screen.getByLabelText('Web address')).toHaveValue('pool');
  });

  it('creates the page and lands the PM on it', async () => {
    const user = userEvent.setup();
    createMutate.mockImplementation((_input, options) =>
      options.onSuccess({ ...page({ id: 9, name: 'Pool Rules', slug: 'pool-rules' }) }),
    );
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Pool Rules');
    await user.click(screen.getByRole('button', { name: 'Add page' }));

    expect(createMutate).toHaveBeenCalledWith(
      { name: 'Pool Rules', slug: 'pool-rules' },
      expect.anything(),
    );
    // The whole contract with the parent. `pending: true` says "I made this
    // one, the cached list does not have it yet, hold the selection";
    // `announce` hands over the screen-reader text, because this panel is
    // remounted by the very switch this call triggers and its own live region
    // would be rebuilt before the string could be announced.
    expect(onSelectPage).toHaveBeenCalledWith(9, {
      pending: true,
      announce: 'Pool Rules added.',
    });
  });

  /*
   * 'does not bounce the PM back to home before the new page reaches the list'
   * used to sit here, and it could not fail. It drove the change with
   * `rerender`, which PRESERVES state — but production goes through
   * `EditorRoot`, whose `key={effectivePageId}` (D-SEL) REMOUNTS this panel on
   * the very switch the creation triggers, resetting the mark it had just set.
   * The guard was dead in the real tree and the test could not see it.
   *
   * The mark now lives in `EditorRoot`, above the remount, and is asserted
   * there against the real composition — 'holds the selection on a page it has
   * just created, before the list catches up', plus 'still repairs an ordinary
   * stale selection' for the scoping half.
   */

  it('says so when the create request itself fails', async () => {
    // `submitCreate`'s error branch had no test — a create that 409s or times
    // out closed the form and said nothing, so the PM believed the page was
    // made and went looking for it.
    const user = userEvent.setup();
    createMutate.mockImplementation((_input, options) =>
      options.onError(new Error('That web address is reserved.')),
    );
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Pool Rules');
    await user.click(screen.getByRole('button', { name: 'Add page' }));

    expect(createMutate).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("We couldn't add that page"),
    );
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it('gives the server\'s actionable reason, not just its summary sentence', async () => {
    /*
     * Round 6. A `ValidationError` carries the summary in `message` and the
     * half that tells the PM what to DO in `fields` — "…still forwards visitors
     * to the page that replaced it. Pick another address." `requestJson` now
     * carries `fields` through (`ApiRequestError`), and this toast was still
     * printing the summary alone, so the change that carried it stopped one
     * call site short.
     *
     * Revert check (production line): `refusalDetail`'s `error.fields` read in
     * `PagesPanel.tsx`. Returning `error.message` unconditionally turns this
     * red and leaves the plain-Error case green.
     */
    const user = userEvent.setup();
    createMutate.mockImplementation((_input, options) =>
      options.onError(
        new ApiRequestError('Another page used to live at that web address.', {
          status: 400,
          code: 'VALIDATION_ERROR',
          details: {
            fields: [
              {
                field: 'slug',
                // Verbatim from `site-pages-service.ts`'s retired-slug refusal.
                // The slug prefix matters to what this case proves: the
                // server's field messages are SELF-CONTAINED sentences, which
                // is why `refusalDetail` returns them instead of the summary
                // rather than joining both.
                message:
                  '"/pool-rules" still forwards visitors to the page that replaced it. Pick another address.',
              },
            ],
          },
        }),
      ),
    );
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Pool Rules');
    await user.click(screen.getByRole('button', { name: 'Add page' }));

    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('Pick another address'));
  });

  it('keeps keyboard focus inside the add flow, at both ends', async () => {
    /*
     * The button and the form are two arms of one ternary, so each transition
     * DESTROYS the focused element: opening removes the button the PM just
     * pressed, cancelling removes the Cancel button. Focus falls to `<body>`
     * both times and a keyboard PM is at the top of the document — with, on the
     * way in, a form on screen they must re-Tab the whole panel to reach.
     *
     * This panel already guards the same stranding three other times (the
     * selected-row restore, the vanished-row list focus, the confirm dialog's
     * `restoreFocusTo`); the primary creation journey was the gap.
     *
     * Revert check (production lines): `autoFocus` on the `#site-page-new-name`
     * `<Input>` for the first assertion, and `addButtonRef.current?.focus()` in
     * Cancel's `onClick` for the second. Each turns exactly its own half red.
     */
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    expect(screen.getByLabelText('Page name')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Add a page' })).toHaveFocus();
  });

  it('says a name is too long before the server does', async () => {
    /*
     * The wire caps both fields at 60 (`nameField`/`slugField` in the pages
     * contract) and the panel checked neither, so an over-long name passed
     * every visible check, enabled Add page, and came back as a raw zod
     * sentence — "Too big: expected string to have <=60 characters" — carried
     * through `fields` and printed by `refusalDetail` with NO field label. With
     * both fields capped at 60 the PM could not tell which one to shorten.
     *
     * Revert check (production line): the `lengthErrors(newName.trim(), 'name')`
     * term in `createNameErrors`.
     */
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'a'.repeat(61));

    expect(screen.getByText(/up to 60 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
  });

  it('refuses an address an application route already owns', async () => {
    // `isReservedPublicSlug` is INJECTED into the shared validator, which is the
    // same function the server runs. A page at /documents would be shadowed by
    // the resident portal for every logged-in resident.
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Documents');

    expect(screen.getByText(/used by the resident portal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
    // The trailing click is DOUBLY caused — the button is disabled AND
    // `submitCreate` short-circuits on `!canCreate` — so on its own it cannot
    // say which guard held. Deleting either one leaves it green. It is kept as
    // the end-to-end statement ("this cannot be submitted"), with the
    // `canCreate` half asserted independently in the sibling case below.
    await user.click(screen.getByRole('button', { name: 'Add page' }));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('refuses the submit even when the disabled button is bypassed', async () => {
    /*
     * The other half of the case above, isolated: `submitCreate`'s own
     * `!canCreate` short-circuit.
     *
     * **`user.type(field, '…{Enter}')` does NOT reach it**, and an earlier
     * version of this test used exactly that and proved nothing. user-event's
     * Enter-on-a-text-input behaviour does not submit the form — it looks up
     * `button[type="submit"]` and dispatches a CLICK on it. That button is
     * `disabled`, so the path collapses into the very click case this is
     * supposed to be distinguished from, `onSubmit` never fires, and the guard
     * is never entered. (Caught by review round 6's fix-auditor, in a test
     * written to close round 5's meta-finding — the same failure mode, one
     * level up.)
     *
     * `fireEvent.submit` on the form element is the only way in from a test:
     * a real user reaches it via Enter in a browser that DOES submit, or via a
     * second submit control.
     *
     * Revert check (production line, verified): the `!canCreate ||` term in
     * `PagesPanel.tsx`'s `submitCreate`. Removing it turns this red. The
     * previous `{Enter}` version stayed GREEN under that same removal.
     */
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Documents');

    const form = screen.getByLabelText('Page name').closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(createMutate).not.toHaveBeenCalled();
  });

  it('refuses an address another page already uses', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Amenities');

    expect(screen.getByText(/Another page already uses "\/amenities"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
  });

  it('says nothing about validity before the PM has typed anything', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('caps the site at 20 pages instead of offering another', () => {
    const many = [HOME, ...Array.from({ length: MAX_SITE_PAGES - 1 }, (_, i) => page({ id: i + 2 }))];
    expect(many).toHaveLength(MAX_SITE_PAGES);
    renderPanel({ pages: many });

    expect(screen.getByTestId('site-pages-cap')).toHaveTextContent(PAGE_CAP_MESSAGE);
    expect(screen.queryByRole('button', { name: 'Add a page' })).not.toBeInTheDocument();
  });

  it('still offers Add at ONE page under the cap', () => {
    // The negative control for the case above. Without it, "no Add button at
    // 20 pages" is equally satisfied by a panel that never offers one — and
    // 19 rather than 2, so the boundary itself is what is tested.
    const many = [
      HOME,
      ...Array.from({ length: MAX_SITE_PAGES - 2 }, (_, i) => page({ id: i + 2 })),
    ];
    expect(many).toHaveLength(MAX_SITE_PAGES - 1);
    renderPanel({ pages: many });

    expect(screen.getByRole('button', { name: 'Add a page' })).toBeInTheDocument();
    expect(screen.queryByTestId('site-pages-cap')).not.toBeInTheDocument();
  });

  it('keeps the cap message and the cap itself in step', () => {
    // The message is a literal so the phase's grep can find it; this is what
    // stops the literal and the constant from drifting apart.
    expect(PAGE_CAP_MESSAGE).toContain(String(MAX_SITE_PAGES));
  });

  it('slugifies to something the shared slug pattern accepts', () => {
    /*
     * The old version never imported `SITE_PAGE_SLUG_PATTERN` despite being
     * named after it, and its own `'!!!'` case falsified the title — that
     * yields `''`, which the pattern REJECTS. It also missed the one behaviour
     * the source comment singles out: trailing hyphens are stripped AFTER the
     * length clamp, so a name truncated mid-word cannot produce `foo-`.
     * `'A'.repeat(80)` cannot see that — it contains no hyphens at all — so
     * swapping `.slice(0, 60)` and `.replace(/^-+|-+$/g, '')` left all three
     * assertions green.
     *
     * Revert check (production line): swap those two calls in
     * `PagesPanel.tsx`'s `slugifyPageName`. The clamp case below goes red.
     */
    const accepted = (name: string) => {
      const slug = slugifyPageName(name);
      expect(SITE_PAGE_SLUG_PATTERN.test(slug)).toBe(true);
      return slug;
    };

    expect(accepted('  Pool & Spa Rules!  ')).toBe('pool-spa-rules');

    // Punctuation-only yields the EMPTY string, which the pattern rejects — and
    // that is correct, not a gap: the form requires a non-empty address and
    // `pageIssues` reports "Give this page a web address." The helper's job is
    // to suggest, not to invent.
    expect(slugifyPageName('!!!')).toBe('');
    expect(SITE_PAGE_SLUG_PATTERN.test('')).toBe(false);

    // The clamp, with the hyphen landing on the LAST KEPT character — 59 'a's,
    // then a space that becomes the hyphen at index 59. Off-by-one matters
    // here and cost a revert-check: at index 60 the hyphen is cut either way
    // and both orderings agree, so the case proves nothing. At index 59:
    //   clamp → strip  ⇒ 'a'*59        (correct)
    //   strip → clamp  ⇒ 'a'*59 + '-'  (the trailing hyphen the comment on
    //                                   `slugifyPageName` promises cannot occur)
    const clamped = accepted(`${'a'.repeat(59)} tail`);
    expect(clamped).toBe('a'.repeat(59));
    expect(clamped.endsWith('-')).toBe(false);

    // And the plain length clamp still holds.
    expect(accepted('A'.repeat(80))).toHaveLength(60);
  });
});

describe('PagesPanel — renaming', () => {
  it('sends only the display name', async () => {
    const user = userEvent.setup();
    renderPanel();

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Amenity guide');
    await user.click(editor.getByRole('button', { name: 'Save name' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { pageId: 2, name: 'Amenity guide' },
      expect.anything(),
    );
  });

  it('says so when a rename FAILS, rather than leaving the old name on screen silently', async () => {
    // `saveField`'s error branch had no test. Its success branch is asserted by
    // the live-copy case in the navigation describe; this is the other half.
    const user = userEvent.setup();
    updateMutate.mockImplementation((_input, options) =>
      options.onError(new Error('Another page is already called that.')),
    );
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Facilities');
    await user.click(editor.getByRole('button', { name: 'Save name' }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("We couldn't save that change"),
    );
  });

  it('refuses a name another page already uses', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Amenities');

    expect(editor.getByText(/Another page is also called "Amenities"/)).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('refuses the clash in the other direction too — renaming the EARLIER page', async () => {
    // The case above renames the LATER page (id 3) onto an earlier name, which
    // always worked. `pageIssues` attributes a clash to the SECOND occurrence
    // it sees, so in plain list order the edited page only heard about it when
    // it happened to sit after the page it collided with.
    //
    // Renaming Amenities (id 2) to "Board" (id 3) filed the issue against page
    // 3 — which this panel never displays, since `messagesFor` filters on the
    // edited page's id. So: no error, Save enabled, `updateSitePage` had no
    // uniqueness rule to stop it, and the PM met the clash only as a server
    // error on their next publish, naming a page they never touched.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Board');

    expect(editor.getByText(/Another page is also called "Board"/)).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('attaches the refusal to the field it is about, not just to the page', async () => {
    /*
     * `aria-invalid` on its own tells a screen-reader user THAT the value is
     * wrong and never WHY. `role="alert"` announces the reason exactly once,
     * when it appears — so a PM who fixes something else, tabs back onto the
     * name field and asks "what's wrong with this?" hears "invalid entry" and
     * nothing more, with the reason sitting unreachable one node away
     * (WCAG 1.3.1 / 3.3.1).
     *
     * The add form 200 lines up in the same file already did this correctly;
     * the expanded row editor did not. An asymmetry within one component is an
     * oversight, not a decision.
     *
     * Revert check (production line): the `aria-describedby` spread on the
     * `Page name` `<Input>` in `PagesPanel.tsx`'s expanded editor. The two
     * rename cases above stay green without it — they read the error TEXT,
     * which is present either way.
     */
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Board');

    expect(nameField).toHaveAccessibleDescription(/Another page is also called "Board"/);
  });

  it('does not offer to write a stale name back over a co-manager’s rename', async () => {
    /*
     * `useSitePages` sets `refetchOnWindowFocus: true` for exactly one reason —
     * this is the list a SECOND manager can change — so a PM who leaves the
     * settings row expanded and comes back gets a refetched list underneath it.
     *
     * The drafts were seeded once, in `openEditor`, and never again. So the row
     * title rendered the new name while the input still held the old one, and —
     * the dangerous half — `Save name` is disabled on
     * `nameDraft.trim() === page.name`, so the moment those diverged the button
     * ENABLED itself. Pressing it wrote the stale value back: a live, silent
     * revert of the other manager's rename, with the enabled button as the
     * invitation.
     *
     * Revert check (production line): the re-seeding effect in `PagesPanel.tsx`
     * keyed on `[expandedPage?.id, expandedPage?.name, expandedPage?.slug]`.
     * Removing it leaves the input on the old value and Save enabled.
     */
    const user = userEvent.setup();
    const { rerender } = renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    expect(editor.getByLabelText('Page name')).toHaveValue('Amenities');
    expect(editor.getByRole('button', { name: 'Save name' })).toBeDisabled();

    // The co-manager's rename arrives on the focus refetch.
    const renamed = { ...AMENITIES, name: 'Pool & Gym' };
    useSitePagesMock.mockReturnValue({
      data: [HOME, renamed],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    rerender(
      <PagesPanel
        communityId={7}
        selectedPageId={1}
        restoreFocusToSelectedRow={false}
        onFocusRestored={onFocusRestored}
        onSelectPage={onSelectPage}
        onPageRemoved={onPageRemoved}
      />,
    );

    const reopened = within(screen.getByTestId('site-page-editor-2'));
    expect(reopened.getByLabelText('Page name')).toHaveValue('Pool & Gym');
    // …and therefore back to "nothing to save", not "press me to undo them".
    expect(reopened.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });

  it('tells a real clash apart from a page keeping its own name', async () => {
    /*
     * Replaces a static absence assertion that could not be made red.
     *
     * The old version typed a page's OWN name back into its own field and
     * asserted no error — and its fixture never created a duplicate name at
     * all, so it never reached the clash code it was named after.
     *
     * **The no-self-clash half genuinely CANNOT be made red by removing one
     * line, and that is a fact about the code, not a weakness left in this
     * test.** Two mechanisms guarantee it REDUNDANTLY, and each was verified
     * sufficient on its own during the round-5 adoption:
     *   - `editIssues`' `others` filter, which passes the edited page exactly
     *     once (replacing it with `pages` → still green); and
     *   - `pageIssues`' `clash !== page.pageId` guard (deleting the conjunct →
     *     still green).
     * Belt and braces. Claiming a single revert target for that half would be
     * the same wrong-reason bookkeeping this rewrite exists to end.
     *
     * What the rewrite DOES buy is the other half, which the old test lacked
     * entirely: an actual duplicate, asserted to REPORT. That makes the case
     * sensitive to the clash detection existing at all.
     *
     * Revert check (production line, verified): neutralise the clash lookup in
     * `packages/shared/src/site-diff/pages.ts` — `const clash =
     * seenNames.get(nameKey)` → `const clash = undefined`. This case goes red,
     * along with the two sibling rename cases. The old version stayed GREEN
     * under that same change, because "no error appeared" is exactly what a
     * detector that never fires produces.
     */
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');

    // Its own name: quiet.
    await user.clear(nameField);
    await user.type(nameField, 'Amenities');
    expect(editor.queryByText(/Another page is also called/)).not.toBeInTheDocument();

    // Another page's name, in the same field, one keystroke sequence later:
    // loud. DRAFT_PAGE is 'Board'.
    await user.clear(nameField);
    await user.type(nameField, 'Board');
    expect(editor.getByText(/Another page is also called/)).toBeInTheDocument();

    // And back to its own name: quiet again, so the error is a function of the
    // value and not a latch that fires once and stays.
    await user.clear(nameField);
    await user.type(nameField, 'Amenities');
    expect(editor.queryByText(/Another page is also called/)).not.toBeInTheDocument();
  });
});

describe('PagesPanel — a staged page still holds its address', () => {
  /*
   * The client used to disagree with the server here, and the server is right.
   *
   * `site_pages_community_slug_partial` is unique on
   * `(community_id, slug) WHERE deleted_at IS NULL`, and a page staged for
   * removal keeps `deleted_at` NULL until the publish lands — so its row still
   * owns the address. `assertUsableSlug` refuses it accordingly. `pageIssues`
   * skipped staged pages entirely, so the panel showed no error and left Save
   * enabled on an address the write would reject with a 400.
   *
   * Names are the opposite and deliberately so: no unique index, and
   * `assertNameAvailable` skips staged pages. Both directions are asserted, or
   * the obvious "fix" — stop skipping staged pages anywhere — would look right.
   */
  const STAGED = page({
    id: 2,
    name: 'Amenities',
    slug: 'amenities',
    deleteStagedAt: '2026-07-30T00:00:00.000Z',
  });

  it('refuses the address on the add form', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, STAGED] });

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Amenity Guide');
    await user.clear(screen.getByLabelText('Web address'));
    await user.type(screen.getByLabelText('Web address'), 'amenities');

    expect(screen.getByText(/staged for removal still uses "\/amenities"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
  });

  it('refuses the address on a rename', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, STAGED, DRAFT_PAGE] });

    // DRAFT_PAGE has never been published, so it is the one page whose address
    // control is rendered at all (D32′).
    const editor = await openSettings(user, 3);
    await user.clear(editor.getByLabelText('Web address'));
    await user.type(editor.getByLabelText('Web address'), 'amenities');

    expect(editor.getByText(/staged for removal still uses "\/amenities"/)).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Save address' })).toBeDisabled();
  });

  it('offers no rename control on a staged page — absent, not disabled', async () => {
    // `pageIssues` skips a staged page as a SUBJECT as well as a candidate, so
    // the rename form's validation goes quiet on it: a clashing name shows no
    // error, Save stays enabled, and the server refuses the write. Same
    // "absent, not disabled" rule D32′ applies to the address control.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, STAGED] });

    const editor = await openSettings(user, 2);
    expect(editor.queryByLabelText('Page name')).not.toBeInTheDocument();
    expect(editor.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument();
    // And the action that IS useful on a staged page stays reachable — it lives
    // inside this same editor, so hiding the whole panel would have stranded it.
    expect(editor.getByRole('button', { name: 'Cancel removal' })).toBeInTheDocument();
  });

  it('keeps the rename control on a page that is NOT staged', async () => {
    // Scoped to staged rows, not a general removal of the control.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    expect(editor.getByLabelText('Page name')).toBeInTheDocument();
  });

  it('still frees the staged page NAME, which has no unique index', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, STAGED] });

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await user.type(screen.getByLabelText('Page name'), 'Amenities');
    // The address must be moved off the auto-slug, or this asserts the SLUG
    // rule a second time: "Amenities" slugifies to "amenities", which the
    // staged page does still hold. Only the name is under test here.
    await user.clear(screen.getByLabelText('Web address'));
    await user.type(screen.getByLabelText('Web address'), 'amenities-2026');

    expect(screen.queryByText(/Another page is also called/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add page' })).toBeEnabled();
  });
});

describe('PagesPanel — the address control (D32′)', () => {
  it('does not offer an address control for a published page', async () => {
    // ABSENT, not disabled. Changing a live page's address is live-immediate and
    // permanently reserves the old slug, so it is deferred to a human-reviewed
    // PR — and a disabled input would still advertise a capability this build
    // does not have.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 2);
    expect(editor.queryByLabelText('Web address')).not.toBeInTheDocument();
    expect(editor.queryByRole('button', { name: 'Save address' })).not.toBeInTheDocument();
  });

  it('offers it on a page that has never been published', async () => {
    // A draft page has no public URL and mints nothing permanent, so a typo made
    // at creation is still correctable here.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    const slugField = editor.getByLabelText('Web address');
    await user.clear(slugField);
    await user.type(slugField, 'board-of-directors');
    await user.click(editor.getByRole('button', { name: 'Save address' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { pageId: 3, slug: 'board-of-directors' },
      expect.anything(),
    );
  });

  it('never offers it on home, which is pinned at the site root', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [page({ ...HOME, isDraft: true, publishedAt: null }), AMENITIES] });

    const editor = await openSettings(user, 1);
    expect(editor.queryByLabelText('Web address')).not.toBeInTheDocument();
  });

  it('refuses an address an application route already owns', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    const slugField = editor.getByLabelText('Web address');
    await user.clear(slugField);
    await user.type(slugField, 'documents');

    expect(editor.getByText(/used by the resident portal/)).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Save address' })).toBeDisabled();
  });
});

describe('PagesPanel — navigation visibility', () => {
  it('toggles the page out of the navigation', async () => {
    const user = userEvent.setup();
    renderPanel();

    const editor = await openSettings(user, 2);
    const toggle = editor.getByRole('button', { name: 'Show in navigation' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(updateMutate).toHaveBeenCalledWith({ pageId: 2, inNav: false }, expect.anything());
  });

  it('says these controls are LIVE, inside a draft-then-publish editor', async () => {
    /*
     * `site_pages` has no draft/published column pair, so a rename, a nav
     * toggle and a reorder reach the public site the instant they are saved —
     * and `diff-pages.ts` correctly excludes them, so the publish sheet says
     * "0 changes" immediately afterwards. A PM reading that as "nothing has
     * happened yet" is wrong in the one direction that matters. Nothing on
     * screen said so; the only place the distinction appeared was the
     * draft-address hint, which sits on the one control that is harmless.
     *
     * Revert check (production line): the `site-page-live-hint-*` paragraph in
     * `PagesPanel.tsx`.
     */
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    expect(editor.getByTestId('site-page-live-hint-2')).toHaveTextContent(/go live straight away/i);
  });

  it('says what taking a page out of the nav does NOT do', async () => {
    // The closest thing this panel has to "unpublish", and it is not that: the
    // page stays online at its own address and stays in `sitemap.xml` (D16).
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    expect(editor.getByText(/only removes the link from your navigation/i)).toBeInTheDocument();
    expect(editor.getByText(/stays online at its own address/i)).toBeInTheDocument();
  });

  it('says the nav toggle took effect on the live site, not at the next publish', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    await user.click(editor.getByRole('button', { name: 'Show in navigation' }));
    // The mutation is stubbed, so fire its success callback to read the copy
    // the PM actually gets.
    updateMutate.mock.calls[0]?.[1]?.onSuccess?.();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('out of your navigation now'),
    );
  });

  it('reports a hidden page as not shown', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, page({ id: 2, name: 'Amenities', inNav: false })] });

    const editor = await openSettings(user, 2);
    expect(editor.getByRole('button', { name: 'Show in navigation' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the state to a sighted PM, not only to a screen reader', async () => {
    // `aria-pressed` is invisible on an `outline` Button, and the row's "Hidden"
    // badge is suppressed whenever the page is also a draft or staged for
    // removal — so without a visual signal on the control itself there is none
    // at all in exactly the states that matter.
    const user = userEvent.setup();
    const hiddenDraft = page({
      id: 3,
      name: 'Board',
      slug: 'board',
      inNav: false,
      isDraft: true,
      publishedAt: null,
    });
    renderPanel({ pages: [HOME, AMENITIES, hiddenDraft] });
    // The badge is spent on "Draft", so the row says nothing about the nav.
    expect(within(screen.getByTestId('site-page-row-3')).queryByText('Hidden')).toBeNull();

    const shownEditor = await openSettings(user, 2);
    const shownIcon = shownEditor
      .getByRole('button', { name: 'Show in navigation' })
      .querySelector('svg');
    const hiddenEditor = await openSettings(user, 3);
    const hiddenIcon = hiddenEditor
      .getByRole('button', { name: 'Show in navigation' })
      .querySelector('svg');

    expect(shownIcon).not.toBeNull();
    expect(hiddenIcon).not.toBeNull();
    expect(hiddenIcon!.getAttribute('class')).not.toBe(shownIcon!.getAttribute('class'));
  });
});

describe('PagesPanel — reordering', () => {
  const THREE = [HOME, AMENITIES, DRAFT_PAGE];

  it('submits the full non-home order when a page moves down', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: THREE });

    await user.click(screen.getByRole('button', { name: 'Move Amenities down' }));
    expect(reorderMutate).toHaveBeenCalledWith({ orderedPageIds: [3, 2] }, expect.anything());
  });

  it('moves with the keyboard, not only the mouse', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: THREE });

    screen.getByTestId('site-page-grip-3').focus();
    await user.keyboard('{ArrowUp}');
    expect(reorderMutate).toHaveBeenCalledWith({ orderedPageIds: [3, 2] }, expect.anything());
  });

  it('crosses the whole list with Home and End', async () => {
    const user = userEvent.setup();
    const four = [...THREE, page({ id: 4, name: 'Rules', slug: 'rules', sortOrder: 3 })];
    renderPanel({ pages: four });

    screen.getByTestId('site-page-grip-4').focus();
    await user.keyboard('{Home}');
    expect(reorderMutate).toHaveBeenLastCalledWith(
      { orderedPageIds: [4, 2, 3] },
      expect.anything(),
    );

    screen.getByTestId('site-page-grip-2').focus();
    await user.keyboard('{End}');
    expect(reorderMutate).toHaveBeenLastCalledWith(
      { orderedPageIds: [3, 4, 2] },
      expect.anything(),
    );
  });

  it('announces the move so a screen-reader user hears it land', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: THREE });

    await user.click(screen.getByRole('button', { name: 'Move Amenities down' }));
    // Positions count the whole visible list — home is 1 — because that is the
    // list the PM can see.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Amenities moved to position 3 of 3.',
    );
  });

  it('says out loud that the navigation change is already public', async () => {
    /*
     * Reordering rewrites the LIVE navigation the instant it is clicked, and it
     * said so nowhere a sighted PM would meet it. The live region above is
     * sr-only; the one visible statement of live-immediacy sits inside the
     * expanded settings disclosure, which reordering never requires opening.
     * The publish sheet then reads "Nothing to publish" — correctly, since
     * `diffPages` deliberately emits no page-order change — so the list
     * rearranging was the only feedback that anything happened, and it says
     * nothing about the public site.
     *
     * Rename and the nav toggle both already say it; this is the third.
     *
     * Revert check (production line): the `onSuccess` `toast.success` in
     * `moveToIndex` in `PagesPanel.tsx`. The announcement case above stays
     * green without it — they are independent channels.
     */
    const user = userEvent.setup();
    reorderMutate.mockImplementation((_input, options) => options.onSuccess?.());
    renderPanel({ pages: THREE });

    await user.click(screen.getByRole('button', { name: 'Move Amenities down' }));

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('Your navigation order is live now.'),
      // A stable id: moving a page three positions is three mutations, and
      // sonner stacks un-idded toasts.
      { id: 'site-page-reorder' },
    );
  });

  it('stops softly at the ends rather than sending a request', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: THREE });

    // Focus FIRST, and assert it landed. Without this the case cannot tell a
    // soft stop from a grip that never received the keystroke at all — a
    // disabled or unfocusable grip produces the same "no request" result, and
    // would pass this test while the keyboard reorder was entirely dead.
    const grip = screen.getByTestId('site-page-grip-2');
    grip.focus();
    expect(grip).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(reorderMutate).not.toHaveBeenCalled();

    // The positive control on the SAME grip: Down is a real move, so the
    // keystrokes are reaching it and only the boundary is refused.
    await user.keyboard('{ArrowDown}');
    expect(reorderMutate).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: 'Move Amenities up' })).toBeDisabled();
  });

  it('says so when a reorder fails, and stops claiming the move landed', async () => {
    /*
     * Both halves matter, and the second is the one with teeth: the live region
     * has ALREADY announced "moved to position 3", optimistically, so leaving
     * that standing tells a screen-reader user a move landed when it did not.
     *
     * Asserts the region no longer claims the move, rather than asserting a
     * replacement sentence. That is the property the original version of this
     * case was reaching for, and it is strictly stronger: a second sentence in
     * the region would satisfy "the text changed" while ALSO announcing the
     * failure twice — once here and once from sonner, which is itself a live
     * region. The toast is the failure's single announcement.
     *
     * Revert check (production line): `setAnnouncement('')` in `moveToIndex`'s
     * `onError`. Restoring the old `setAnnouncement(\`${page.name} could not be
     * moved.\`)` also turns this red, which is the point — the region must be
     * emptied, not rewritten.
     */
    const user = userEvent.setup();
    reorderMutate.mockImplementation((_input, options) =>
      options.onError(new Error('Upstream timed out')),
    );
    renderPanel({ pages: THREE });

    await user.click(screen.getByRole('button', { name: 'Move Amenities down' }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("We couldn't reorder your pages"),
    );
    expect(screen.getByRole('status')).not.toHaveTextContent(/moved to position/);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('does not announce the same reorder twice', async () => {
    /*
     * The panel's live region and sonner's are BOTH `aria-live`, so a sentence
     * present in each is announced twice to a screen-reader user. The header on
     * `announcement` forbids exactly this, citing `GalleryImagesField` — and the
     * reorder toast, when it was added, interpolated the region's own position
     * sentence and did it anyway.
     *
     * The split now: the REGION states the move (immediately, optimistically),
     * the TOAST states the consequence (once the server confirms). One fact
     * each, no overlap.
     *
     * Revert check (production line): the toast text in `moveToIndex`'s
     * `onSuccess`, restored to `` `${position} Your navigation order is live
     * now.` ``. That turns this red while
     * `'says out loud that the navigation change is already public'` and
     * `'announces the move so a screen-reader user hears it land'` both stay
     * green — neither can see the overlap, because each reads one channel.
     */
    const user = userEvent.setup();
    reorderMutate.mockImplementation((_input, options) => options.onSuccess?.());
    renderPanel({ pages: THREE });

    await user.click(screen.getByRole('button', { name: 'Move Amenities down' }));

    const region = screen.getByRole('status').textContent ?? '';
    const [toastText] = toastSuccessMock.mock.calls[0]!;
    expect(region).toContain('moved to position');
    expect(toastText).not.toContain('moved to position');
    expect(toastText).toContain('live now');
  });

  it('never lets home leave the site root', () => {
    renderPanel({ pages: THREE });

    expect(screen.getByTestId('site-page-grip-1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Home up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Home down' })).toBeDisabled();
  });
});

describe('PagesPanel — removing a page', () => {
  it('stages the removal of a published page and offers an undo', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, options) => options.onSuccess({ staged: true }));
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    await user.click(editor.getByRole('button', { name: 'Remove page' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/stays on your live site until you publish/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove page' }));

    expect(deleteMutate).toHaveBeenCalledWith({ pageId: 2 }, expect.anything());
    const [, options] = toastSuccessMock.mock.calls[0]!;
    expect(options.action.label).toBe('Undo');

    options.action.onClick();
    expect(unstageMutate).toHaveBeenCalledWith({ pageId: 2 }, expect.anything());
  });

  it('the remove dialog for a LIVE page says how much content goes with it', async () => {
    /*
     * D36′ constrains the unpublished dialog to state the section count. The
     * staged dialog stated none — which left the disclosure gradient INVERTED:
     * deleting an unpublished draft told the PM how much content they were
     * losing, while removing the page whose sections are actually on the
     * internet mentioned content nowhere. Not here, not on the publish sheet's
     * row, and not in the receipt, whose `retiredCount` does not count rows the
     * page-delete loop removes.
     *
     * The reversibility copy stays: this one IS undoable, and saying so is the
     * difference between the two dialogs.
     *
     * Revert check (production line): the `sectionPhrase(removeTargetSections)`
     * clause in the `removeTargetIsLive` branch of the ConfirmDialog
     * description in `PagesPanel.tsx`.
     */
    const user = userEvent.setup();
    blocksMock.data = [
      { id: 20, pageId: 2, blockType: 'text' },
      { id: 21, pageId: 2, blockType: 'faq' },
      { id: 22, pageId: 2, blockType: 'gallery' },
      // On another page — must not be counted.
      { id: 23, pageId: 1, blockType: 'text' },
    ];
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    await user.click(editor.getByRole('button', { name: 'Remove page' }));

    const dialog = await screen.findByRole('alertdialog');
    const copy = dialog.textContent ?? '';
    expect(copy).toContain('3 sections');
    // Still the reversible story, not the permanent one.
    expect(copy).toContain('until you publish');
    expect(copy).toContain('undo');
    expect(copy).not.toContain('cannot be undone');
  });

  it('the remove dialog for an unpublished page states the deletion is immediate and permanent', async () => {
    // D36′. There is no server-side path back for a page that has never been
    // published — `unstageSitePageDelete` throws when nothing is staged and a
    // draft discard cannot resurrect a soft-deleted row — so this dialog is the
    // only guard. It must say all three things, and it must NOT borrow the word
    // "publish", which would imply a staged action the PM could reverse.
    const user = userEvent.setup();
    blocksMock.data = [
      { id: 10, pageId: 3, blockType: 'text' },
      { id: 11, pageId: 3, blockType: 'faq' },
      // On another page — must not be counted.
      { id: 12, pageId: 2, blockType: 'text' },
      // A tombstone is already staged for removal; counting it would overstate
      // what the PM loses.
      { id: 13, pageId: 3, blockType: TOMBSTONE_BLOCK_TYPE },
    ];
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    await user.click(editor.getByRole('button', { name: 'Delete page' }));

    const dialog = await screen.findByRole('alertdialog');
    const copy = dialog.textContent ?? '';
    expect(copy).toContain('2 sections');
    expect(copy).toContain('immediately');
    expect(copy).toContain('cannot be undone');
    expect(copy).not.toMatch(/publish/i);
  });

  it('deletes a never-published page with no undo offered', async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, options) => options.onSuccess({ staged: false }));
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    await user.click(editor.getByRole('button', { name: 'Delete page' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete page' }));

    expect(deleteMutate).toHaveBeenCalledWith({ pageId: 3 }, expect.anything());
    // An Undo affordance on a path with no way back would be a lie.
    expect(toastSuccessMock).toHaveBeenCalledWith('Board was deleted.');
    expect(toastSuccessMock.mock.calls[0]).toHaveLength(1);
    // And the parent is told it was self-inflicted, so its selection repair
    // moves the PM to home WITHOUT announcing "the page you were editing is no
    // longer available" on top of the toast above. See
    // `PagesPanelProps.onPageRemoved` and `EditorRoot.test.tsx`.
    expect(onPageRemoved).toHaveBeenCalledWith(3);
  });

  it('does NOT report a staged removal as a self-inflicted disappearance', async () => {
    // The staged page stays in the list until publish, so no repair fires and
    // there is nothing to suppress. Marking it would leave a stale suppression
    // armed for a page that is still there.
    const user = userEvent.setup();
    deleteMutate.mockImplementation((_input, options) => options.onSuccess({ staged: true }));
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    await user.click(editor.getByRole('button', { name: 'Remove page' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove page' }));

    expect(deleteMutate).toHaveBeenCalledWith({ pageId: 2 }, expect.anything());
    expect(onPageRemoved).not.toHaveBeenCalled();
  });

  it('closes the open editor when its row disappears, and keeps focus in the panel', async () => {
    /*
     * Two findings in one path, neither of which had any test.
     *
     * The effect that closes an expanded editor when its row leaves the list
     * was untested outright — an editor left open over a page the server no
     * longer knows offers reorder and nav controls that act on a dead id.
     *
     * And focus: `ConfirmDialog` restores to `removeButtonRef`, which is right
     * for Cancel and useless for Confirm — `confirmRemove` closes the dialog
     * before the mutation resolves, so focus lands on the remove button and the
     * refetch then unmounts the row out from under it. Removing a focused
     * element sends focus to `<body>`, leaving a keyboard PM at the top of the
     * document. The dialog's `isConnected` guard cannot catch it: at the moment
     * that guard runs, the button is still connected.
     *
     * Revert check (production line): `listRef.current?.focus();` in that
     * effect (`PagesPanel.tsx`). Removing only it turns the focus assertion red
     * and leaves the "editor closed" assertion green — which is what shows the
     * two are independent claims and not one.
     */
    const user = userEvent.setup();
    const { rerender } = renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    await openSettings(user, 3);
    expect(screen.getByTestId('site-page-editor-3')).toBeInTheDocument();

    // The delete landed and the invalidated list came back without it.
    useSitePagesMock.mockReturnValue({
      data: [HOME, AMENITIES],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });
    rerender(
      <PagesPanel
        communityId={7}
        selectedPageId={1}
        onSelectPage={onSelectPage}
        onPageRemoved={onPageRemoved}
      />,
    );

    expect(screen.queryByTestId('site-page-editor-3')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('list', { name: 'Site pages' }));
  });

  it('counts no sections honestly rather than saying "0 sections"', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 3);
    await user.click(editor.getByRole('button', { name: 'Delete page' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('no sections');
  });

  it('cancels without deleting anything', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES] });

    const editor = await openSettings(user, 2);
    await user.click(editor.getByRole('button', { name: 'Remove page' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep page' }));

    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('offers to cancel a removal that is already staged', async () => {
    const user = userEvent.setup();
    renderPanel({
      pages: [HOME, page({ id: 2, name: 'Amenities', deleteStagedAt: '2026-07-30T00:00:00.000Z' })],
    });

    const editor = await openSettings(user, 2);
    expect(editor.queryByRole('button', { name: 'Remove page' })).not.toBeInTheDocument();
    await user.click(editor.getByRole('button', { name: 'Cancel removal' }));
    expect(unstageMutate).toHaveBeenCalledWith({ pageId: 2 }, expect.anything());
  });

  it('never offers to remove home', async () => {
    const user = userEvent.setup();
    renderPanel();

    const editor = await openSettings(user, 1);
    expect(editor.queryByRole('button', { name: 'Remove page' })).not.toBeInTheDocument();
    expect(editor.queryByRole('button', { name: 'Delete page' })).not.toBeInTheDocument();
  });
});

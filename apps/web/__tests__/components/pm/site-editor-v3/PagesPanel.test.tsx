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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Imported, never spelled out: a literal here would keep passing after the
// constant moved, and the assertion it guards is a section COUNT the PM reads
// before an irreversible delete.
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';

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

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
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

function renderPanel({
  pages = [HOME, AMENITIES] as SitePageSummary[] | undefined,
  isPending = false,
  isError = false,
  error = null as Error | null,
  selectedPageId = 1 as number | null,
} = {}) {
  useSitePagesMock.mockReturnValue({
    data: isPending || isError ? undefined : pages,
    isPending,
    isError,
    error,
    refetch: refetchMock,
  });
  return render(
    <PagesPanel communityId={7} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />,
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
    expect(within(rows[1]!).getByText('Amenities')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('/amenities')).toBeInTheDocument();
  });
});

describe('PagesPanel — selection', () => {
  it('marks exactly one row as the page being edited', () => {
    renderPanel({ selectedPageId: 2 });

    const current = screen
      .getAllByRole('button')
      .filter((node) => node.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Amenities');
  });

  it('reports a click as a page change', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedPageId: 1 });

    await user.click(screen.getByTestId('site-page-select-2'));
    expect(onSelectPage).toHaveBeenCalledWith(2);
  });

  it('marks no row current until the parent says which page is selected', () => {
    // Controlled, deliberately: the panel renders the selection the block
    // writes actually use, never one of its own.
    renderPanel({ selectedPageId: null });
    expect(
      screen.getAllByRole('button').filter((n) => n.getAttribute('aria-current') === 'true'),
    ).toHaveLength(0);
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
   *  - does not repair while loading / leaves a valid selection alone → the
   *    same guards, asserted where the effect now runs.
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

  it('says a page kept out of the nav is hidden', () => {
    renderPanel({ pages: [HOME, page({ id: 2, name: 'Amenities', inNav: false })] });
    expect(within(screen.getByTestId('site-page-row-2')).getByText('Hidden')).toBeInTheDocument();
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
    expect(row.queryByText('Hidden')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('badges nothing on an ordinary published page', () => {
    renderPanel();
    const row = within(screen.getByTestId('site-page-row-2'));
    expect(row.queryByText('Removing')).not.toBeInTheDocument();
    expect(row.queryByText('Draft')).not.toBeInTheDocument();
    expect(row.queryByText('Hidden')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Add page' }));
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

  it('keeps the cap message and the cap itself in step', () => {
    // The message is a literal so the phase's grep can find it; this is what
    // stops the literal and the constant from drifting apart.
    expect(PAGE_CAP_MESSAGE).toContain(String(MAX_SITE_PAGES));
  });

  it('slugifies to something the shared slug pattern accepts', () => {
    expect(slugifyPageName('  Pool & Spa Rules!  ')).toBe('pool-spa-rules');
    expect(slugifyPageName('!!!')).toBe('');
    expect(slugifyPageName('A'.repeat(80))).toHaveLength(60);
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

  it('does not accuse a page of clashing with itself', async () => {
    // The obvious wrong fix for the above — comparing names without excluding
    // the edited page — would make every rename that keeps its own name, and
    // every no-op open-and-close of the editor, report a clash.
    const user = userEvent.setup();
    renderPanel({ pages: [HOME, AMENITIES, DRAFT_PAGE] });

    const editor = await openSettings(user, 2);
    const nameField = editor.getByLabelText('Page name');
    await user.clear(nameField);
    await user.type(nameField, 'Amenities');

    expect(editor.queryByText(/Another page is also called/)).not.toBeInTheDocument();
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

  it('stops softly at the ends rather than sending a request', async () => {
    const user = userEvent.setup();
    renderPanel({ pages: THREE });

    screen.getByTestId('site-page-grip-2').focus();
    await user.keyboard('{ArrowUp}');
    expect(reorderMutate).not.toHaveBeenCalled();

    expect(screen.getByRole('button', { name: 'Move Amenities up' })).toBeDisabled();
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

/**
 * The EditorRoot → EditorShell seam.
 *
 * This file exists because of a specific production bug: the Publish button was
 * disabled for every PM, for every state, because `EditorRoot` never passed the
 * pending-change prop and both `EditorShell` and `EditorTopBar` defaulted it to
 * a value meaning "nothing to publish". The shell's own tests were green
 * throughout — they pass the prop explicitly, so they assert the shell's
 * contract in isolation and can never see the composition failing.
 *
 * So the assertions here run the REAL `useSiteDiff`, `diffSite` and
 * `toSnapshot` against mocked query data. Mocking `use-site-diff` would recreate
 * exactly the blind spot this file is for.
 *
 * `@/hooks/use-content-blocks` is mocked COMPLETELY — a partial factory fails
 * only at module load for whichever component reaches the missing export, and
 * reads as an unrelated component breaking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorRoot } from '@/components/pm/site-editor-v3/EditorRoot';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// Every code-split child (preview, publish sheet, notice/site panels,
// inspector) renders nothing — this file is about the top bar, and mounting
// them would drag in their own query surfaces.
//
// The ONE exception is the Pages panel, replaced here by a stub. It is the only
// way to drive a page change, and a page change is what the `key` remount in
// `EditorRoot` exists for (D-SEL). Selecting on the loader's SOURCE rather than
// mounting everything keeps every other panel's module out of this file
// entirely — and when the panel is renamed this match fails loudly, which is
// the right direction for a test to break in.
const SECOND_PAGE_ID = 77;
const HOME_PAGE_ID = 5;
const CREATED_PAGE_ID = 91;
/** Mount/unmount trail for the inspector stub — see the dynamic mock below. */
const inspectorLifecycle = vi.hoisted(() => [] as string[]);

/** A `block_order` held by a section on SECOND_PAGE_ID, not on home. */
const FOREIGN_SLOT = 3;

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) =>
    String(loader).includes('PagesPanel')
      ? ({
          selectedPageId,
          onSelectPage,
        }: {
          selectedPageId: number | null;
          onSelectPage: (
            pageId: number,
            options?: { pending?: boolean; announce?: string },
          ) => void;
        }) => (
          <div>
            <p>Editing page {String(selectedPageId)}</p>
            <button type="button" onClick={() => onSelectPage(SECOND_PAGE_ID)}>
              Edit the second page
            </button>
            <button type="button" onClick={() => onSelectPage(HOME_PAGE_ID)}>
              Edit the home page
            </button>
            {/*
             * What the real panel does in `submitCreate.onSuccess`: select the
             * page it just made and mark it pending, because the cached list
             * does not contain it yet.
             */}
            <button
              type="button"
              onClick={() =>
                onSelectPage(CREATED_PAGE_ID, {
                  pending: true,
                  announce: 'Pool Rules added.',
                })
              }
            >
              Create a page
            </button>
          </div>
        )
      : // The inspector, stubbed to record its own mount/unmount.
        //
        // This is what guards `key={effectivePageId}` for WRITE targeting.
        // `page-switch-flush.test.tsx` proves "inspector unmounts ⇒ the flush
        // carries the pre-switch page id", using the real hooks. It cannot
        // prove the unmount happens, because the key in its harness is its own.
        // This half proves the unmount, in the real tree. Neither alone is
        // enough; together they cover the claim.
        String(loader).includes('Inspector')
        ? () => {
            useEffect(() => {
              inspectorLifecycle.push('mount');
              return () => inspectorLifecycle.push('unmount');
            }, []);
            return <p>inspector</p>;
          }
        : // The publish sheet, stubbed only far enough to fire "Fix this". Its
        // blocking issues come from the WHOLE-SITE diff while the editor
        // context is page-scoped (D-C2), so the slot it hands back routinely
        // names a section on another page — the case that regressed.
        String(loader).includes('PublishSheet')
        ? ({ onFixIssue }: { onFixIssue: (slot: number) => void }) => (
            <button type="button" onClick={() => onFixIssue(FOREIGN_SLOT)}>
              Fix this
            </button>
          )
        : () => null,
}));

// The shell asks `(max-width: 767px)`: false = desktop. True would render the
// phone gate and there would be no top bar to assert on.
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => false,
  useIsDesktop: () => true,
}));

// `pageId` is REQUIRED on SiteBlockSummary (D13'), but `apps/web/tsconfig.json`
// includes only `src/**`, so nothing typechecks this file. This factory is
// green today only because the Canvas — the caller of `blocksForPage`, which
// throws on an `undefined` pageId — is mocked away above; the tripwire cannot
// fire on exactly the file that needs it. Defaulting to HOME_PAGE_ID (the page
// the shell seeds) rather than `null` matters: `blocksForPage` deliberately
// excludes unadopted (`null`) rows once a page is selected.
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

const hero = (overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary =>
  block({
    id: 100,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Sunset Condos', subtitle: 'Miami Beach' },
    ...overrides,
  });

interface StubPage {
  id: number;
  name: string;
  slug: string;
  inNav: boolean;
  sortOrder: number;
  isHome: boolean;
  isDraft: boolean;
  publishedAt: string | null;
  deleteStagedAt: string | null;
}

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  // The client pages list. Selection repair and the home-page fallback are both
  // driven by this, so it has to be settable per test rather than a fixed [].
  pages: [] as unknown[],
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

function base() {
  return {
    isPending: queries.isPending,
    isError: queries.isError,
    error: queries.error,
    refetch: vi.fn(),
  };
}

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.draft,
  }),
  usePublishedBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.published,
  }),
  useSitePublishToken: () => ({ ...base(), data: null }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// Phase 11b-3: `useSiteDiff` (which EditorRoot calls for the Publish button)
// now also reads the pages query, because a staged page removal is a pending
// change that shows up nowhere else. This tree is rendered without a
// QueryClientProvider, so the real hook would throw "No QueryClient set" —
// mocked COMPLETELY for the same reason as use-content-blocks above.
vi.mock('@/hooks/use-site-pages', () => ({
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId],
  applyPageOrder: (pages: unknown) => pages,
  useSitePages: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.pages,
  }),
  useCreateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderSitePages: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUnstageSitePageDelete: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

/** The server-seeded home row, as `page.tsx` supplies it. */
const seededHome: StubPage = {
  id: HOME_PAGE_ID,
  name: 'Home',
  slug: '',
  inNav: true,
  sortOrder: 0,
  isHome: true,
  isDraft: false,
  publishedAt: '2026-07-01T00:00:00.000Z',
  deleteStagedAt: null,
};

interface RootOptions {
  initialPages?: StubPage[];
  showWizardBanner?: boolean;
}

function rootElement({
  initialPages = [seededHome],
  showWizardBanner = false,
}: RootOptions = {}) {
  return (
    <EditorRoot
      communityId={42}
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      proToolAccess={{ styling: true, domain: true }}
      hasPolishBlocks
      // Null on purpose: takes the degraded-canvas branch, so the whole
      // block-view tree stays out of this test.
      canvasContext={null}
      hasPublishedSite
      initialNotice={null}
      siteIdentity={{
        name: 'Sunset Condos',
        slug: 'sunset-condos',
        communityType: 'condo_718',
        city: 'Miami',
      }}
      tagline={null}
      initialSiteSettings={undefined}
      initialCustomCss={null}
      showWizardBanner={showWizardBanner}
      // The server seed. Its only job here is to supply the home page id before
      // the Pages panel has ever been opened — that id is what every block
      // write is scoped by.
      initialPages={initialPages}
    />
  );
}

function renderRoot(options: RootOptions = {}) {
  return render(rootElement(options));
}

function publishButton() {
  return screen.getByRole('button', { name: /Publish/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = [];
  queries.published = [];
  queries.pages = [];
  inspectorLifecycle.length = 0;
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
});

describe('EditorRoot — Publish button wiring', () => {
  it('enables Publish when the draft differs from what is live', () => {
    // The regression test. This is the ordinary case a PM hits every session,
    // and it was broken in production.
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [
      hero(),
      block({
        id: 2,
        isDraft: true,
        publishedAt: null,
        content: { heading: 'Pool rules', body: 'No glass, and no diving.' },
      }),
    ];

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });

  it('disables Publish with an explanation when the draft matches what is live', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [hero(), block({ id: 1 })];

    renderRoot();

    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAttribute('title', 'Nothing to publish yet');
  });

  it('enables Publish on a never-published site that has draft content', () => {
    queries.published = [];
    queries.draft = [hero({ isDraft: true, publishedAt: null })];

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });

  it('disables Publish while the change model is still loading', () => {
    queries.isPending = true;

    renderRoot();

    expect(publishButton()).toBeDisabled();
  });

  it('enables Publish when the change model fails to load', () => {
    // The sheet is the only surface that can explain the failure and offer a
    // retry, so a load error must not lock the PM out of opening it.
    queries.isError = true;
    queries.error = new Error('Network is down');

    renderRoot();

    expect(publishButton()).toBeEnabled();
  });
});

describe('EditorRoot — tool panels', () => {
  // `next/dynamic` is stubbed to render null in this file, so the panels
  // themselves cannot be asserted on here (their own test files cover them).
  // What these pin is which tabs still fall through to `ToolPanelPlaceholder` —
  // the state that makes a tool unusable.
  it.each([
    // Exact: `/Add/` also matches the "Address" tab.
    ['Add', 'Add'],
    ['Colours', /Colours/],
    ['Address', /Address/],
    ['Help', /Help/],
  ])('renders a real panel, not a placeholder, on the %s tab', async (_name, accessibleName) => {
    renderRoot();

    await userEvent.click(screen.getByRole('tab', { name: accessibleName }));

    expect(screen.queryByText('This panel is not built yet.')).not.toBeInTheDocument();
  });

  it('seeds the selected page from the server-rendered list', async () => {
    // Before the Pages panel has ever been opened — and therefore before any
    // client request — the editor already knows which page it is editing. This
    // is what stops the first save of a session defaulting to home on a
    // community whose PM was editing something else.
    queries.draft = [hero(), block({ id: 1 })];
    renderRoot();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));

    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });

  it('has a panel for every tool the tab strip offers', async () => {
    // The placeholder is gone and `renderToolPanel` is exhaustive at the type
    // level, so this walks the real tab strip rather than a hand-kept list —
    // a new tool added to EDITOR_TOOLS shows up here automatically.
    renderRoot();

    for (const tab of screen.getAllByRole('tab')) {
      await userEvent.click(tab);
      expect(screen.queryByText('This panel is not built yet.')).not.toBeInTheDocument();
    }
  });
});

describe('EditorRoot — selected page (D-SEL)', () => {
  /** The Sections panel row for a block, which carries the selected state. */
  function sectionRow() {
    return screen.getByRole('button', { name: 'Text' });
  }

  async function selectTheTextSection() {
    await userEvent.click(sectionRow());
    // Precondition, asserted rather than assumed: a test that "clears" a
    // selection that was never made passes for the wrong reason.
    expect(sectionRow()).toHaveAttribute('aria-current', 'true');
  }

  beforeEach(() => {
    queries.draft = [hero(), block({ id: 1 })];
    queries.published = [hero(), block({ id: 1 })];
  });

  it('clears the canvas selection when the page changes', async () => {
    // The selection anchors a block id. Carrying it across a page switch means
    // the inspector edits a section that is not on the page the PM is looking
    // at — so the provider is REMOUNTED on the page id rather than the stale
    // anchor being guarded against at every read.
    //
    // Asserted by returning to home. Since D-C2 scoped the provider, the other
    // page does not list this section AT ALL — a stronger outcome, but one that
    // would make `not.toHaveAttribute` pass vacuously on an absent element, so
    // the round trip is what keeps this assertion about the selection.
    renderRoot();
    await selectTheTextSection();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(sectionRow()).not.toHaveAttribute('aria-current');
  });

  it('UNMOUNTS the inspector on a page switch, which is what targets a pending write', async () => {
    /*
     * The write-targeting half of D-SEL, and the one nothing guarded.
     *
     * `useUpsertContentBlock` captures `useSelectedSitePage()` at RENDER time,
     * so an inspector edit still inside its debounce window writes to whichever
     * page its last render saw. The `key` is what makes that the right one: the
     * outgoing subtree is UNMOUNTED rather than re-rendered, so
     * `use-block-form`'s cleanup flushes through a closure holding the OLD page
     * id. Without the key the form re-renders under the NEW id and the pending
     * debounce silently rewrites the other page's section.
     *
     * `page-switch-flush.test.tsx` proves the second half — unmount ⇒ old page
     * id — against the real hooks. It cannot prove THIS half, because the key in
     * its harness is its own `<div key>`, not this one. An earlier version of
     * this suite believed otherwise: deleting the line below left that file
     * green, so the guarantee the commit was built on was unguarded.
     *
     * Asserting the unmount rather than the write keeps this test about
     * composition and off the hook internals the other file owns.
     */
    renderRoot();
    expect(inspectorLifecycle).toEqual(['mount']);

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    // Torn down and rebuilt, not merely re-rendered.
    expect(inspectorLifecycle).toEqual(['mount', 'unmount', 'mount']);
  });

  it('does NOT unmount the inspector on an ordinary tab change', async () => {
    // The control: the remount must be keyed on the PAGE, not on tab traffic,
    // or every panel click would throw away a pending edit's context.
    renderRoot();
    expect(inspectorLifecycle).toEqual(['mount']);

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(inspectorLifecycle).toEqual(['mount']);
  });

  it('does not list the previous page sections after a switch (D-C2)', async () => {
    // The other consequence of the same switch, and the one the unscoped
    // provider got wrong: home's sections stayed listed beside a canvas
    // rendering the second page.
    renderRoot();
    await selectTheTextSection();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(screen.queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
  });

  it('keeps the selection when the page does not change', async () => {
    // The other half of the same claim: the remount is keyed on the page, so
    // ordinary tab traffic must not throw the selection away.
    renderRoot();
    await selectTheTextSection();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(sectionRow()).toHaveAttribute('aria-current', 'true');
  });

  it('tells the Pages panel which page is now selected', async () => {
    renderRoot();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();
  });
});

/**
 * D-C2's sixth caller. `EditorRoot` feeds `SiteEditorProvider`, which feeds
 * `SectionList` — the DEFAULT tool — and the Inspector. Unfiltered, both listed
 * every page's sections beside a canvas showing one page's.
 *
 * `SectionList` is a STATIC import, so unlike every panel above it really
 * renders here. That is what makes this the composition test the leaf tests
 * could not be.
 */
describe('EditorRoot — the Sections panel is scoped to the selected page (D-C2)', () => {
  const homeSection = () => screen.queryByRole('button', { name: 'Text' });
  const otherPageSection = () => screen.queryByRole('button', { name: 'Gallery' });

  beforeEach(() => {
    queries.draft = [
      hero(),
      block({ id: 1, pageId: HOME_PAGE_ID }),
      block({ id: 2, pageId: SECOND_PAGE_ID, blockType: 'gallery', blockOrder: 3 }),
    ];
    queries.pages = [
      seededHome,
      {
        ...seededHome,
        id: SECOND_PAGE_ID,
        name: 'Amenities',
        slug: 'amenities',
        sortOrder: 1,
        isHome: false,
      },
    ];
  });

  it('lists only the selected page, not every page in the community', () => {
    renderRoot();

    expect(homeSection()).toBeInTheDocument();
    expect(otherPageSection()).not.toBeInTheDocument();
  });

  it('swaps the list when the page changes', async () => {
    renderRoot();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(otherPageSection()).toBeInTheDocument();
    expect(homeSection()).not.toBeInTheDocument();
  });

  it('shows an empty page as empty rather than borrowing the home page sections', async () => {
    // The failure a PM meets first: create a page, and it already appears to
    // have every section the home page has.
    queries.draft = [hero(), block({ id: 1, pageId: HOME_PAGE_ID })];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(homeSection()).not.toBeInTheDocument();
  });
});

describe('EditorRoot — selection repair and the just-created page', () => {
  beforeEach(() => {
    queries.draft = [hero(), block({ id: 1 })];
  });

  it('returns the selection to home when the selected page leaves the list', async () => {
    // The window this exists for: a publish applies a staged page removal and
    // invalidates the whole ['pm','site'] prefix (D10'). That is normally
    // started from the shell header with SECTIONS showing — so the Pages panel,
    // where this repair used to live, is not even mounted.
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];

    const { rerender } = renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();

    // Leave the Pages tab, so the panel is unmounted exactly as it would be
    // during a header-initiated publish. If the repair still lived in the
    // panel, nothing below could fire.
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    // The publish landed: the staged page is gone from the server's list, and
    // the invalidation re-renders the tree with it.
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });

  it('announces a creation from above the remount, where the live region survives', async () => {
    // The same dead-in-the-real-tree class as the pending mark, and its second
    // victim. `PagesPanel` set its own live region in the batch that switched
    // page — which remounts the panel — so the region was torn down and rebuilt
    // by the very update it was reporting, and a live region only announces
    // changes it was mounted to observe. Screen-reader users got silence on the
    // one action the panel documents as having no visible confirmation.
    queries.pages = [seededHome];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));

    // Captured BEFORE the switch. Text content alone cannot tell the two
    // placements apart: put the region back inside the keyed provider and React
    // mounts the new subtree with the string already in it, so
    // `toHaveTextContent` passes either way — a live region announces changes it
    // was mounted to observe, and jsdom has no notion of that. NODE IDENTITY is
    // the only observable difference, so it is what this asserts.
    const region = screen.getByTestId('site-page-announcement');

    await userEvent.click(screen.getByRole('button', { name: 'Create a page' }));

    expect(screen.getByTestId('site-page-announcement')).toBe(region);
    expect(region).toHaveTextContent('Pool Rules added.');
  });

  it('does not leave a stale announcement on an ordinary page click', async () => {
    // A live region that keeps its last string re-announces it on the next
    // unrelated update.
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create a page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('site-page-announcement')).toHaveTextContent('');
  });

  it('says so when it repairs the selection, rather than swapping pages silently', async () => {
    // The common cause is a co-manager publishing a staged removal of the page
    // you had open. A silent swap is the wrong-but-200 this repair exists to
    // prevent, with the destination reversed: the canvas repopulates with
    // home's sections, the PM keeps editing believing they are elsewhere, and
    // every write now lands on the LIVE home page and succeeds.
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];

    const { rerender } = renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    expect(screen.getByTestId('site-page-announcement')).toHaveTextContent(
      /no longer available/i,
    );
  });

  it('holds the selection on a page it has just created, before the list catches up', async () => {
    // `create` resolves and the selection moves to the new id while the cached
    // list is still the PRE-create one. Repairing on that would bounce the PM
    // back to home and send their next section to the wrong page.
    queries.pages = [seededHome];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create a page' }));

    expect(screen.getByText(`Editing page ${CREATED_PAGE_ID}`)).toBeInTheDocument();
  });

  it('still repairs an ordinary stale selection, so the pending mark is not a blanket opt-out', async () => {
    // The mark is released when the list catches up, and an ORDINARY selection
    // never sets it. Without this, "hold the selection" would mean "never
    // repair" and finding #6 would be reintroduced through the fix for #5.
    queries.pages = [seededHome];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });
});

describe('EditorRoot — the page being edited is staged for removal', () => {
  // Writes to a staged page SUCCEED — `resolvePageId` checks only `deletedAt`,
  // which staging does not set — so the editor reports "Saved" for work the next
  // publish deletes. The only prior warning was a "Removing" badge in a panel
  // tab the PM may never open.
  const stagedSecondPage = {
    ...seededHome,
    id: SECOND_PAGE_ID,
    name: 'Amenities',
    slug: 'amenities',
    sortOrder: 1,
    isHome: false,
    deleteStagedAt: '2026-07-30T09:00:00.000Z',
  };

  beforeEach(() => {
    queries.draft = [hero(), block({ id: 1 })];
  });

  it('warns on the editing surface, naming the page', async () => {
    queries.pages = [seededHome, stagedSecondPage];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    const banner = screen.getByTestId('staged-page-banner');
    expect(banner).toHaveTextContent('Amenities');
    expect(banner).toHaveTextContent(/removed/i);
  });

  it('appears when the staging arrives UNDER a mounted editor', async () => {
    // The scenario the banner exists for, and the only one the others do not
    // cover: they all seed the staged state before rendering, so a regression
    // that computed `selectedPageIsStaged` once — hoisted into a mis-keyed
    // `useMemo`, or pushed down into a panel — would pass every one of them.
    //
    // This is how it actually happens: the PM is editing, a co-manager stages
    // the page, and the focus refetch added alongside this banner brings the
    // news in mid-session.
    queries.pages = [seededHome, { ...stagedSecondPage, deleteStagedAt: null }];

    const { rerender } = renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    expect(screen.queryByTestId('staged-page-banner')).not.toBeInTheDocument();

    queries.pages = [seededHome, stagedSecondPage];
    await act(async () => {
      rerender(rootElement());
    });

    expect(screen.getByTestId('staged-page-banner')).toBeInTheDocument();
  });

  it('falls back to the server seed when the pages query is unavailable', async () => {
    // The seed and the client query fail independently, and the seed carries
    // `deleteStagedAt`. Reading only `pages` would drop the warning for exactly
    // the session least able to notice anything else is wrong.
    //
    // The seed keeps its home page: without one `effectivePageId` is null and
    // nothing is selected, which would make this pass or fail for a reason that
    // has nothing to do with the fallback.
    queries.isError = true;
    queries.error = new Error('Pages unavailable');

    renderRoot({ initialPages: [seededHome, stagedSecondPage] });
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('staged-page-banner')).toBeInTheDocument();
  });

  it('says nothing when the selected page is not staged', () => {
    queries.pages = [seededHome, { ...stagedSecondPage, deleteStagedAt: null }];

    renderRoot();

    expect(screen.queryByTestId('staged-page-banner')).not.toBeInTheDocument();
  });

  it('takes the banner slot from the wizard invitation', async () => {
    // One slot, and the removal wins it: the wizard banner is an invitation with
    // no deadline, this is the only thing on screen saying the work in progress
    // is about to be deleted.
    queries.pages = [seededHome, stagedSecondPage];

    renderRoot({ showWizardBanner: true });
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('staged-page-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('wizard-entry-banner')).not.toBeInTheDocument();
  });

  it('still shows the wizard invitation when nothing is staged', () => {
    // The precedence must be conditional, not a permanent eviction.
    queries.pages = [seededHome];

    renderRoot({ showWizardBanner: true });

    expect(screen.getByTestId('wizard-entry-banner')).toBeInTheDocument();
  });

  it('sends the PM to Pages, where the removal can be cancelled', async () => {
    queries.pages = [seededHome, stagedSecondPage];

    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Go to Pages' }));

    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();
  });
});

describe('EditorRoot — "Fix this" reaches a section on another page', () => {
  // A regression introduced BY the D-C2 scoping. `PublishSheetMount` resolves
  // the issue's slot against `movableSections`, which is now page-scoped, while
  // the publish sheet's blocking issues come from the whole-site snapshot. So
  // for an issue on a page the PM is not on, `find` returned undefined, the
  // sheet closed, nothing was selected and nothing was said — the affordance
  // for the one thing standing between the PM and a publish, dead in exactly
  // the multi-page case this phase ships.
  beforeEach(() => {
    queries.published = [hero(), block({ id: 1, pageId: HOME_PAGE_ID })];
    queries.draft = [
      hero(),
      block({ id: 1, pageId: HOME_PAGE_ID }),
      block({
        id: 2,
        pageId: SECOND_PAGE_ID,
        blockType: 'gallery',
        blockOrder: FOREIGN_SLOT,
        isDraft: true,
        publishedAt: null,
      }),
    ];
    queries.pages = [
      seededHome,
      {
        ...seededHome,
        id: SECOND_PAGE_ID,
        name: 'Amenities',
        slug: 'amenities',
        sortOrder: 1,
        isHome: false,
      },
    ];
  });

  it('switches to the page the offending section is on', async () => {
    renderRoot();
    // Precondition: on home, and the offending section is not reachable here.
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();
  });

  it('stays put when the section is already on the selected page', async () => {
    // The switch must be conditional, or every "Fix this" churns the selection
    // and remounts the whole editor for no reason.
    //
    // Identical to the case above except for the offending block's PAGE — vary
    // only the dimension under test, or a difference in the diff shape (and so
    // in whether Publish is even enabled) could explain the result instead.
    queries.draft = [
      hero(),
      block({ id: 1, pageId: HOME_PAGE_ID }),
      block({
        id: 2,
        pageId: HOME_PAGE_ID,
        blockType: 'gallery',
        blockOrder: FOREIGN_SLOT,
        isDraft: true,
        publishedAt: null,
      }),
    ];

    renderRoot();
    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });
});

describe('EditorRoot — the server page seed can fail', () => {
  it('falls back to the client pages query when the seed came back empty', async () => {
    // `loadInitialPages` returns [] on any error, and that read takes the same
    // FOR UPDATE community lock a concurrent publish holds — so this is routine
    // contention, not just a broken database. A null page id is NOT harmless:
    // `blocksForPage(blocks, null)` returns the list UNCHANGED, concatenating
    // every page's sections into one canvas and sending every write to home.
    queries.draft = [
      hero(),
      block({ id: 1, pageId: HOME_PAGE_ID }),
      block({ id: 2, pageId: SECOND_PAGE_ID, blockType: 'gallery', blockOrder: 3 }),
    ];
    queries.pages = [
      seededHome,
      {
        ...seededHome,
        id: SECOND_PAGE_ID,
        name: 'Amenities',
        slug: 'amenities',
        sortOrder: 1,
        isHome: false,
      },
    ];

    renderRoot({ initialPages: [] });

    // Scoped to home, not showing every page: proof the fallback resolved a
    // real page id rather than leaving it null.
    expect(screen.queryByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gallery' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });
});

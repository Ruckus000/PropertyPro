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

/**
 * A `block_order` held by a section on SECOND_PAGE_ID, not on home.
 *
 * "Foreign" is about the PAGE, and since 11c-0 the page travels with it:
 * `onFixIssue` takes `{ pageId, slot }` because a slot alone stops identifying
 * a section once two pages may hold the same one.
 */
const FOREIGN_SLOT = 3;

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) =>
    String(loader).includes('PagesPanel')
      ? ({
          selectedPageId,
          restoreFocusToSelectedRow,
          onFocusRestored,
          onSelectPage,
          onPageRemoved,
        }: {
          selectedPageId: number | null;
          restoreFocusToSelectedRow: boolean;
          onFocusRestored: () => void;
          onSelectPage: (
            pageId: number,
            options?: { pending?: boolean; announce?: string },
          ) => void;
          onPageRemoved: (pageId: number) => void;
        }) => (
          <div>
            <p>Editing page {String(selectedPageId)}</p>
            {/*
             * The focus contract, echoed rather than performed. The real panel
             * focuses a row on mount when this flag is set and then calls
             * `onFocusRestored`; both halves are the PARENT's to get right and
             * neither is visible from `PagesPanel.test.tsx`, which supplies the
             * flag from its own JSX.
             *
             * `data-testid` on the echo is what lets a case assert the flag's
             * value at the moment a fresh panel appears — and, since the flag
             * is now consumed without a remount too, at any render. (This said
             * "a mount-only echo … the only moment it means anything", which
             * the round-8 case beside it contradicts: it asserts the flag on a
             * click that deliberately does NOT remount.)
             */}
            <p data-testid="pages-focus-flag">{String(restoreFocusToSelectedRow)}</p>
            <button type="button" onClick={() => onFocusRestored()}>
              Panel took the focus
            </button>
            {/*
             * What the real panel does in `confirmRemove`'s `!staged` branch:
             * tell the parent the disappearance was self-inflicted, so the
             * repair moves the selection without announcing it.
             */}
            <button type="button" onClick={() => onPageRemoved(SECOND_PAGE_ID)}>
              I deleted the second page
            </button>
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
        : // The preview, stubbed to echo the ONE prop the parent has to pass.
        //
        // Asserted here rather than only in `PreviewDialog.test.tsx`, which
        // passes `pageName` explicitly and therefore cannot see a parent that
        // forgets it — the identical hole that shipped the Publish button dead
        // and that this whole file exists to close. Round 6 found the preview
        // half of the A1 fix had exactly that gap while the top-bar half did
        // not.
        String(loader).includes('PreviewDialog')
        ? ({ pageName }: { pageName?: string }) => (
            <p>previewing {pageName ?? '(no page)'}</p>
          )
        : // The publish sheet, stubbed only far enough to fire "Fix this". Its
        // blocking issues come from the WHOLE-SITE diff while the editor
        // context is page-scoped (D-C2), so the slot it hands back routinely
        // names a section on another page — the case that regressed.
        String(loader).includes('PublishSheet')
        ? ({
            onFixIssue,
            onGoToPages,
          }: {
            onFixIssue: (target: { pageId: string; slot: number }) => void;
            onGoToPages: () => void;
          }) => (
            <>
              <button
                type="button"
                onClick={() => {
                  /*
                   * The page is DERIVED from the offending block, not hardcoded.
                   *
                   * The real sheet reads `issue.pageId`, and the issue comes
                   * from whichever page's snapshot raised it — so a fixture that
                   * moves the block between pages must move the handoff with it.
                   * Hardcoding a page here would make the "stays put" case below
                   * fire a cross-page switch its fixture does not describe, and
                   * that case would then pass or fail for the wrong reason.
                   */
                  const offender = queries.draft.find((b) => b.blockOrder === FOREIGN_SLOT);
                  onFixIssue({
                    pageId: String(offender?.pageId ?? SECOND_PAGE_ID),
                    slot: FOREIGN_SLOT,
                  });
                }}
              >
                Fix this
              </button>
              {/*
               * The other half of the same seam. A page-set problem (duplicate
               * address, no home page) has no section slot, so "Fix this"
               * cannot reach it and this is the ONLY action the sheet offers.
               * A parent that forgot the prop used to make that action vanish
               * silently — no crash, no dead control — which is why the prop is
               * now required and why the composition is asserted here.
               */}
              <button type="button" onClick={() => onGoToPages()}>
                Go to Pages
              </button>
            </>
          )
        : () => null,
}));

/*
 * `toast.info` is what the selection repair speaks through, and it had ZERO
 * mock coverage anywhere in the repo — this file did not mock sonner at all, so
 * the call went to the real module and no test could see whether it fired.
 *
 * Every method the site-editor tree can reach is stubbed, not just the one used
 * here: corpus trap #3 — a factory missing an export yields `undefined` at call
 * time, which reads as an unrelated component breaking.
 */
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: {
    info: toastInfo,
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// The shell asks `(max-width: 767px)`: false = desktop. True would render the
// phone gate and there would be no top bar to assert on.
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => false,
  useIsDesktop: () => true,
}));

// `pageId` is REQUIRED on SiteBlockSummary (D13'), but `apps/web/tsconfig.json`
// includes only `src/**`, so nothing typechecks this file.
//
// This factory IS covered by D13's runtime tripwire, contrary to what stood
// here: the note claimed the throw "cannot fire on exactly the file that needs
// it" because the Canvas is mocked away. That stopped being true when the D-C2
// sixth-caller fix made `EditorRoot` itself call `blocksForPage` on every
// render, to narrow the list it hands the provider. A stale row in this file
// now throws from `EditorRoot`, with the Canvas still mocked.
//
// Defaulting to HOME_PAGE_ID (the page the shell seeds) rather than `null`
// matters: `blocksForPage` deliberately excludes unadopted (`null`) rows once a
// page is selected.
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
  /**
   * Null by default, which takes the degraded-canvas branch and keeps the whole
   * block-view tree out of this file. Supplied only by the preview case, where
   * `EditorRoot` gates the dialog on it being non-null.
   */
  canvasContext?: unknown;
}

function rootElement({
  initialPages = [seededHome],
  showWizardBanner = false,
  canvasContext = null,
}: RootOptions = {}) {
  return (
    <EditorRoot
      communityId={42}
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      proToolAccess={{ styling: true, domain: true }}
      hasPolishBlocks
      // Null on purpose by default: takes the degraded-canvas branch, so the
      // whole block-view tree stays out of this test.
      canvasContext={canvasContext as never}
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
    expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/no longer available/i));
  });

  it('stays QUIET when the PM deleted that page themselves', async () => {
    /*
     * Same repair, same destination — different story. The alarm above is
     * written for a co-manager's action; fired one tick after the PM's own
     * deliberate delete, on top of the "X was deleted." they already got, it
     * describes their own action back at them as if it were someone else's.
     * The alarm that matters is the one that never cries wolf.
     *
     * The repair itself must still RUN: the selection has to leave a page that
     * no longer exists. Only the announcement is suppressed, which is why both
     * halves are asserted here.
     *
     * Revert check (production line): `EditorRoot.tsx`'s
     * `if (selfInflicted) return;` in the repair effect. Removing only that
     * line turns this red and leaves the co-manager case above green.
     */
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];

    const { rerender } = renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    // The panel reports the hard delete, then the invalidated list comes back
    // without the page — the same two steps, in the same order, as production.
    await userEvent.click(screen.getByRole('button', { name: 'I deleted the second page' }));
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    // Repaired…
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
    // …silently.
    expect(toastInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId('site-page-announcement')).toHaveTextContent('');
  });

  it('names the page in the repair when the PM watched it go away', async () => {
    /*
     * `selfRemovedPageId` — the suppression the case above tests — only ever
     * covers the IMMEDIATE hard delete, by design: a staged removal leaves the
     * page in the list, so it triggers no repair at delete time. It triggers
     * one at PUBLISH time, and that is the MODAL path, because a published page
     * cannot be hard-deleted at all.
     *
     * So the PM staged a live page, published, was congratulated, and one beat
     * later got the alarm written for a co-manager's action. Not false — just
     * the wrong surface's copy, describing something they deliberately did as
     * something that befell them.
     *
     * Revert check (production line): `EditorRoot.tsx`'s
     * `selectedPageWasStagedRef.current ? … :` ternary in the repair effect,
     * collapsed to the unconditional co-manager sentence. Removing only that
     * turns this red and leaves both cases above green.
     */
    const stagedSecond = {
      ...seededHome,
      id: SECOND_PAGE_ID,
      name: 'Amenities',
      slug: 'amenities',
      isHome: false,
      deleteStagedAt: '2026-07-30T09:00:00.000Z',
    };
    queries.pages = [seededHome, stagedSecond];

    const { rerender } = renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    // The publish lands: `usePublishSite` invalidates `['pm','site']` and the
    // page leaves the list. No hard delete was ever reported, exactly as in
    // production.
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('"Amenities" has been removed'));
    expect(toastInfo).not.toHaveBeenCalledWith(expect.stringMatching(/no longer available/i));
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

describe('EditorRoot — the top bar names the page being edited', () => {
  // Nothing on screen said which page you were editing. The canvas is scrolled,
  // the Pages panel is behind a tab, and the Sections tool — the default — is
  // just a list of section types. So a PM could create a second page, click
  // back to Sections, and edit for an hour with no indication of the target,
  // while every write went to that page.
  //
  // Asserted through EditorRoot rather than against EditorTopBar directly, for
  // the reason this whole file exists: the shell's own tests pass every prop
  // explicitly, so they cannot see a parent that forgets one. That is exactly
  // how the Publish button shipped dead.
  //
  // Revert check (production line): `EditorRoot.tsx`'s `pageName={selectedPage?.name}`
  // on `<EditorShell>`. Removing only that line leaves `EditorTopBar` correct
  // and every EditorShell/TopBar assertion green, and turns both cases here red.
  beforeEach(() => {
    queries.draft = [hero(), block({ id: 1, pageId: HOME_PAGE_ID })];
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

  it('names the seeded home page before the PM has opened Pages at all', () => {
    renderRoot();

    expect(screen.getByTestId('editing-page-name')).toHaveTextContent('Home');
  });

  it('follows the selection to another page', async () => {
    renderRoot();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('editing-page-name')).toHaveTextContent('Amenities');
    // The heading is the route's identity and must NOT churn with the page —
    // it is the breadcrumb trail's leaf.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Website');
  });
});

describe('EditorRoot — the preview is titled after the page it renders', () => {
  // The seam, not the leaf. `PreviewDialog.test.tsx` proves the dialog USES
  // `pageName`; only this can prove `EditorRoot` passes it. Round 6 found the
  // top-bar half of the same fix had an EditorRoot test and the preview half
  // did not — the precise asymmetry that shipped the Publish button dead.
  //
  // Revert check (production line): `pageName={selectedPage?.name}` on
  // `<PreviewDialog>` in `EditorRoot.tsx`.
  it('hands the selected page name down when Preview is opened', async () => {
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
    // Non-null so the dialog branch is reachable at all; the stub ignores it.
    renderRoot({ canvasContext: {} });

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByText(/previewing Amenities/)).toBeInTheDocument();
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

  it('selects the offending section once the new page has mounted', async () => {
    // The other HALF of the fix above, missing for a round: the page switch
    // landed, and then nothing was selected — so the PM arrived on the right
    // page facing an undifferentiated list, with the issue naming "Section 7"
    // and no row anywhere showing a slot number.
    //
    // Revert check (production line, not this file):
    // `editor-context.tsx`'s `selectSlotOnMount` effect. Delete only the
    // `selectInternal(target.id)` line inside it and this goes red with
    // `aria-current` absent, while every other case in this describe stays
    // green — the switch and the same-page path do not go through it.
    renderRoot();

    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));

    // `select` reveals the Sections panel, and the offending row is the only
    // one on the page we were moved to. Matched loosely: the offending section
    // is an unpublished draft, so its row carries a "Draft" badge inside the
    // same button and its accessible name is "GalleryDraft".
    const row = await screen.findByRole('button', { name: /^Gallery/ });
    expect(row).toHaveAttribute('aria-current', 'true');
    // And nothing on the page we LEFT is selected — the remount discarded it.
    expect(screen.queryByRole('button', { name: /^Text/ })).not.toBeInTheDocument();
  });

  it('does not re-select the offending section after the PM moves on', async () => {
    /*
     * The mark is one-shot. Left armed, a later remount — an ordinary page
     * click, a refetch — would yank the selection back to a section the PM
     * dealt with minutes ago.
     *
     * **Honest limitation, found by round 6's fix-auditor:** this case has no
     * single revert target. By the time the second half runs, `onSlotSelected`
     * has already cleared `pendingSelectSlot` in the parent, so
     * `selectSlotOnMount` is `null` for every later provider instance —
     * meaning it stays green whether or not `consumedSlotRef` exists and
     * whether or not `handleSelectPage` clears the mark. It is a
     * belt-and-braces statement of the end state, not a guard on either
     * mechanism, and `setPendingSelectSlot(null)` in `handleSelectPage` remains
     * uncovered. Recorded rather than dressed up: claiming a revert target it
     * does not have is the round-3/4 mistake.
     */
    renderRoot();

    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));
    expect(await screen.findByRole('button', { name: /^Gallery/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Away and back again.
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(screen.getByRole('button', { name: /^Gallery/ })).not.toHaveAttribute('aria-current');
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

describe('EditorRoot — BOTH page reads fail', () => {
  /*
   * The seed returns `[]` on any error and the client query can fail for the
   * same reason — the same lock, the same database. `effectivePageId` is then
   * null, and `blocksForPage(blocks, null)` returns the list UNCHANGED: every
   * page's sections concatenated into one canvas, with no banner and no hint
   * that anything is wrong. Adds land on the live home page, and editing a
   * foreign section fails with "Position 7 is already used by another page" —
   * an instruction the editor offers no control to follow.
   *
   * `use-selected-site-page.tsx` states the invariant this violated in its own
   * header: the editor must not render block-editing affordances before it
   * knows which page is selected.
   *
   * Revert check (production line): `EditorRoot.tsx`'s
   * `const pagesUnavailable = effectivePageId === null && pagesFailed;` —
   * pinning it to `false` turns all three cases here red.
   */
  beforeEach(() => {
    queries.draft = [
      hero(),
      block({ id: 1, pageId: HOME_PAGE_ID }),
      block({ id: 2, pageId: SECOND_PAGE_ID, blockType: 'gallery', blockOrder: 3 }),
    ];
    queries.isError = true;
  });

  it('says so, rather than rendering a canvas of every page at once', () => {
    renderRoot({ initialPages: [] });

    expect(screen.getByTestId('pages-unavailable-banner')).toBeInTheDocument();
  });

  it('withholds the sections list instead of offering another page\'s rows', () => {
    renderRoot({ initialPages: [] });

    // Neither page's sections are listed — an unscoped list would show BOTH.
    expect(screen.queryByRole('button', { name: /^Text/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gallery/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sections are unavailable until/i)).toBeInTheDocument();
  });

  it('offers no Add panel, because a block written now would land on the home page', async () => {
    renderRoot({ initialPages: [] });

    await userEvent.click(screen.getByRole('tab', { name: 'Add' }));
    expect(screen.getByText(/Sections are unavailable until/i)).toBeInTheDocument();
  });

  it('leaves the editor alone while the pages query is merely still in flight', () => {
    /*
     * The control for the `pagesFailed` conjunct: blanking on
     * `pages === undefined` would flash a failure banner on every ordinary
     * first paint.
     *
     * `initialPages: []` is load-bearing and an earlier version of this case
     * omitted it. With the default seed, `homePageId` resolves from
     * `initialPages.find(isHome)` and `effectivePageId` is non-null — so
     * `pagesUnavailable` is already false through the FIRST conjunct, and the
     * case passed verbatim with `&& pagesFailed` deleted. An empty seed is the
     * only shape in which the second conjunct decides anything, and it is also
     * the only shape in which the flashing-banner scenario exists.
     */
    queries.isError = false;
    queries.isPending = true;
    renderRoot({ initialPages: [] });

    expect(screen.queryByTestId('pages-unavailable-banner')).not.toBeInTheDocument();
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

describe('EditorRoot — the row-focus flag is single-use', () => {
  /*
   * Both halves of this contract are the PARENT's, and neither is visible from
   * `PagesPanel.test.tsx`, which supplies the flag from its own JSX and so can
   * only ever exercise the value it chose.
   *
   * The defect this closes: `handleSelectPage` set the flag true and nothing
   * cleared it on the ordinary route out. `PagesPanel` renders behind
   * `if (tool === 'pages')`, so it unmounts on a tool switch — and the modal
   * journey (click a page, go to Sections to add content, come back) remounted
   * it with a stale `true` and yanked focus onto the row. That is exactly the
   * ambush the flag's own JSDoc says it prevents, and the panel's negative
   * control could not see it because it omits the prop, i.e. asserts `false` —
   * a value production only holds BEFORE the PM's first row click.
   */
  beforeEach(() => {
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];
  });

  it('asks for focus on the row the PM just clicked', async () => {
    // Revert check (production line): `restoreFocusToSelectedRow={focusSelectedRow}`
    // on `<PagesPanel>` in `EditorRoot.tsx`.
    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('pages-focus-flag')).toHaveTextContent('true');
  });

  it('does NOT ask again when the panel is merely reopened', async () => {
    /*
     * Revert check (production line, verified): `handleFocusRestored`'s
     * `setFocusSelectedRow(false)` in `EditorRoot.tsx`, neutered to `() => {}`.
     * This case goes red with `expect(element).toHaveTextContent()`; the case
     * above and all 51 siblings stay green.
     *
     * NOT the `onFocusRestored()` call in `PagesPanel.tsx`'s mount effect — an
     * earlier version of this comment claimed either would do, and running it
     * showed otherwise. The panel is STUBBED here, so its effect never runs;
     * removing that call reddens `PagesPanel.test.tsx` and leaves this file
     * entirely green. Two ends of one wire, one test and one revert target
     * each — which is the shape this suite keeps getting wrong by assuming
     * rather than running it.
     */
    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    // The real panel does this from its mount effect; the stub exposes it so
    // the parent's half can be driven without a DOM focus race.
    await userEvent.click(screen.getByRole('button', { name: 'Panel took the focus' }));

    // Off to Sections — which UNMOUNTS the panel — and back.
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));

    expect(screen.getByTestId('pages-focus-flag')).toHaveTextContent('false');
  });

  it('arms the flag even when the click does not change the page', async () => {
    /*
     * The parent's half of the hole the flag-keyed effect closes.
     *
     * `handleSelectPage` arms the flag on EVERY row click, including ones that
     * leave `effectivePageId` alone and therefore do not remount the panel
     * through `EditorRoot`'s `key`. This case drives the sharpest instance:
     * `selectedPageId` starts null while `effectivePageId` is ALREADY the
     * seeded home id, so clicking the home row moves `null → home.id` with
     * `effectivePageId` identical on both sides — no remount.
     *
     * That the flag is armed here is CORRECT and is not the defect; the defect
     * was that nothing consumed it, because the panel's consumer keyed on mount
     * rather than on the flag. This case pins the parent behaviour that makes
     * the panel-side deps array load-bearing. **The fix itself is pinned in
     * `PagesPanel.test.tsx`** (`'consumes a flag raised while it is already
     * mounted'`), because the panel is STUBBED here — a mount-only effect in the
     * real panel is invisible to this file, which is precisely why the first
     * version of this fix passed its EditorRoot tests while still latching.
     */
    renderRoot();
    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));

    expect(screen.getByTestId('pages-focus-flag')).toHaveTextContent('true');
  });
});

describe('EditorRoot — the publish sheet can reach the Pages panel', () => {
  it('opens the Pages tool when a page-set problem has no section to fix', async () => {
    /*
     * The other half of the "Fix this" seam. A page-set problem — a duplicate
     * address, two home pages, no home page — blocks a publish but has no
     * section slot, so `issueTarget` yields nothing and "Fix this" cannot be
     * rendered. `onGoToPages` is the ONLY action the sheet offers on that class
     * of issue, and while it was optional a parent that forgot it made that
     * action vanish silently: no crash, no dead control, just the
     * blocked-with-nothing-to-press state it was added to end.
     *
     * Revert check (production line): `onGoToPages={handleGoToPages}` on
     * `<PublishSheetMount>` in `EditorRoot.tsx`. (It is a required prop now, so
     * removing it is also a typecheck failure — but `__tests__` sits outside the
     * `src/**` program, and this file is what fails at RUNTIME.)
     */
    queries.draft = [hero()];
    queries.published = [];
    renderRoot();

    await userEvent.click(publishButton());
    await userEvent.click(screen.getByRole('button', { name: 'Go to Pages' }));

    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('EditorRoot — Preview is withheld when the page is unknown', () => {
  /*
   * The fourth surface `pagesUnavailable` has to withhold, and the one the
   * hand-written list forgot. It is also the worst of the four:
   * `blocksForPage(blocks, null)` returns every page's sections, so the dialog
   * rendered a site that exists at no URL, titled after the COMMUNITY because
   * there was no page to name it after, under a caption asserting "This is the
   * page you are editing… what visitors see once you publish" — beside a banner
   * saying we do not know which page that is.
   */
  it('disables the Preview button, with a reason', () => {
    // Revert check (production line): `canPreview={!pagesUnavailable}` on
    // `<EditorShell>` in `EditorRoot.tsx`.
    queries.isError = true;
    queries.pages = [];
    renderRoot({ initialPages: [], canvasContext: {} });

    const preview = screen.getByRole('button', { name: /Preview/ });
    expect(preview).toBeDisabled();
    expect(preview).toHaveAttribute('title', expect.stringMatching(/couldn't load/i));
  });

  it('does not render the dialog even if the open state is somehow reached', async () => {
    /*
     * Belt to the disabled button's braces, and NOT redundant: the two are
     * independent mechanisms and the render gate is the load-bearing one. A
     * later change that re-enables the button — or an `open` state left over
     * from before the read failed — must not put the lying preview back.
     *
     * Revert check (production line): the `&& !pagesUnavailable` conjunct on
     * the `<PreviewDialog>` render in `EditorRoot.tsx`. Removing it leaves the
     * button case above green.
     */
    queries.pages = [seededHome];
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: {} });
    // Open it while a page IS known…
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    // …then lose the pages underneath it, which is what a failed refetch does.
    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: {} }));
    });

    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
  });

  it('disables Preview when the canvas context is the thing that failed', () => {
    /*
     * The OTHER conjunct of the dialog's render gate. `canPreview` shipped as
     * `!pagesUnavailable` alone, so when `canvasContext` is null — the community
     * row could not be read, and the canvas already renders "We couldn't load
     * this community's site settings." — the button stayed ENABLED over a gate
     * that would never let the dialog render. Pressing it did nothing at all,
     * which is the shape `EditorTopBarProps` codifies as strictly worse than
     * disabled.
     *
     * Pages are healthy here, which is what isolates this from the case above.
     *
     * Revert check (production line): the `&& canvasContext !== null` conjunct
     * on `canPreview` in `EditorRoot.tsx`. The two cases above stay green — they
     * drive the page-read failure, where the first conjunct already decides it.
     */
    queries.pages = [seededHome];
    renderRoot({ initialPages: [seededHome], canvasContext: null });

    expect(screen.getByRole('button', { name: /Preview/ })).toBeDisabled();
  });

  it('does not spring the dialog back open when the pages read recovers', async () => {
    /*
     * Withholding a surface and forgetting the state that opened it is a
     * DEFERRED POP-UP, not a gate. The render condition suppressed the dialog
     * while `pagesUnavailable` was true but left `previewOpen` true underneath
     * — so the moment a retry succeeded, the dialog reappeared over whatever the
     * PM had moved on to, dismissed by nobody.
     *
     * Revert check (production line): the `if (pagesUnavailable)
     * setPreviewOpen(false);` effect in `EditorRoot.tsx`. The two cases above
     * stay green without it — neither reaches the recovery leg.
     */
    queries.pages = [seededHome];
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: {} });
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    // The read fails…
    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: {} }));
    });
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();

    // …and the PM's retry succeeds.
    queries.isError = false;
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome], canvasContext: {} }));
    });

    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();
  });

  it('does NOT grab focus when the read fails on first paint', async () => {
    /*
     * The `previewOpenRef` guard. This effect also runs on a first paint that
     * fails, where nothing had focus to lose — grabbing it there is the ambush
     * the guard exists to prevent, and the guard was pinned by nothing: removing
     * it left all 624 cases green.
     *
     * Revert check (production line): the `if (previewOpenRef.current)` guard in
     * `EditorRoot.tsx`'s preview-gate effect.
     */
    queries.isError = true;
    queries.pages = [];
    renderRoot({ initialPages: [], canvasContext: {} });

    expect(await screen.findByRole('button', { name: /Try again/ })).not.toHaveFocus();
  });

  it('hands focus BACK to Preview once the read recovers', async () => {
    /*
     * The return leg. The gate takes focus to "Try again" — and pressing it
     * unmounts the banner that holds it, dropping the PM on `<body>`: the exact
     * state the gate exists to prevent, on the way out of the same round trip.
     * The JSDoc argues the destination is right because it "is the only
     * actionable control on the surface that replaces the editor"; that argument
     * applies verbatim to leaving.
     *
     * Revert check (production line): the return-leg effect in `EditorRoot.tsx`
     * (`if (!previewGateTookFocusRef.current) return;` … focus Preview). The
     * entry-leg case below stays green without it.
     */
    queries.pages = [seededHome];
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: {} });
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }));

    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: {} }));
    });
    expect(await screen.findByRole('button', { name: /Try again/ })).toHaveFocus();

    // …the PM retries and it works.
    queries.isError = false;
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome], canvasContext: {} }));
    });

    expect(await screen.findByRole('button', { name: /Preview/ })).toHaveFocus();
  });

  it('blames the failure that actually happened', async () => {
    /*
     * `canPreview` covers two conjuncts; the explanation covered one. With the
     * community row unread but the pages fine, the disabled button read "We
     * couldn't load this site's pages" on a screen where the Pages panel works
     * and the top bar is naming the selected page — telling the PM to retry a
     * read that did not fail.
     *
     * Revert check (production line): the `previewDisabledReason` ternary on
     * `<EditorShell>` in `EditorRoot.tsx`, pinned to the pages sentence.
     */
    queries.pages = [seededHome];
    renderRoot({ initialPages: [seededHome], canvasContext: null });

    expect(screen.getByRole('button', { name: /Preview/ })).toHaveAttribute(
      'title',
      expect.stringMatching(/site settings/i),
    );
  });

  it('lands keyboard focus on the retry, not on <body>, when it closes the dialog', async () => {
    /*
     * The gate UNMOUNTS the dialog rather than closing it through Radix. Radix's
     * `FocusScope` cleanup then restores focus to the element it stored on open
     * — the Preview button — which the same render has just DISABLED via
     * `canPreview`. `focus()` on a disabled button is a no-op, so a keyboard PM
     * lands on `<body>`, at the top of a document whose main surface has just
     * been replaced by a danger banner and a retry they now have to find.
     *
     * Fixing the state without the focus is half a fix: the first version of
     * this gate cleared `previewOpen` and left the PM stranded.
     *
     * Revert check (production line): the `queueMicrotask(() =>
     * retryPagesRef.current?.focus())` in `EditorRoot.tsx`'s preview-gate
     * effect. The state-only cases above stay green without it.
     */
    queries.pages = [seededHome];
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: {} });
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: {} }));
    });

    expect(await screen.findByRole('button', { name: /Try again/ })).toHaveFocus();
  });
});

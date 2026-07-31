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
import { render, screen } from '@testing-library/react';
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

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) =>
    String(loader).includes('PagesPanel')
      ? ({
          selectedPageId,
          onSelectPage,
        }: {
          selectedPageId: number | null;
          onSelectPage: (pageId: number) => void;
        }) => (
          <div>
            <p>Editing page {String(selectedPageId)}</p>
            <button type="button" onClick={() => onSelectPage(SECOND_PAGE_ID)}>
              Edit the second page
            </button>
          </div>
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

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
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
    data: queries.isPending || queries.isError ? undefined : [],
  }),
  useCreateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderSitePages: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUnstageSitePageDelete: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

function renderRoot() {
  return render(
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
      showWizardBanner={false}
      // The server seed. Its only job here is to supply the home page id before
      // the Pages panel has ever been opened — that id is what every block
      // write is scoped by.
      initialPages={[
        {
          id: HOME_PAGE_ID,
          name: 'Home',
          slug: '',
          inNav: true,
          sortOrder: 0,
          isHome: true,
          isDraft: false,
          publishedAt: '2026-07-01T00:00:00.000Z',
          deleteStagedAt: null,
        },
      ]}
    />,
  );
}

function publishButton() {
  return screen.getByRole('button', { name: /Publish/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = [];
  queries.published = [];
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
    renderRoot();
    await selectTheTextSection();

    await userEvent.click(screen.getByRole('tab', { name: 'Pages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('tab', { name: /Sections/ }));

    expect(sectionRow()).not.toHaveAttribute('aria-current');
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

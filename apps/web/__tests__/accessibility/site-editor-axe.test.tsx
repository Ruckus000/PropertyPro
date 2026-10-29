/**
 * Accessibility audit — website editor v3 surfaces.
 *
 * A sibling of `axe-audit.test.tsx` rather than an extension of it. The editor's
 * surfaces need `@/hooks/use-content-blocks` mocked, and `vi.mock` is
 * file-scoped and hoisted — adding that mock to `axe-audit.test.tsx` would
 * silently apply it to the auth, maintenance, marketing and settings suites
 * that share the file.
 *
 * The surfaces are rendered inside a REAL `SiteEditorProvider`, not a mocked
 * context, because the thing under test here is the composed accessibility tree
 * (the live region, the section grouping, the inspector's landmark) rather than
 * any single component's markup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SiteEditorProvider } from '@/components/pm/site-editor-v3/editor-context';
import { UndoableRemoveProvider } from '@/components/pm/site-editor-v3/undoable-remove-context';
import { Inspector } from '@/components/pm/site-editor-v3/Inspector';
import { HeroForm } from '@/components/pm/site-editor-v3/inspector/forms/HeroForm';
import { BoardForm } from '@/components/pm/site-editor-v3/inspector/forms/BoardForm';
import { QuickLinksForm } from '@/components/pm/site-editor-v3/inspector/forms/QuickLinksForm';
import { ContactForm } from '@/components/pm/site-editor-v3/inspector/forms/ContactForm';
import { SorEmptyTextForm } from '@/components/pm/site-editor-v3/inspector/forms/SorEmptyTextForm';
import { SectionSourcesProvider } from '@/components/pm/site-editor-v3/inspector/section-sources-context';
import { LinkedFactsProvider } from '@/components/pm/site-editor-v3/inspector/linked-facts-context';
import { SectionShell } from '@/components/pm/site-editor-v3/canvas/SectionShell';
import { UrgentNoticePanel } from '@/components/pm/site-editor-v3/panels/UrgentNoticePanel';
import { SitePanel } from '@/components/pm/site-editor-v3/panels/SitePanel';
import { PagesPanel } from '@/components/pm/site-editor-v3/panels/PagesPanel';
import { EditorShell } from '@/components/pm/site-editor-v3/EditorShell';
import { Canvas } from '@/components/pm/site-editor-v3/canvas/Canvas';
import { AddPartDialog } from '@/components/pm/site-editor-v3/AddPartDialog';
import { RecordsAttention } from '@/components/pm/site-editor-v3/RecordsAttention';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import type { SitePageSummary } from '@/hooks/use-site-pages';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { UrgentNoticeBanner } from '@/components/public-site/UrgentNoticeBanner';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// Radix Switch (shadcn), used by the Phase 8 Site panel, requires
// ResizeObserver in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock this module COMPLETELY. A partial factory here fails only at module
// load, and only for whichever component reaches the missing export — so it
// reads as an unrelated component breaking rather than a mock being short.
// Anything FloatControls' undo path reaches has to be listed.
// The block list the canvas and the Add a part catalog read. Empty unless a
// case sets it.
const contentBlocks = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  // Phase 11b-3: the Pages panel reads the block list so the permanent-delete
  // dialog can say how many sections go with the page (D36′). Empty there — the
  // audit is of the list's markup, not of a count.
  useContentBlocks: () => ({ data: contentBlocks.data, isPending: false, isError: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
  addSectionMutationKey: (communityId: number) => ['site-editor', 'add-section', communityId],
  useAddSectionInFlight: () => false,
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// The hero form writes through its own endpoint, and its photo field reaches the
// upload queue. Same rule as above — each module COMPLETELY.
vi.mock('@/hooks/use-hero-block', () => ({
  useHeroBlock: () => ({ data: null }),
  useUpdateHeroBlock: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-hero-photos', () => ({
  useHeroPhotos: () => ({ uploads: [], upload: vi.fn(), dismiss: vi.fn(), isUploading: false }),
}));

// Phase 8. Same rule as above — mock the module COMPLETELY.
vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: () => ({
    data: {
      settings: {
        seoTitle: null,
        seoDescription: null,
        searchIndexing: true,
        favicon: null,
        shareImage: null,
      },
      footer: { associationName: null, note: null, showStatutoryLine: false },
      // With a quota, so the storage meter's progressbar is inside the audit.
      storage: { assetsBytesUsed: 250 * 1024 * 1024, quotaBytes: 500 * 1024 * 1024 },
    },
  }),
  useUpdateSiteSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadFavicon: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadShareImage: () => ({ mutate: vi.fn(), isPending: false }),
  siteSettingsQueryKey: (communityId: number) =>
    ['pm', 'site', 'settings', communityId] as const,
}));

// Phase 7. Same rule as above — every export the notice panel's tree reaches.
vi.mock('@/hooks/use-urgent-notice', () => ({
  useUrgentNotice: () => ({ data: null }),
  useSetUrgentNotice: () => ({ mutate: vi.fn(), isPending: false }),
  useClearUrgentNotice: () => ({ mutate: vi.fn(), isPending: false }),
  urgentNoticeQueryKey: (communityId: number) =>
    ['pm', 'site', 'urgent-notice', communityId] as const,
}));

// Phase 11b-3. Same rule as above — mock the module COMPLETELY.
const sitePagesMock = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
}));
vi.mock('@/hooks/use-site-pages', () => ({
  useSitePages: () => ({
    data: sitePagesMock.data,
    isPending: sitePagesMock.isPending,
    isError: sitePagesMock.isError,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useReorderSitePages: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUnstageSitePageDelete: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  applyPageOrder: (pages: unknown) => pages,
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId] as const,
}));

// The top bar's missing-records link. Same rule — the module COMPLETELY.
vi.mock('@/hooks/use-records-alert', () => ({
  recordsAlertQueryKey: (communityId: number) => ['pm', 'site', 'records-alert', communityId],
  useRecordsAlert: () => ({
    data: { missingCount: 3, snoozedUntil: null },
    snooze: { mutate: vi.fn(), isPending: false },
  }),
}));

// The inspector docks at >=1280px; false = wide. Both modes are audited.
const isNarrowMock = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => isNarrowMock.value,
  useIsDesktop: () => !isNarrowMock.value,
}));

// `pageId` is REQUIRED on SiteBlockSummary (D13'), but `apps/web/tsconfig.json`
// includes only `src/**`, so nothing typechecks this file — a missing `pageId`
// would silently yield `undefined` and `blocksForPage` would throw the first
// time these rows reached a page-scoped surface. It is a real page id, not
// `null`: `blocksForPage` deliberately EXCLUDES unadopted (`null`) rows when a
// page is selected, so `null` here would make the whole fixture vanish rather
// than render. 1 is SITE_PAGES[0] below, the home page.
const FIXTURE_PAGE_ID = 1;

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    pageId: FIXTURE_PAGE_ID,
    blockType: 'text',
    blockOrder: overrides.id,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

const BLOCKS: SiteBlockSummary[] = [
  block({ id: 1, blockType: 'hero', blockOrder: 1 }),
  block({ id: 2, blockType: 'text', blockOrder: 2 }),
  block({ id: 3, blockType: 'image', blockOrder: 3, isDraft: true }),
  block({ id: 4, blockType: 'faq', blockOrder: 4 }),
];

function renderEditorSurfaces() {
  return render(
    <UndoableRemoveProvider communityId={7}>
    <SiteEditorProvider communityId={7} blocks={BLOCKS}>
      <div>
        <div>
          {BLOCKS.map((b) => (
            <SectionShell key={b.id} block={b} communityId={7}>
              <p>{b.blockType} section body</p>
            </SectionShell>
          ))}
        </div>
        <Inspector communityId={7} />
      </div>
    </SiteEditorProvider>
    </UndoableRemoveProvider>,
  );
}

const SITE_PAGES: SitePageSummary[] = [
  {
    id: 1,
    name: 'Home',
    slug: '',
    inNav: true,
    sortOrder: 0,
    isHome: true,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 2,
    name: 'Amenities',
    slug: 'amenities',
    inNav: false,
    sortOrder: 1,
    isHome: false,
    isDraft: true,
    publishedAt: null,
    deleteStagedAt: null,
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 3,
    name: 'Board',
    slug: 'board',
    inNav: true,
    sortOrder: 2,
    isHome: false,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: '2026-07-30T00:00:00.000Z',
    seoTitle: null,
    seoDescription: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  isNarrowMock.value = false;
  sitePagesMock.data = SITE_PAGES;
  sitePagesMock.isPending = false;
  sitePagesMock.isError = false;
  contentBlocks.data = [];
});

describe('Website editor v3 — axe', () => {
  it('has no violations with nothing selected', async () => {
    const { container } = renderEditorSurfaces();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with a section selected (docked inspector)', async () => {
    const user = userEvent.setup();
    const { container } = renderEditorSurfaces();

    await user.click(screen.getByRole('group', { name: 'Text section' }));
    // The inspector is now open as a docked landmark.
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    // The per-block form is code-split. Auditing before it resolves would
    // audit the loading skeleton and pass for the wrong reason.
    await screen.findByLabelText(/Body/);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with a section selected (overlay inspector)', async () => {
    isNarrowMock.value = true;
    const user = userEvent.setup();
    const { baseElement } = renderEditorSurfaces();

    await user.click(screen.getByRole('group', { name: 'Text section' }));
    // The overlay is code-split; auditing before it resolves would audit an
    // empty placeholder and pass for the wrong reason.
    await screen.findByRole('dialog');
    // ...and wait for the code-split form inside it, for the same reason.
    await screen.findByLabelText(/Body/);

    // Radix portals the sheet outside the container, so audit baseElement.
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('Website builder v4 chrome — axe', () => {
  function renderChrome() {
    // Inside `<main>`, as `EditorFrame` renders it in the app — the picker case
    // audits `baseElement`, where content outside a landmark is a violation.
    return render(
      <main>
      <UndoableRemoveProvider communityId={7}>
        <SiteEditorProvider communityId={7} blocks={BLOCKS}>
          <EditorShell
            communityName="Sunset Condos"
            pageName="Home"
            pages={SITE_PAGES}
            selectedPageId={1}
            onSelectPage={() => {}}
            onManagePages={() => {}}
            changeCount={2}
            device="desktop"
            onDeviceChange={() => {}}
            publicSiteUrl={null}
            view="website"
            onViewChange={() => {}}
            settings={null}
            help={null}
            helpOpen={false}
            onHelpToggle={() => {}}
            communityId={7}
            hasPublishedSite
            initialNotice={null}
            records={<RecordsAttention communityId={7} enabled />}
            canOpenPublish
            canPreview
            previewDisabledReason=""
            previewButtonRef={null}
            onPreview={() => {}}
            onPublish={() => {}}
          >
            <div>
              {BLOCKS.map((b) => (
                <SectionShell key={b.id} block={b} communityId={7}>
                  <p>{b.blockType} section body</p>
                </SectionShell>
              ))}
            </div>
          </EditorShell>
        </SiteEditorProvider>
      </UndoableRemoveProvider>
      </main>,
    );
  }

  it('has no violations in the top bar and page, with the missing-records link', async () => {
    const { container } = renderChrome();
    // Anti-vacuity: the surfaces under audit actually rendered.
    expect(screen.getByRole('navigation', { name: 'Website areas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish 2 changes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3 missing records' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with the Editing page picker open', async () => {
    const user = userEvent.setup();
    const { baseElement, container } = renderChrome();
    await user.click(screen.getByRole('button', { name: /Editing page/ }));
    // The list is PORTALLED out of `container`, so the audit must run on
    // `baseElement` or it silently audits everything except the picker.
    const list = screen.getByRole('list', { name: 'Pages' });
    expect(container.contains(list)).toBe(false);
    expect(baseElement.contains(list)).toBe(true);
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('has no violations on a hidden, selected section', async () => {
    const user = userEvent.setup();
    const hiddenBlocks = [
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 2, blockType: 'text', blockOrder: 2, content: { hidden: true } }),
    ];
    const { container } = render(
      <UndoableRemoveProvider communityId={7}>
        <SiteEditorProvider communityId={7} blocks={hiddenBlocks}>
          {hiddenBlocks.map((b) => (
            <SectionShell key={b.id} block={b} communityId={7}>
              <p>{b.blockType} section body</p>
            </SectionShell>
          ))}
        </SiteEditorProvider>
      </UndoableRemoveProvider>,
    );
    await user.click(screen.getByRole('group', { name: 'Text section' }));
    const placeholder = screen.getByTestId('hidden-section-placeholder');
    // Anti-vacuity: the inline control cluster is what this case audits.
    expect(within(placeholder).getByRole('button', { name: 'Show Text section' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Add a part — axe (combined plan Task 28)', () => {
  const CANVAS: CanvasContext = {
    community: {
      id: 7,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      shortName: null,
      logoUrl: null,
      communityType: 'condo_718',
      city: null,
      state: null,
      unitCount: null,
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
      announcements: [],
      documents: [],
      meetings: [],
      contact: { management: null, board: [], address: null, officeHours: null },
    },
    ownerRecordGroups: [],
  };
  const PAGE_BLOCKS = [
    block({ id: 1, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome home' } }),
    block({ id: 2, blockOrder: 2, content: { heading: 'Pool rules', body: 'No glass by the pool.' } }),
    block({ id: 3, blockOrder: 3, content: { heading: 'Lobby hours', body: 'Open 8 to 6.' } }),
  ];

  /** The canvas and the dialog, wired the way `EditorRoot` wires them. */
  function AddPartHarness() {
    const [open, setOpen] = useState(false);
    const [before, setBefore] = useState<number | null>(null);
    const opener = useRef<HTMLElement | null>(null);
    return (
      <main>
        <UndoableRemoveProvider communityId={7}>
          <SelectedSitePageProvider pageId={FIXTURE_PAGE_ID}>
            <SiteEditorProvider communityId={7} blocks={PAGE_BLOCKS}>
              <Canvas
                communityId={7}
                context={CANVAS}
                onAddSection={(blockId, el) => {
                  opener.current = el;
                  setBefore(blockId);
                  setOpen(true);
                }}
              />
              {open ? (
                <AddPartDialog
                  onOpenChange={setOpen}
                  restoreFocusTo={opener}
                  communityId={7}
                  // Locked rows (and their plan badge) are part of what is audited.
                  hasPolishBlocks={false}
                  insertBefore={before}
                  onInsertConsumed={() => {}}
                  onGoToPages={() => {}}
                />
              ) : null}
            </SiteEditorProvider>
          </SelectedSitePageProvider>
        </UndoableRemoveProvider>
      </main>
    );
  }

  it('has no violations on the page with its "Add a part" buttons', async () => {
    contentBlocks.data = PAGE_BLOCKS;
    const { container } = render(<AddPartHarness />);
    // Anti-vacuity: real sections, and a button between each pair and at the end.
    expect(screen.getAllByRole('group', { name: 'Text section' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Add a part/ })).toHaveLength(3);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with the Add a part dialog open', async () => {
    contentBlocks.data = PAGE_BLOCKS;
    const user = userEvent.setup();
    const { baseElement } = render(<AddPartHarness />);

    await user.click(screen.getByRole('button', { name: 'Add a part after Welcome' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a part' });
    // Anti-vacuity: the catalog rendered inside it, locked rows included.
    expect(within(dialog).getByTestId('add-section-text')).toBeInTheDocument();
    expect(within(dialog).getByTestId('add-section-faq')).toBeDisabled();
    // Radix portals the dialog out of the container, so audit baseElement.
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('Urgent notice — axe (Phase 7)', () => {
  it('has no violations in the notice tool panel', async () => {
    const { container } = render(
      <UrgentNoticePanel communityId={7} hasPublishedSite initialNotice={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the "publish first" state', async () => {
    const { container } = render(
      <UrgentNoticePanel communityId={7} hasPublishedSite={false} initialNotice={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations on the PUBLIC banner', async () => {
    // The banner is the surface a resident meets, so it gets its own audit
    // rather than riding on the editor's.
    const { container } = render(
      <UrgentNoticeBanner
        notice={{ urgentNoticeText: 'Boil water order in effect', urgentNoticeExpiresAt: null }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Pages panel — axe (Phase 11b-3)', () => {
  /*
   * Every DATA state, and the disclosure states that contain form controls.
   *
   * The data states — loading skeleton, error banner, empty — are what a PM
   * meets on a bad connection, and an unlabelled control there is exactly as
   * inaccessible as one in the list.
   *
   * The disclosure states are where the markup actually is, and for a while
   * they were audited nowhere. Every `Input`, `Label`, `role="alert"`,
   * `aria-pressed` toggle and destructive button this phase added lives inside
   * either the expanded row editor or the add form, and both are collapsed on
   * first paint — so four green audits covered a panel whose forms no audit had
   * ever seen.
   *
   * An axe audit has no single-line revert target, so instead: ANTI-VACUITY,
   * verified by running it. Dropping `htmlFor` from the expanded editor's
   * `Page name` label reddens BOTH expanded cases and leaves all four collapsed
   * audits GREEN — the proof they see markup no existing case could.
   *
   * The two reds are not the same kind, and saying so matters: the first fails
   * at `toHaveNoViolations` (a genuine axe orphaned-label violation), the second
   * fails EARLIER, at `getByLabelText('Page name')`, before axe runs at all. So
   * the second case's axe assertion is not what that probe exercises.
   *
   * **Each of the other two cases carries its OWN probe, and the probes are not
   * interchangeable.** The add-form and staged-row bodies are different
   * containers and stay green under the `htmlFor` one. Citing a single probe
   * for all four is the mistake this file has already made twice.
   *
   * The STAGED row's expanded editor is a structurally different body — no
   * name/slug inputs, a cancel-removal control instead — so it gets its own case
   * rather than riding on the draft row's.
   */
  function renderPages(selectedPageId: number | null = 1) {
    return render(
      <PagesPanel
        communityId={7}
        selectedPageId={selectedPageId}
        restoreFocusToSelectedRow={false}
        onFocusRestored={vi.fn()}
        onSelectPage={vi.fn()}
        onPageRemoved={vi.fn()}
      />,
    );
  }

  it('has no violations with the page list loaded', async () => {
    const { container } = renderPages();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations while the list is loading', async () => {
    sitePagesMock.isPending = true;
    sitePagesMock.data = undefined;
    const { container } = renderPages(null);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when the read failed', async () => {
    sitePagesMock.isError = true;
    sitePagesMock.data = undefined;
    const { container } = renderPages(null);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the empty state', async () => {
    sitePagesMock.data = [];
    const { container } = renderPages(null);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in an expanded page editor', async () => {
    // Page 2 is a DRAFT, so this reaches the widest form: the name field, the
    // address field (D32′ renders it only on a never-published page), the
    // nav-visibility toggle and the destructive remove button.
    const user = userEvent.setup();
    const { container } = renderPages(2);

    await user.click(screen.getByTestId('site-page-settings-2'));
    await screen.findByTestId('site-page-editor-2');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the expanded editor while both fields are refused', async () => {
    // The error state, not just the resting one: `aria-invalid`,
    // `aria-describedby` and the `role="alert"` text only exist once a value is
    // rejected, so the resting audit cannot see them.
    const user = userEvent.setup();
    const { container } = renderPages(2);

    await user.click(screen.getByTestId('site-page-settings-2'));
    const editor = within(await screen.findByTestId('site-page-editor-2'));
    // "Home" is page 1's name — LIVE and un-staged, so it is genuinely taken.
    //
    // This used to type "Board", page 3's name, and the comment called it "a
    // real clash". It is not: page 3 carries `deleteStagedAt`, `pageIssues`
    // builds `seenNames` only from `live` (`pages.ts` — `const live =
    // pages.filter((page) => !page.deleteStaged)`), and a staged page's NAME is
    // deliberately free (no unique index — `toValidationShape` says so). So no
    // name issue was raised at all, the alert assertion below was satisfied by
    // the SLUG alert alone, and the name field's `aria-invalid` /
    // `aria-describedby` / `role="alert"` triple — the whole reason this case
    // exists — was audited nowhere in the suite.
    await user.clear(editor.getByLabelText('Page name'));
    await user.type(editor.getByLabelText('Page name'), 'Home');
    await user.clear(editor.getByLabelText('Web address'));
    await user.type(editor.getByLabelText('Web address'), 'board');

    // BOTH, counted — `toBeGreaterThan(0)` was satisfied by either one alone,
    // which is how the name half went unaudited while the case was named for it.
    expect(editor.getAllByRole('alert')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the expanded editor of a page staged for removal', async () => {
    // Page 3 carries `deleteStagedAt`, which suppresses the name and address
    // controls entirely (renaming a page on its way out is not a thing the
    // panel offers) and puts a cancel-removal control in their place. Different
    // markup, so a different audit — and the `htmlFor` probe above cannot reach
    // it, since this body has no labelled input at all.
    //
    // Anti-vacuity for THIS case, verified: wrapping "Cancel removal" in an
    // `aria-hidden` span (leaving the button with no accessible name) reddens
    // this case and nothing else — 1 failed / 15 passed.
    const user = userEvent.setup();
    const { container } = renderPages(3);

    await user.click(screen.getByTestId('site-page-settings-3'));
    await screen.findByTestId('site-page-editor-3');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the add-a-page form', async () => {
    // Anti-vacuity for THIS case, verified: wrapping the SUBMIT BUTTON's label
    // (`{createPage.isPending ? 'Adding…' : 'Add page'}`) in an
    // `<span aria-hidden="true">` leaves the button with no accessible name —
    // 1 red / 15 passed, and the red is at `toHaveNoViolations`.
    //
    // NOT `htmlFor` on this form's own `Page name` label, which was the first
    // probe recorded here and does not prove what it claims: it reddens this
    // case at `findByLabelText` two lines below, BEFORE axe runs, leaving the
    // axe assertion unexercised. That is exactly the distinction the header
    // draws for the expanded cases — written, and then not applied here.
    const user = userEvent.setup();
    const { container } = renderPages();

    await user.click(screen.getByRole('button', { name: 'Add a page' }));
    await screen.findByLabelText('Page name');

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Site settings + footer — axe (Phase 8)', () => {
  const community = {
    name: 'Sunset Condos',
    slug: 'sunset-condos',
    communityType: 'condo_718' as const,
    city: 'Miami',
  };

  it.each(['search', 'footer'] as const)(
    'has no violations in the site %s form',
    async (part) => {
      const { container } = render(
        <SitePanel communityId={7} community={community} tagline={null} part={part} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('has no violations on the PUBLIC footer, with every optional line shown', async () => {
    // The footer is a surface residents and the public meet, so it gets its
    // own audit rather than riding on the editor's — and it is audited in its
    // fullest form, since the extra lines are the part this phase added.
    const { container } = render(
      <PublicSiteFooter
        communityName="Sunset Condos"
        associationName="Sunset Condominium Association, Inc."
        note="Managed by Acme Property Group."
        showStatutoryLine
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Website builder writers — axe', () => {
  // Each form is rendered on its own, in the state a manager meets it in, and
  // something only that state draws is found BEFORE the audit: an audit of a
  // skeleton or an empty tree passes for the wrong reason.

  it('has no violations in the Quick links form', async () => {
    const { container } = render(
      <QuickLinksForm communityId={7} blockType="quicklinks" blockOrder={4} content={{}} />,
    );
    expect(screen.getByText(/Quick links fills itself in/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the Board members form', async () => {
    const { container } = render(
      <BoardForm
        communityId={7}
        blockType="board"
        blockOrder={5}
        content={{ heading: 'Our board' }}
      />,
    );
    expect(screen.getByLabelText('Heading')).toHaveValue('Our board');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the hero form with linked fields and a stock photo', async () => {
    const { container } = render(
      <LinkedFactsProvider
        facts={{
          name: 'Harbor Pointe Condominium Association, Inc.',
          shortName: 'Harbor Pointe',
          city: 'Miami',
          unitCount: 120,
        }}
      >
        <SectionSourcesProvider
          layoutId="bayfront"
          contact={null}
          ownerRecordGroups={null}
          recordsApply
        >
          <HeroForm
            communityId={7}
            blockType="hero"
            blockOrder={1}
            content={{
              headline: 'Welcome to {{name}}',
              subtitle: '{{units}} homes in {{city}}. Notices and records.',
              photos: [
                { stock: 'sunset', alt: 'Sunset over the water' },
                { path: '7/hero/pool.jpg', alt: 'The pool' },
              ],
            }}
          />
        </SectionSourcesProvider>
      </LinkedFactsProvider>,
    );
    // The preview lines, the chips and insert buttons, "Use the look's wording",
    // the stock photo's own controls and the upload's.
    expect(screen.getByText('Shows as: Welcome to Harbor Pointe')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-linked-field]').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Insert the community name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Use the look's wording" })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Replace the sunset photo with your own')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the Documents panel, with its categories and the owners\' records', async () => {
    const { container } = render(
      <SectionSourcesProvider
        layoutId="bayfront"
        contact={null}
        ownerRecordGroups={[{ label: 'Budgets', postedCount: 3 }]}
        recordsApply
      >
        <SorEmptyTextForm
          communityId={7}
          blockType="documents"
          blockOrder={6}
          content={{ limit: 5, includeCategories: ['budget'] }}
        />
      </SectionSourcesProvider>,
    );
    expect(screen.getByRole('group', { name: 'Which documents to list' })).toBeInTheDocument();
    expect(screen.getByText('Budgets · 3')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the Documents panel with nothing checked', async () => {
    const { container } = render(
      <SorEmptyTextForm communityId={7} blockType="documents" blockOrder={6} content={{ limit: 5 }} />,
    );
    expect(screen.getByText('Nothing is checked, so this section lists no documents.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the Announcements panel', async () => {
    const { container } = render(
      <SorEmptyTextForm communityId={7} blockType="announcements" blockOrder={6} content={{}} />,
    );
    expect(screen.getByRole('link', { name: 'Write an announcement' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the Contact panel listing what the profile lacks', async () => {
    const { container } = render(
      <SectionSourcesProvider
        layoutId={null}
        contact={{ management: null, address: null, officeHours: null }}
        ownerRecordGroups={null}
        recordsApply
      >
        <ContactForm communityId={7} blockType="contact" blockOrder={3} content={{}} />
      </SectionSourcesProvider>,
    );
    expect(screen.getByText("Office hours aren't added yet, so they're hidden")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

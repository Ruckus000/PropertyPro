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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SiteEditorProvider } from '@/components/pm/site-editor-v3/editor-context';
import { UndoableRemoveProvider } from '@/components/pm/site-editor-v3/undoable-remove-context';
import { SectionList } from '@/components/pm/site-editor-v3/panels/SectionList';
import { Inspector } from '@/components/pm/site-editor-v3/Inspector';
import { SectionShell } from '@/components/pm/site-editor-v3/canvas/SectionShell';
import { UrgentNoticePanel } from '@/components/pm/site-editor-v3/panels/UrgentNoticePanel';
import { SitePanel } from '@/components/pm/site-editor-v3/panels/SitePanel';
import { PagesPanel } from '@/components/pm/site-editor-v3/panels/PagesPanel';
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
vi.mock('@/hooks/use-content-blocks', () => ({
  // Phase 11b-3: the Pages panel reads the block list so the permanent-delete
  // dialog can say how many sections go with the page (D36′). Empty here — the
  // audit is of the list's markup, not of a count.
  useContentBlocks: () => ({ data: [] }),
  useReorderBlocks: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// Phase 8. Same rule as above — mock the module COMPLETELY.
vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: () => ({
    data: {
      settings: { seoTitle: null, seoDescription: null, searchIndexing: true, favicon: null },
      footer: { associationName: null, note: null, showStatutoryLine: false },
    },
  }),
  useUpdateSiteSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadFavicon: () => ({ mutate: vi.fn(), isPending: false }),
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
        <SectionList />
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
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  isNarrowMock.value = false;
  sitePagesMock.data = SITE_PAGES;
  sitePagesMock.isPending = false;
  sitePagesMock.isError = false;
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
   * The add-form case stays GREEN under that same probe — it is a different
   * container — so its non-vacuity is pinned separately below.
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
    // "Board" is page 3's name — a real clash, reported on both surfaces.
    await user.clear(editor.getByLabelText('Page name'));
    await user.type(editor.getByLabelText('Page name'), 'Board');
    await user.clear(editor.getByLabelText('Web address'));
    await user.type(editor.getByLabelText('Web address'), 'board');

    expect(editor.getAllByRole('alert').length).toBeGreaterThan(0);
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
    // Anti-vacuity for THIS case specifically, verified separately from the
    // expanded-editor probe above (which leaves this one green, being a
    // different container): dropping `htmlFor` from the add form's own
    // `Page name` label reddens this case and no other.
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

  it('has no violations in the Site tool panel', async () => {
    const { container } = render(
      <SitePanel communityId={7} community={community} tagline={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

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

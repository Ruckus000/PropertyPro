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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import {
  RecordsAttention as RealRecordsAttention,
  type RecordsAttentionProps,
} from '@/components/pm/site-editor-v3/RecordsAttention';
import {
  AddPartDialog as RealAddPartDialog,
  type AddPartDialogProps,
} from '@/components/pm/site-editor-v3/AddPartDialog';
import { RequirementsDetails as RealRequirementsDetails } from '@/components/pm/site-editor-v3/RequirementsDetails';
import userEvent from '@testing-library/user-event';
import { EditorRoot } from '@/components/pm/site-editor-v3/EditorRoot';
import { useLinkedFacts } from '@/components/pm/site-editor-v3/inspector/linked-facts-context';
import { useSectionSources } from '@/components/pm/site-editor-v3/inspector/section-sources-context';
import { useSiteEditor } from '@/components/pm/site-editor-v3/editor-context';
import { sectionLabel } from '@/components/pm/site-editor-v3/section-label';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

// Every code-split child is replaced by a stand-in or renders nothing — this
// file is about how `EditorRoot` composes them, and mounting the real ones
// would drag in their own query surfaces. Selecting on the loader's SOURCE
// keeps every other module out of this file entirely — and when one is renamed
// the match fails loudly, which is the right direction for a test to break in.
//
// The Pages panel lives in Site settings since the tool rail went (combined
// plan Task 28), so the Settings stand-in renders the Pages stand-in below. It
// is the only way to drive a page change, and a page change is what the `key`
// remount in `EditorRoot` exists for (D-SEL).
const SECOND_PAGE_ID = 77;
const HOME_PAGE_ID = 5;
const CREATED_PAGE_ID = 91;
/** Mount/unmount trail for the inspector stub — see the dynamic mock below. */
const inspectorLifecycle = vi.hoisted(() => [] as string[]);
/** The source of every `next/dynamic` loader the editor declared at import. */
const dynamicLoaders = vi.hoisted(() => [] as string[]);

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
    // Every code-split import the editor declares is recorded first, so a case
    // can assert what the editor does NOT load. A stand-in that renders `null`
    // for an unknown loader would otherwise hide a chooser brought back.
    (dynamicLoaders.push(String(loader)),
    // The top bar's missing-records link: the real one, over a mocked hook.
    String(loader).includes('RecordsAttention')
      ? (props: RecordsAttentionProps) => <RealRecordsAttention {...props} />
      : // The Add a part dialog: the real one, and the real catalog inside it,
        // so "Add a part" can be followed from the canvas to the write.
        String(loader).includes('AddPartDialog')
        ? (props: AddPartDialogProps) => <RealAddPartDialog {...props} />
      : // The requirements pill's popover body: the real one, so its "Add it"
        // can be followed into the Add a part dialog.
        String(loader).includes('RequirementsDetails')
        ? (props: React.ComponentProps<typeof RealRequirementsDetails>) => (
            <RealRequirementsDetails {...props} />
          )
      : // The Settings view, as a stand-in exposing the callbacks EditorRoot
        // gives it. Its content has its own suite (SettingsView.test.tsx).
        String(loader).includes('SettingsView')
        ? ({
            tabRequest,
            onTabChange,
            pagesPanel,
            designPanel,
            noticePanel,
          }: {
            tabRequest?: { tab: string } | null;
            onTabChange?: (tab: string) => void;
            pagesPanel: PagesStandInProps;
            designPanel: { presets: unknown[]; hasSiteCustomCss: boolean };
            noticePanel: { hasPublishedSite: boolean };
          }) => (
            <>
              <p data-testid="settings-stand-in">Requested tab: {tabRequest?.tab ?? 'none'}</p>
              <button type="button" onClick={() => onTabChange?.('pages')}>
                Settings stand-in: show Pages
              </button>
              <button type="button" onClick={() => pagesPanel.onSelectPage(SECOND_PAGE_ID)}>
                Settings stand-in: edit the second page
              </button>
              <p>
                Settings stand-in props: page {String(pagesPanel.selectedPageId)}, published{' '}
                {String(noticePanel.hasPublishedSite)}, custom css{' '}
                {String(designPanel.hasSiteCustomCss)}, {designPanel.presets.length} colour sets
              </p>
              <PagesStandIn {...pagesPanel} />
            </>
          )
      : // The Help drawer, as a stand-in exposing its callbacks; its content
        // has its own suite (HelpDrawer.test.tsx).
        String(loader).includes('HelpDrawer')
        ? ({
            onClose,
            onShowMe,
          }: {
            onClose: () => void;
            onShowMe: (action: unknown) => void;
          }) => (
            <aside aria-label="Help">
              <button type="button" onClick={onClose}>
                Help stand-in: close
              </button>
              {HELP_ACTIONS.map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onClose();
                    onShowMe(action);
                  }}
                >
                  Show me: {label}
                </button>
              ))}
            </aside>
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
              return () => {
                inspectorLifecycle.push('unmount');
              };
            }, []);
            // The linked-field facts its forms are given, echoed: a parent that
            // forgot to provide them would switch the hero form's "Shows as"
            // line off silently.
            const facts = useLinkedFacts();
            // Likewise where each section's content comes from: a parent that
            // forgot these would leave every panel saying nothing about its
            // source, with no error.
            const sources = useSectionSources();
            return (
              <>
                <p>inspector</p>
                <p data-testid="inspector-facts">{facts === null ? 'no facts' : JSON.stringify(facts)}</p>
                <p data-testid="inspector-sources">{JSON.stringify(sources)}</p>
                <SectionsProbe />
              </>
            );
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
            layout,
            brandColors,
          }: {
            onFixIssue: (target: { pageId: string; slot: number }) => void;
            onGoToPages: () => void;
            layout?: string;
            brandColors?: { secondaryColor?: string };
          }) => (
            <>
              {/* What the secondary-colour advisory needs, echoed: a parent
                  that forgot either would switch the check off silently. */}
              <p>
                publish check on {layout ?? '(no layout)'}, secondary{' '}
                {brandColors?.secondaryColor ?? '(no secondary)'}
              </p>
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
        : () => null),
}));

/**
 * The Pages panel's stand-in, rendered by the Settings stand-in's Pages tab.
 * Each button does what the real panel does at that moment.
 */
interface PagesStandInProps {
  selectedPageId: number | null;
  restoreFocusToSelectedRow: boolean;
  onFocusRestored: () => void;
  onSelectPage: (pageId: number, options?: { pending?: boolean; announce?: string }) => void;
  onPageRemoved: (pageId: number) => void;
}

function PagesStandIn({
  selectedPageId,
  restoreFocusToSelectedRow,
  onFocusRestored,
  onSelectPage,
  onPageRemoved,
}: PagesStandInProps) {
  return (
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
  );
}

/**
 * The page-scoped section list the editor context holds, as buttons named
 * after each section, with `aria-current` on the selected one.
 *
 * It stands where the Sections tool's list stood before the tool rail went
 * (combined plan Task 28): rendered by the inspector stand-in, inside the
 * page-keyed provider, so the D-SEL and D-C2 cases below can still see which
 * sections the provider holds and which one is selected.
 */
function SectionsProbe() {
  const { movableSections, isSelected, select } = useSiteEditor();
  return (
    <ul aria-label="Sections probe">
      {movableSections.map((section) => (
        <li key={section.id}>
          <button
            type="button"
            aria-current={isSelected(section.id) ? 'true' : undefined}
            onClick={() => select(section.id)}
          >
            {sectionLabel(section.blockType)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What the Help stand-in's "Show me" buttons hand `EditorRoot`. */
const HELP_ACTIONS: ReadonlyArray<readonly [string, unknown]> = [
  ['add', { kind: 'add' }],
  ['settings pages', { kind: 'settings', tab: 'pages' }],
  ['settings design', { kind: 'settings', tab: 'design' }],
  ['settings notice', { kind: 'settings', tab: 'notice' }],
  ['settings search', { kind: 'settings', tab: 'search' }],
  ['publish', { kind: 'publish' }],
];

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
const media = vi.hoisted(() => ({ narrow: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => media.narrow,
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
  seoTitle: string | null;
  seoDescription: string | null;
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

/** The Add a part catalog's write, and the move that puts the new part in its slot. */
const writes = vi.hoisted(() => ({ upsertAsync: vi.fn(), reorder: vi.fn() }));

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
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: writes.upsertAsync, isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: writes.reorder, mutateAsync: vi.fn(), isPending: false }),
}));

// Phase 11b-3: `useSiteDiff` (which EditorRoot calls for the Publish button)
// now also reads the pages query, because a staged page removal is a pending
// change that shows up nowhere else. This tree is rendered without a
// QueryClientProvider, so the real hook would throw "No QueryClient set" —
// mocked COMPLETELY for the same reason as use-content-blocks above.
// v4 Phase 2b: RequiredSectionsProvider's unit-count save. Mocked like every
// other data hook here — this file renders with no QueryClient.
vi.mock('@/hooks/use-community-unit-count', () => ({
  useUpdateCommunityUnitCount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// The drafted site look (website builder v4). Tests that need a pending
// design change set `designDraft.value`; everyone else sees none.
const designDraft = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
// Logos are live branding, read separately from the drafted look. No data
// here, so the canvas keeps the server context's logo.
vi.mock('@/hooks/use-live-branding', () => ({
  useLiveBranding: () => ({ data: undefined, isError: false }),
  useSaveLiveBranding: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-site-design', () => ({
  siteDesignQueryKey: (communityId: number) => ['pm', 'site', 'design', communityId],
  useSiteDesign: () => ({
    data: { live: {}, draft: designDraft.value },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSaveSiteDesign: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// The records checklist behind the requirements pill. Tests that need records
// set `records.value`; everyone else sees an empty checklist.
const records = vi.hoisted(() => ({ value: [] as unknown[], calls: [] as unknown[][] }));
vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: (...args: unknown[]) => {
    records.calls.push(args);
    return { data: records.value, isError: false, refetch: vi.fn() };
  },
}));

// The top bar's missing-records count (`useRecordsAlert`, D11). Tests that need
// a count set `recordsAlert.missingCount`; every call's arguments are kept.
const recordsAlert = vi.hoisted(() => ({ missingCount: 0, calls: [] as unknown[][] }));
vi.mock('@/hooks/use-records-alert', () => ({
  recordsAlertQueryKey: (communityId: number) => ['pm', 'site', 'records-alert', communityId],
  useRecordsAlert: (...args: unknown[]) => {
    recordsAlert.calls.push(args);
    return {
      data: { missingCount: recordsAlert.missingCount, snoozedUntil: null },
      snooze: { mutate: vi.fn(), isPending: false },
    };
  },
}));

// The canvas footer reads the site settings. Without a seed the real hook
// would fetch; here it has nothing, so the canvas renders the default footer.
vi.mock('@/hooks/use-site-settings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-site-settings')>(
    '@/hooks/use-site-settings',
  );
  return { ...actual, useSiteSettings: () => ({ data: undefined }) };
});

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
  seoTitle: null,
  seoDescription: null,
};


/**
 * A canvas context with the shape the editor reads (`applyDesignToCanvas`
 * derives theme and layout from it). Its block-view tree stays out of these
 * tests the same way `null` keeps it out: the canvas itself is stubbed.
 */
const STUB_CANVAS = {
  community: { id: 42, slug: 'sunset-condos', name: 'Sunset Condos', logoUrl: null, communityType: 'condo_718', city: null, state: null, timezone: 'America/New_York' },
  theme: { primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333', headingFont: 'Inter', bodyFont: 'Inter' },
  layout: 'tidewater',
  preview: { announcements: [], documents: [], meetings: [], contact: null },
};

interface RootOptions {
  initialPages?: StubPage[];
  /**
   * Null by default, which takes the degraded-canvas branch and keeps the whole
   * block-view tree out of this file. Supplied only by the preview case, where
   * `EditorRoot` gates the dialog on it being non-null.
   */
  canvasContext?: unknown;
  hasPublishedSite?: boolean;
  /** `?view=settings&tab=<id>`, as the page parses it. */
  initialView?: 'website' | 'settings';
  initialSettingsTab?: string;
}

function rootElement({
  initialPages = [seededHome],
  canvasContext = null,
  hasPublishedSite = true,
  initialView,
  initialSettingsTab,
}: RootOptions = {}) {
  return (
    <EditorRoot
      communityId={42}
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      hasSiteCustomDomain
      hasPolishBlocks
      // Null on purpose by default: takes the degraded-canvas branch, so the
      // whole block-view tree stays out of this test.
      canvasContext={canvasContext as never}
      hasPublishedSite={hasPublishedSite}
      initialNotice={null}
      unitCount={null}
      canEditUnitCount={false}
      siteIdentity={{
        name: 'Sunset Condos',
        slug: 'sunset-condos',
        communityType: 'condo_718',
        city: 'Miami',
      }}
      tagline={null}
      initialSiteSettings={undefined}
      presets={[]}
      hasSiteCustomCss={false}
      // The server seed. Its only job here is to supply the home page id before
      // the Pages panel has ever been opened — that id is what every block
      // write is scoped by.
      initialPages={initialPages}
      initialView={initialView}
      initialSettingsTab={initialSettingsTab as never}
    />
  );
}

function renderRoot(options: RootOptions = {}) {
  return render(rootElement(options));
}

/**
 * Open Site settings, where the Pages tab (and the Pages stand-in) now lives.
 * A no-op when Site settings is already showing, which is what every "go to
 * the pages" step in these tests means.
 */
async function openPages() {
  if (screen.queryByTestId('settings-stand-in')) return;
  await userEvent.click(screen.getByRole('button', { name: 'Site settings' }));
}

/** Back to the page being edited, where the canvas and the inspector are. */
async function backToWebsite() {
  if (!screen.queryByTestId('settings-stand-in')) return;
  await userEvent.click(screen.getByRole('button', { name: 'Website' }));
}

function publishButton() {
  return screen.getByRole('button', { name: /Publish/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  designDraft.value = {};
  queries.draft = [];
  queries.published = [];
  queries.pages = [];
  inspectorLifecycle.length = 0;
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
  media.narrow = false;
  recordsAlert.missingCount = 0;
  recordsAlert.calls = [];
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

describe('EditorRoot — editing on the page (combined plan Task 28)', () => {
  it('seeds the selected page from the server-rendered list', async () => {
    // Before the Pages tab has ever been opened — and therefore before any
    // client request — the editor already knows which page it is editing. This
    // is what stops the first save of a session defaulting to home on a
    // community whose PM was editing something else.
    queries.draft = [hero(), block({ id: 1 })];
    renderRoot();

    await openPages();

    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });

  describe('"Add a part"', () => {
    const lobby = () =>
      block({ id: 2, blockOrder: 3, content: { heading: 'Lobby hours', body: 'Open 8 to 6.' } });

    beforeEach(() => {
      queries.draft = [hero(), block({ id: 1 }), lobby()];
      queries.published = [hero(), block({ id: 1 }), lobby()];
      writes.upsertAsync.mockResolvedValue(undefined);
    });

    /*
     * The whole path, through the real canvas, dialog and catalog: the button
     * after the Welcome section targets the section below it, the catalog
     * writes the new part to the page's next free slot (parts are appended,
     * then moved), and once it arrives it is moved up into the slot the PM
     * chose.
     *
     * Revert checks (production lines): `insertBefore={insertBefore}` on
     * `<AddPartDialog>` in `EditorRoot.tsx` (the catalog says "at the bottom":
     * red at the position assertion); `placeAdded(…)` in `AddPanel.tsx` (no
     * move: red at the reorder assertion); and `onAdded={handleAdded}` (the
     * dialog stays open: red at the dialog assertion).
     */
    it('"Add a part" between sections opens the add dialog and inserts at that slot', async () => {
      const { rerender } = renderRoot({ canvasContext: STUB_CANVAS });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Add a part after Welcome' }));

      const dialog = await screen.findByRole('dialog', { name: 'Add a part' });
      expect(within(dialog).getByTestId('add-position')).toHaveTextContent('It goes above “Text”.');
      await userEvent.click(within(dialog).getByTestId('add-section-text'));

      // Written to the next free slot on THIS page…
      expect(writes.upsertAsync).toHaveBeenCalledWith(
        expect.objectContaining({ blockType: 'text', blockOrder: 4, pageId: HOME_PAGE_ID }),
      );
      // …the dialog closes onto the new part's settings, and says so from a
      // region that outlives it.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('site-page-announcement')).toHaveTextContent(
        'Text section added. Its settings are open.',
      );

      // The refetch brings the new part in at slot 4; it is moved up to slot 2,
      // directly after the Welcome section, where the PM asked for it.
      queries.draft = [...queries.draft, block({ id: 9, blockOrder: 4 })];
      await act(async () => {
        rerender(rootElement({ canvasContext: STUB_CANVAS }));
      });
      expect(writes.reorder).toHaveBeenCalledWith({ blockId: 9, toOrder: 2 });
    });

    // Revert check (production line): the `onCloseAutoFocus` handler's
    // `target.focus()` in `AddPartDialog.tsx`.
    it('hands focus back to the "Add a part" that opened the dialog', async () => {
      renderRoot({ canvasContext: STUB_CANVAS });
      const opener = screen.getByRole('button', { name: 'Add a part after Text' });

      await userEvent.click(opener);
      await screen.findByRole('dialog', { name: 'Add a part' });
      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it('adds to the end from the end of the page', async () => {
      renderRoot({ canvasContext: STUB_CANVAS });

      await userEvent.click(screen.getByRole('button', { name: 'Add a part at the end of this page' }));

      expect(
        within(await screen.findByRole('dialog', { name: 'Add a part' })).getByTestId('add-position'),
      ).toHaveTextContent('It goes at the bottom of this page.');
    });

    // The dialog's "Manage pages" (the navigation bar is built from pages).
    it('"Manage pages" closes the dialog and opens Site settings on Pages', async () => {
      renderRoot({ canvasContext: STUB_CANVAS });
      await userEvent.click(screen.getByRole('button', { name: 'Add a part after Welcome' }));
      const dialog = await screen.findByRole('dialog', { name: 'Add a part' });

      await userEvent.click(within(dialog).getByRole('button', { name: 'Manage pages' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
    });
  });

  /*
   * Every other caller that opened a rail tool (combined plan Task 28). The
   * Help drawer's and the publish sheet's have their own cases below.
   *
   * Revert checks (production lines): `onManagePages={handleGoToPages}` and
   * `onEditNavigation={handleGoToPages}` in `EditorRoot.tsx` (Pages), and
   * `onAddSection={handleGoToAdd}` on the requirements pill (Add a part).
   */
  describe('the callers that opened a rail tool', () => {
    beforeEach(() => {
      queries.draft = [hero(), block({ id: 1 })];
      queries.published = [hero(), block({ id: 1 })];
      queries.pages = [seededHome];
    });

    it('"Add or manage pages" opens Site settings on Pages', async () => {
      renderRoot();
      await userEvent.click(screen.getByRole('button', { name: /Editing page/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Add or manage pages' }));
      expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
    });

    it("the canvas's navigation bar opens Site settings on Pages", async () => {
      renderRoot({ canvasContext: STUB_CANVAS });
      await userEvent.click(screen.getByTestId('canvas-navigation-bar'));
      expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
    });

    it("the requirements pill's \"Add it\" opens Add a part, adding to the end", async () => {
      renderRoot({ canvasContext: STUB_CANVAS });
      await userEvent.click(await screen.findByRole('button', { name: 'Required item missing' }));
      await userEvent.click((await screen.findAllByRole('button', { name: 'Add it' }))[0]!);

      const dialog = await screen.findByRole('dialog', { name: 'Add a part' });
      expect(within(dialog).getByTestId('add-position')).toHaveTextContent(
        'It goes at the bottom of this page.',
      );
    });
  });

  // Revert check: render `<RecordsAttention>` with `enabled` always true.
  it('shows the missing-records link in the top bar, for condos and HOAs only', async () => {
    recordsAlert.missingCount = 3;
    const { unmount } = renderRoot();
    expect(await screen.findByRole('link', { name: '3 missing records' })).toHaveAttribute(
      'href',
      '/pm/website?communityId=42#records',
    );
    expect(recordsAlert.calls[0]).toEqual([42, { enabled: true }]);
    unmount();

    recordsAlert.calls = [];
    render(
      <EditorRoot
        {...(rootElement().props as React.ComponentProps<typeof EditorRoot>)}
        siteIdentity={{ name: 'Sunset Ridge', slug: 'sunset-ridge', communityType: 'apartment' }}
      />,
    );
    expect(screen.queryByRole('link', { name: /missing record/ })).not.toBeInTheDocument();
    expect(recordsAlert.calls[0]).toEqual([42, { enabled: false }]);
  });
});

describe('EditorRoot — linked-field facts for the inspector', () => {
  const HARBOR_CANVAS = {
    ...STUB_CANVAS,
    community: {
      ...STUB_CANVAS.community,
      name: 'Harbor Pointe Condominium Association, Inc.',
      shortName: 'Harbor Pointe',
      city: 'Miami',
      unitCount: 120,
    },
  };

  it("hands the inspector the community's name, short name, city and unit count", () => {
    // The facts the canvas resolves the page's linked fields with, so the hero
    // form's "Shows as" line cannot disagree with the page beside it.
    renderRoot({ canvasContext: HARBOR_CANVAS });

    expect(JSON.parse(screen.getByTestId('inspector-facts').textContent!)).toEqual({
      name: 'Harbor Pointe Condominium Association, Inc.',
      shortName: 'Harbor Pointe',
      city: 'Miami',
      unitCount: 120,
    });
  });

  it('gives it no facts when the community could not be read', () => {
    renderRoot({ canvasContext: null });
    expect(screen.getByTestId('inspector-facts')).toHaveTextContent('no facts');
  });

  it('reads an unset short name, city and unit count as not known', () => {
    renderRoot({ canvasContext: STUB_CANVAS });
    expect(JSON.parse(screen.getByTestId('inspector-facts').textContent!)).toEqual({
      name: 'Sunset Condos',
      shortName: null,
      city: null,
      unitCount: null,
    });
  });
});

describe('EditorRoot — where each section panel gets its content', () => {
  const sources = () => JSON.parse(screen.getByTestId('inspector-sources').textContent!);

  it("hands the panels the canvas layout, what Contact lacks and the owners' records", () => {
    // The layout the canvas draws is the DRAFT look, so it comes from the design
    // query; the server context's tidewater is the live one.
    designDraft.value = { layoutId: 'bayfront' };
    renderRoot({
      canvasContext: {
        ...STUB_CANVAS,
        layout: 'bayfront',
        preview: {
          ...STUB_CANVAS.preview,
          contact: {
            management: { name: null, email: 'office@example.com', phone: null },
            board: [],
            address: '100 Palm Way, Miami, FL',
            officeHours: null,
          },
        },
        ownerRecordGroups: [{ category: 'budget', label: 'Budgets', postedCount: 3 }],
      } as never,
    });

    expect(sources()).toEqual({
      layoutId: 'bayfront',
      contact: { address: false, officeHours: true, phone: true, email: false },
      ownerRecordGroups: [{ category: 'budget', label: 'Budgets', postedCount: 3 }],
      recordsApply: true,
    });
  });

  it('knows nothing of the sources when the community could not be read', () => {
    renderRoot({ canvasContext: null });
    expect(sources()).toEqual({
      layoutId: null,
      contact: null,
      ownerRecordGroups: null,
      recordsApply: true,
    });
  });

  it('says records do not apply to an apartment community', () => {
    render(
      <EditorRoot
        {...(rootElement().props as React.ComponentProps<typeof EditorRoot>)}
        siteIdentity={{ name: 'Sunset Ridge', slug: 'sunset-ridge', communityType: 'apartment' }}
      />,
    );
    expect(sources().recordsApply).toBe(false);
  });
});

describe('EditorRoot — the Settings view (v4 Phase 5)', () => {
  it('switches to Settings and back', async () => {
    renderRoot();

    await userEvent.click(screen.getByRole('button', { name: 'Site settings' }));
    expect(screen.getByTestId('settings-stand-in')).toBeInTheDocument();
    expect(screen.queryByText('inspector')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Website' }));
    expect(screen.queryByTestId('settings-stand-in')).not.toBeInTheDocument();
    expect(screen.getByText('inspector')).toBeInTheDocument();
  });
});

describe('EditorRoot — Site settings opened from the address (combined plan Task 27)', () => {
  it('?view=settings&tab=pages opens Site settings on Pages', () => {
    renderRoot({ initialView: 'settings', initialSettingsTab: 'pages' });

    expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
    expect(screen.queryByText('inspector')).not.toBeInTheDocument();
  });

  it('opens on the website when the address names no view', () => {
    renderRoot();

    expect(screen.getByText('inspector')).toBeInTheDocument();
    expect(screen.queryByText(/Requested tab/)).not.toBeInTheDocument();
  });

  it('hands the Pages, Design and Notice tabs what the tools had', () => {
    renderRoot({ initialView: 'settings', hasPublishedSite: false });

    expect(
      screen.getByText(
        `Settings stand-in props: page ${HOME_PAGE_ID}, published false, custom css false, 0 colour sets`,
      ),
    ).toBeInTheDocument();
  });

  // Choosing a page remounts the shell (the page-keyed provider), and with it
  // the view's own state. Without the tab living here, the view dropped back to
  // General the moment a page was chosen in the Pages tab.
  // Revert check: drop `onTabChange={setSettingsTab}` in the SettingsView render.
  it('stays on the tab the PM chose when choosing a page remounts the editor', async () => {
    renderRoot({ initialView: 'settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Settings stand-in: show Pages' }));
    expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Settings stand-in: edit the second page' }),
    );

    expect(screen.getByText(/Settings stand-in props: page 77/)).toBeInTheDocument();
    expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
  });
});

describe('EditorRoot — the Help drawer (v4 Phase 3)', () => {
  function helpButton() {
    return screen.getByRole('button', { name: 'Help' });
  }

  it('opens and closes from the top bar, in either area', async () => {
    renderRoot();
    await userEvent.click(helpButton());
    expect(screen.getByRole('complementary', { name: 'Help' })).toBeInTheDocument();
    await userEvent.click(helpButton());
    expect(screen.queryByRole('complementary', { name: 'Help' })).not.toBeInTheDocument();

    await openPages();
    await userEvent.click(helpButton());
    expect(screen.getByRole('complementary', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-stand-in')).toBeInTheDocument();
  });

  /*
   * Combined plan Task 28: every "Show me" that opened a rail tool now opens
   * the Site settings tab holding it, from either area, and the Add tool's
   * opens the Add a part dialog.
   *
   * Revert check (production line): `openSettingsTab(action.tab)` in
   * `handleShowMe`.
   */
  it.each([
    ['settings pages', 'pages'],
    ['settings design', 'design'],
    ['settings notice', 'notice'],
    ['settings search', 'search'],
  ])('"Show me: %s" closes the drawer and opens Site settings on %s', async (label, tab) => {
    renderRoot();
    await userEvent.click(helpButton());
    await userEvent.click(screen.getByRole('button', { name: `Show me: ${label}` }));

    expect(screen.queryByRole('complementary', { name: 'Help' })).not.toBeInTheDocument();
    expect(screen.getByText(`Requested tab: ${tab}`)).toBeInTheDocument();
  });

  it('"Show me" for adding opens the Add a part dialog on the page, from Site settings', async () => {
    queries.draft = [hero(), block({ id: 1 })];
    renderRoot({ canvasContext: STUB_CANVAS });
    await openPages();
    await userEvent.click(helpButton());
    await userEvent.click(screen.getByRole('button', { name: 'Show me: add' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add a part' });
    // No position given, so the part goes at the end.
    expect(within(dialog).getByTestId('add-position')).toHaveTextContent(
      'It goes at the bottom of this page.',
    );
    expect(screen.queryByTestId('settings-stand-in')).not.toBeInTheDocument();
  });

  it('"Show me" for a Settings tab asks Settings for it, once', async () => {
    renderRoot();
    await userEvent.click(helpButton());
    await userEvent.click(screen.getByRole('button', { name: 'Show me: settings search' }));
    expect(screen.getByText('Requested tab: search')).toBeInTheDocument();

    // The PM's own switch afterwards opens Settings on its first tab again.
    await userEvent.click(screen.getByRole('button', { name: 'Website' }));
    await userEvent.click(screen.getByRole('button', { name: 'Site settings' }));
    expect(screen.getByText('Requested tab: general')).toBeInTheDocument();
  });
});

describe('EditorRoot — opens straight to editing', () => {
  it('the editor opens straight to editing with no chooser, tour or banner', () => {
    renderRoot({ hasPublishedSite: false });

    // The page is there from the first paint; nothing sits over it.
    expect(screen.getByText('inspector')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // No guided/free switch, no tabbed Next steps panel, no wizard invitation.
    expect(screen.queryByRole('radio', { name: /guided|free/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-entry-banner')).not.toBeInTheDocument();
    // And none of the code-split pieces behind them is declared at all — nor
    // the rail's panels, which went with the rail (combined plan Task 28).
    for (const gone of [
      'ModeChooser',
      'EditorTour',
      'NextSteps',
      'GuidedTabs',
      'ModeSwitch',
      'DocumentsPanel',
      'SectionList',
      'ToolRail',
    ]) {
      expect(dynamicLoaders.filter((src) => src.includes(gone))).toEqual([]);
    }
  });
});

describe('EditorRoot — selected page (D-SEL)', () => {
  /** The probe's row for a block, which carries the selected state. */
  function sectionRow() {
    return screen.getByRole('button', { name: 'Text' });
  }

  async function selectTheTextSection() {
    await backToWebsite();
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

    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));
    await backToWebsite();

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
    //
    // Switched from the top bar's page picker, which keeps the page — and so
    // the inspector — on screen. (Site settings' Pages tab hides the inspector
    // anyway, which would unmount it for the wrong reason.)
    queries.pages = [
      seededHome,
      { ...seededHome, id: SECOND_PAGE_ID, name: 'Amenities', slug: 'amenities', isHome: false },
    ];
    renderRoot();
    expect(inspectorLifecycle).toEqual(['mount']);

    await userEvent.click(screen.getByRole('button', { name: /Editing page/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Amenities' }));

    // Torn down and rebuilt, not merely re-rendered.
    expect(inspectorLifecycle).toEqual(['mount', 'unmount', 'mount']);
  });

  it('does NOT unmount the inspector on an ordinary change to the page view', async () => {
    // The control: the remount must be keyed on the PAGE, not on other
    // traffic, or every click would throw away a pending edit's context.
    renderRoot();
    expect(inspectorLifecycle).toEqual(['mount']);

    await userEvent.click(screen.getByRole('button', { name: 'Preview on a phone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(inspectorLifecycle).toEqual(['mount']);
  });

  it('does not list the previous page sections after a switch (D-C2)', async () => {
    // The other consequence of the same switch, and the one the unscoped
    // provider got wrong: home's sections stayed listed beside a canvas
    // rendering the second page.
    renderRoot();
    await selectTheTextSection();

    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

    expect(screen.queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
  });

  it('keeps the selection when the page does not change', async () => {
    // The other half of the same claim: the remount is keyed on the page, so
    // ordinary tab traffic must not throw the selection away.
    renderRoot();
    await selectTheTextSection();

    await openPages();
    await backToWebsite();

    expect(sectionRow()).toHaveAttribute('aria-current', 'true');
  });

  it('tells the Pages panel which page is now selected', async () => {
    renderRoot();

    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();
  });
});

/**
 * D-C2's sixth caller. `EditorRoot` feeds `SiteEditorProvider`, which feeds the
 * section controls and the Inspector. Unfiltered, they held every page's
 * sections beside a canvas showing one page's.
 *
 * Read through `SectionsProbe`, which lists the provider's sections from inside
 * the real provider — the composition the leaf tests cannot see.
 */
describe('EditorRoot — the editor context is scoped to the selected page (D-C2)', () => {
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

  it('lists only the selected page, not every page in the community', async () => {
    renderRoot();
    await backToWebsite();

    expect(homeSection()).toBeInTheDocument();
    expect(otherPageSection()).not.toBeInTheDocument();
  });

  it('swaps the list when the page changes', async () => {
    renderRoot();

    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

    expect(otherPageSection()).toBeInTheDocument();
    expect(homeSection()).not.toBeInTheDocument();
  });

  it('shows an empty page as empty rather than borrowing the home page sections', async () => {
    // The failure a PM meets first: create a page, and it already appears to
    // have every section the home page has.
    queries.draft = [hero(), block({ id: 1, pageId: HOME_PAGE_ID })];

    renderRoot();
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();

    // Leave the Pages tab, so the panel is unmounted exactly as it would be
    // during a header-initiated publish. If the repair still lived in the
    // panel, nothing below could fire.
    await backToWebsite();

    // The publish landed: the staged page is gone from the server's list, and
    // the invalidation re-renders the tree with it.
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    await openPages();
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
    await openPages();

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
    await openPages();
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
    await openPages();
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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    // The panel reports the hard delete, then the invalidated list comes back
    // without the page — the same two steps, in the same order, as production.
    await userEvent.click(screen.getByRole('button', { name: 'I deleted the second page' }));
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome] }));
    });

    // Repaired…
    await openPages();
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
      seoTitle: null,
      seoDescription: null,
    };
    queries.pages = [seededHome, stagedSecond];

    const { rerender } = renderRoot();
    await openPages();
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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Create a page' }));

    expect(screen.getByText(`Editing page ${CREATED_PAGE_ID}`)).toBeInTheDocument();
  });

  it('still repairs an ordinary stale selection, so the pending mark is not a blanket opt-out', async () => {
    // The mark is released when the list catches up, and an ORDINARY selection
    // never sets it. Without this, "hold the selection" would mean "never
    // repair" and finding #6 would be reintroduced through the fix for #5.
    queries.pages = [seededHome];

    renderRoot();
    await openPages();
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
    seoTitle: null,
    seoDescription: null,
  };

  beforeEach(() => {
    queries.draft = [hero(), block({ id: 1 })];
  });

  it('warns on the editing surface, naming the page', async () => {
    queries.pages = [seededHome, stagedSecondPage];

    renderRoot();
    await openPages();
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
    await openPages();
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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(screen.getByTestId('staged-page-banner')).toBeInTheDocument();
  });

  it('says nothing when the selected page is not staged', () => {
    queries.pages = [seededHome, { ...stagedSecondPage, deleteStagedAt: null }];

    renderRoot();

    expect(screen.queryByTestId('staged-page-banner')).not.toBeInTheDocument();
  });

  it('sends the PM to Pages, where the removal can be cancelled', async () => {
    queries.pages = [seededHome, stagedSecondPage];

    renderRoot();
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

    await userEvent.click(screen.getByRole('button', { name: 'Go to Pages' }));

    expect(screen.getByText(`Editing page ${SECOND_PAGE_ID}`)).toBeInTheDocument();
  });
});

describe('EditorRoot — the top bar names the page being edited', () => {
  // Nothing on screen said which page you were editing. The canvas is scrolled
  // and the Pages list is in Site settings. So a PM could create a second page,
  // go back to the page, and edit for an hour with no indication of the
  // target, while every write went to that page.
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

    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

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
    renderRoot({ canvasContext: STUB_CANVAS });

    await openPages();
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

  // Publish (and the requirements pill) stay in the top bar in Settings, so
  // "Fix this" has to leave Settings — otherwise the selection lands behind a
  // view that hides it and nothing visible happens.
  // Revert check: `setView('website')` in `handleGoToSlot`.
  it("Publish's Fix this from Settings returns to the page", async () => {
    renderRoot();
    await userEvent.click(screen.getByRole('button', { name: 'Site settings' }));
    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));

    expect(screen.queryByTestId('settings-stand-in')).not.toBeInTheDocument();
    expect(screen.getByText('inspector')).toBeInTheDocument();
  });

  it('switches to the page the offending section is on', async () => {
    renderRoot();
    // Precondition: on home, and the offending section is not reachable here.
    await openPages();
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fix this' }));

    await openPages();
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

    // The probe lists the page we were moved to, and the offending section is
    // the only one on it. Matched loosely, as the old Sections list's row
    // carried a "Draft" badge in its name.
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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    await backToWebsite();

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

    await openPages();
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
  });
});

describe('EditorRoot — BOTH page reads fail', () => {
  /*
   * The seed returns `[]` on any error and the client query can fail for the
   * same reason — the same lock, the same database. `effectivePageId` is then
   * null, and `blocksForPage(blocks, null)` returns the list UNCHANGED: every
   * page's sections concatenated into one canvas, with no banner and no hint
   * that anything is wrong. Adds land on the live home page, and an edit made
   * against a foreign section is written to whichever page the write resolves
   * to — silently, since 11c removed the cross-page slot refusal that used to
   * turn this into a visible (if unactionable) error.
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

  it('withholds the sections instead of offering another page\'s', () => {
    renderRoot({ initialPages: [] });

    // Neither page's sections are offered — an unscoped list would show BOTH.
    // The inspector (and the provider's list it carries) is withheld outright.
    expect(screen.queryByText('inspector')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Text/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gallery/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Your sections are hidden until/i)).toBeInTheDocument();
  });

  // Revert check (production line): `&& !pagesUnavailable` on the
  // `<AddPartDialog>` render in `EditorRoot.tsx`.
  it('opens no Add a part dialog, because a block written now would land on the home page', async () => {
    renderRoot({ initialPages: [] });

    // Help's "Show me" is the one way to ask for it with no canvas showing.
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show me: add' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('pages-unavailable-banner')).toBeInTheDocument();
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
    await backToWebsite();

    // Scoped to home, not showing every page: proof the fallback resolved a
    // real page id rather than leaving it null.
    expect(screen.queryByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gallery' })).not.toBeInTheDocument();

    await openPages();
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
    await openPages();
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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the second page' }));
    // The real panel does this from its mount effect; the stub exposes it so
    // the parent's half can be driven without a DOM focus race.
    await userEvent.click(screen.getByRole('button', { name: 'Panel took the focus' }));

    // Off to Sections — which UNMOUNTS the panel — and back.
    await backToWebsite();
    await openPages();

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
    await openPages();
    await userEvent.click(screen.getByRole('button', { name: 'Edit the home page' }));

    expect(screen.getByTestId('pages-focus-flag')).toHaveTextContent('true');
  });
});

describe('EditorRoot — the publish sheet can reach the Pages panel', () => {
  it('opens Site settings on Pages when a page-set problem has no section to fix', async () => {
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

    // Site settings, on Pages, where page-set problems are fixed.
    // Revert check (production line): `openSettingsTab('pages')` in
    // `handleGoToPages`.
    expect(screen.getByText('Requested tab: pages')).toBeInTheDocument();
    expect(screen.getByText(`Editing page ${HOME_PAGE_ID}`)).toBeInTheDocument();
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
    renderRoot({ initialPages: [], canvasContext: STUB_CANVAS });

    const preview = screen.getByRole('button', { name: 'Preview' });
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
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: STUB_CANVAS });
    // Open it while a page IS known…
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    // …then lose the pages underneath it, which is what a failed refetch does.
    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: STUB_CANVAS }));
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

    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
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
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: STUB_CANVAS });
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    // The read fails…
    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: STUB_CANVAS }));
    });
    expect(screen.queryByText(/previewing/)).not.toBeInTheDocument();

    // …and the PM's retry succeeds.
    queries.isError = false;
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome], canvasContext: STUB_CANVAS }));
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
    renderRoot({ initialPages: [], canvasContext: STUB_CANVAS });

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
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: STUB_CANVAS });
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: STUB_CANVAS }));
    });
    expect(await screen.findByRole('button', { name: /Try again/ })).toHaveFocus();

    // …the PM retries and it works.
    queries.isError = false;
    queries.pages = [seededHome];
    await act(async () => {
      rerender(rootElement({ initialPages: [seededHome], canvasContext: STUB_CANVAS }));
    });

    expect(await screen.findByRole('button', { name: 'Preview' })).toHaveFocus();
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

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
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
    const { rerender } = renderRoot({ initialPages: [seededHome], canvasContext: STUB_CANVAS });
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText(/previewing/)).toBeInTheDocument();

    queries.isError = true;
    queries.pages = [];
    await act(async () => {
      rerender(rootElement({ initialPages: [], canvasContext: STUB_CANVAS }));
    });

    expect(await screen.findByRole('button', { name: /Try again/ })).toHaveFocus();
  });
});

describe("EditorRoot — the publish sheet checks the look it is about to publish", () => {
  /*
   * The sheet warns about text on the secondary colour only when its parent
   * hands it the layout AND that colour, so a parent that forgot either would
   * switch the advisory off with nothing failing. Both must be the DRAFT look's,
   * because that is what a publish puts live.
   *
   * Revert check (production line): `{...(layout ? { layout } : {})}` in
   * `PublishSheetMount`.
   */
  beforeEach(() => {
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
    designDraft.value = { layoutId: 'heritage', secondaryColor: '#FBF8F1' };
  });
  afterEach(() => {
    designDraft.value = {};
  });

  it("hands the sheet the draft look's layout and secondary colour", async () => {
    renderRoot({ canvasContext: STUB_CANVAS });
    await userEvent.click(publishButton());

    expect(screen.getByText(/^publish check on/)).toHaveTextContent(
      'publish check on heritage, secondary #FBF8F1',
    );
  });
});

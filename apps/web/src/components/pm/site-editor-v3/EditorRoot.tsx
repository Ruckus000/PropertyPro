'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useContentBlocks, useSitePublishToken } from '@/hooks/use-content-blocks';
import { useMediaQuery } from '@/hooks/use-media-query';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import { isStagedForRemoval } from '@/lib/site-editor/describe-page-state';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { applyDesignToCanvas, applyLiveLogoToCanvas } from '@/lib/site-editor/canvas-design';
import { useSiteDesign } from '@/hooks/use-site-design';
import { useLiveBranding } from '@/hooks/use-live-branding';
import {
  useSiteEditorPreferences,
  useUpdateSiteEditorPreferences,
} from '@/hooks/use-site-editor-preferences';
import type { PresetCardData } from '@/components/pm/onboarding-wizard/PresetChooser';
import dynamic from 'next/dynamic';
import { EditorShell } from './EditorShell';
import { StatusLine } from './StatusLine';
import type { PreviewDevice } from './EditorTopBar';

// Code-split, and mounted only once opened.
//
// The preview pulls the whole read-only render path — every block view, the
// dialog chrome, the loading/error/empty surfaces — and a PM who never presses
// Preview should not pay for it. The editor route sits at ~697 KiB against a
// 700 KiB HARD budget with this imported statically; deferring it is the
// difference between passing and blocking every later phase.
const PreviewDialog = dynamic(
  () => import('./PreviewDialog').then((m) => m.PreviewDialog),
  { loading: () => null },
);

// Same reasoning as the preview: opened on demand, so it has no business in the
// initial payload of a route sitting inside 50 KiB of a hard budget.
const PublishSheet = dynamic(
  () => import('./publish/PublishSheet').then((m) => m.PublishSheet),
  { loading: () => null },
);
// Type-only: erased at build, so the sheet stays code-split.
import type { SlotTarget } from './publish/PublishSheet';

// Phase 7. Deferred for the same budget reason, and it works because the panel
// body is only rendered when its tab is active — so the chunk (form + the Radix
// alert-dialog stack behind the remove confirmation) is requested on the click,
// not on mount. A PM who never posts a notice never pays for it.
const UrgentNoticePanel = dynamic(
  () => import('./panels/UrgentNoticePanel').then((m) => m.UrgentNoticePanel),
  { loading: () => null },
);

// v4 Phase 5. The Settings view (site icon, footer, search, sharing image,
// web address and custom domain) is fetched when the PM switches to it, for
// the same budget reason as every panel: the web JS aggregate has little
// headroom, and a PM who never opens Settings should not pay for it.
const SettingsView = dynamic(
  () => import('./settings/SettingsView').then((m) => m.SettingsView),
  { loading: () => null },
);

// Same reasoning again: only the active tool's panel is rendered, so the Add
// catalog — and, behind its own nested dynamic import, the image upload flow —
// is fetched on the tab click. A PM editing existing sections never pays for it.
const AddPanel = dynamic(() => import('./panels/AddPanel').then((m) => m.AddPanel), {
  loading: () => null,
});

// Split for the same budget reason as everything above. Design carries the
// colour-set grid and the custom-colour pickers.
const DesignPanel = dynamic(
  () => import('./panels/DesignPanel').then((m) => m.DesignPanel),
  { loading: () => null },
);
// v4 Phase 3. Mounted only while open, so its guide reader (the help modal's
// article body, figures and lightbox) is fetched on the first Help click.
const HelpDrawer = dynamic(() => import('./help/HelpDrawer').then((m) => m.HelpDrawer), {
  loading: () => null,
});
// v4 Phase 3, both rendered only when needed: the first-run chooser for a
// manager who has not chosen, and the checklist only in Guided mode.
const ModeChooser = dynamic(
  () => import('./guidance/ModeChooser').then((m) => m.ModeChooser),
  { loading: () => null },
);
const NextSteps = dynamic(() => import('./guidance/NextSteps').then((m) => m.NextSteps), {
  loading: () => null,
});
// The four-step tour: at most once by itself, after the chooser, or from Help.
const EditorTour = dynamic(() => import('./guidance/EditorTour').then((m) => m.EditorTour), {
  loading: () => null,
});
// Type-only: erased at build, so neither chunk is pulled in.
import type { HelpAction } from './help/guides';
import type { EditorStepAction } from './guidance/NextSteps';
import type { SettingsTabId } from './settings/SettingsView';
const RecordsAttention = dynamic(
  () => import('./RecordsAttention').then((m) => m.RecordsAttention),
  { ssr: false, loading: () => null },
);
const DocumentsPanel = dynamic(
  () => import('./panels/DocumentsPanel').then((m) => m.DocumentsPanel),
  { loading: () => null },
);

// Phase 11b-3. Same reasoning as every panel above — only the ACTIVE tool's
// panel is rendered, so the pages list and its query only arrive on the tab
// click. The route sits at ~640 KiB of a 700 KiB HARD budget, and a statically
// imported panel is a cost every PM pays whether or not they ever open it.
const PagesPanel = dynamic(() => import('./panels/PagesPanel').then((m) => m.PagesPanel), {
  loading: () => null,
});
// Code-split, for the same reason as PreviewDialog/PublishSheet above: the
// inspector renders nothing until a section is selected, but a static import
// put its whole subtree — the form registry, and every form's shared field
// chrome — in the initial payload of every PM's editor.
const Inspector = dynamic(() => import('./Inspector').then((m) => m.Inspector), {
  // No `loading`: the inspector's own resting state IS nothing, so a skeleton
  // would appear where a blank column belongs.
  loading: () => null,
});

import { WizardEntryBanner } from '@/components/pm/onboarding-wizard/WizardEntryBanner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Canvas } from './canvas/Canvas';
import { SiteEditorProvider, useSiteEditor } from './editor-context';
import { SectionList } from './panels/SectionList';
import type { EditorMode, EditorToolId } from './tools';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import { UndoableRemoveProvider } from './undoable-remove-context';
import { useSitePages, type SitePageSummary } from '@/hooks/use-site-pages';
import { THEME_DEFAULTS } from '@propertypro/theme';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';
import type { SiteSettingsRecord } from '@/hooks/use-site-settings';
import type { SitePanelProps } from './panels/SitePanel';
import type { EditorView } from './EditorTopBar';
import type { StylingPanelTheme } from './panels/StylingPanel';
import { AutosaveStatusProvider, useAutosaveStatus } from './inspector/autosave-status';
import { useSiteDiff } from './use-site-diff';
import { RequiredSectionsProvider, useRequiredSections } from './required-sections-context';
import { RequirementsPill } from './RequirementsPill';

/** Bridges the active inspector form's save state into the top bar. */
function AutosaveStatusLine() {
  const { status, lastSavedAt, error, onRetry } = useAutosaveStatus();
  return (
    <StatusLine
      status={status}
      lastSavedAt={lastSavedAt}
      error={error}
      onRetry={onRetry}
    />
  );
}

export interface EditorRootProps {
  communityId: number;
  communityName: string;
  publicSiteUrl: string | null;
  /** Whether the plan includes a custom domain (Settings → Address & domain). */
  hasSiteCustomDomain: boolean;
  /**
   * `hasSitePolishBlocks` — whether the plan includes the FAQ / Gallery /
   * Amenities blocks the Add panel offers.
   *
   * Seven of the ten types the Add panel offers are on Essentials, so this
   * gates three rows inside the panel, not the panel.
   */
  hasPolishBlocks: boolean;
  /** Null when the community row could not be read; the canvas degrades. */
  canvasContext: CanvasContext | null;
  /**
   * Phase 7 urgent notice. Both values come from the page's existing
   * `getCommunityPublicInfo` read, so they cost no extra query — and passing
   * them down means the notice panel and the phone gate open with real state
   * instead of a spinner, which matters for the one tool in this editor that
   * gets used under time pressure.
   */
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
  /**
   * Phase 8 site settings. Like the notice above, both come from reads the page
   * already makes, so the Site panel opens with real values rather than a
   * spinner and costs no extra query.
   */
  siteIdentity: SitePanelProps['community'];
  /**
   * `communities.unit_count` (migration 0081); `null` = unknown. With the type
   * it decides whether Florida's website rules apply — see `requirementLevel`.
   */
  unitCount: number | null;
  /** Whether this viewer may correct `unitCount` (community admin). */
  canEditUnitCount: boolean;
  tagline: string | null;
  initialSiteSettings: SiteSettingsRecord | undefined;
  /**
   * The colour-set catalog (`site_theme_presets`) for the Design panel — the
   * same list the wizard shows. The look itself is read through
   * `useSiteDesign`, because it changes while the editor is open.
   */
  presets: PresetCardData[];
  /** Pro+: the Design panel's custom-colours section (`hasSiteCustomCss`). */
  hasSiteCustomCss: boolean;
  /**
   * True when `communities.site_onboarding_completed_at` is null — the wizard
   * was never finished. Surfaces the wizard prompt the legacy editor carried;
   * it is the one entry point that lives *inside* the editor, which is where a
   * PM is when they notice their site looks generic.
   */
  showWizardBanner: boolean;
  /**
   * Phase 11b-3. The community's site pages, read server-side.
   *
   * REQUIRED, and required for a reason worth stating: the selected page id is
   * what every block write is scoped by, and `resolvePageId` on the server
   * treats an absent page id as "the home page". So an editor that renders
   * before it knows which page is selected is an editor whose first save can
   * land on the wrong page — and an optional prop defaulting to `[]` is exactly
   * that failure, silently. Seeding it here means the id is known on the first
   * paint rather than one round-trip later.
   *
   * `[]` is still a legal value — it is what the page passes when the read
   * fails — and it degrades to the pre-11b-3 behaviour (no page id sent, server
   * defaults to home), which is correct for the single-page communities that
   * are the overwhelming majority.
   *
   * A fast-path SEED for the first paint, not the source of truth. `EditorRoot`
   * also holds the live `useSitePages` query — shared key with `useSiteDiff`, so
   * no extra request — and drives the home-page fallback and selection repair
   * off that. `PagesPanel` owns neither: it reports selection changes upward and
   * is remounted by the page switch it triggers.
   */
  initialPages: SitePageSummary[];
}

/**
 * What the canvas shows (the draft look) — the Design panel's custom colours seed their pickers from this
 * so turning an override on starts from the live colour rather than a constant.
 *
 * Falls back to the platform defaults only when the community row could not be
 * read at all, which is the same condition that degrades the canvas.
 */
function resolveStylingTheme(canvasContext: CanvasContext | null): StylingPanelTheme {
  return {
    primaryColor: canvasContext?.theme.primaryColor ?? THEME_DEFAULTS.primaryColor,
    secondaryColor: canvasContext?.theme.secondaryColor ?? THEME_DEFAULTS.secondaryColor,
    accentColor: canvasContext?.theme.accentColor ?? THEME_DEFAULTS.accentColor,
    bodyFont: canvasContext?.theme.bodyFont ?? THEME_DEFAULTS.fontBody,
  };
}

/**
 * Client root of the v3 editor — the seam where state lives.
 *
 * Phase 2b-2 mounts `SiteEditorProvider` here rather than inside the canvas,
 * because selection and reordering are driven from two different columns: the
 * canvas and the Sections tool panel. Both read the same block list; the query
 * key is shared with `Canvas`'s own `useContentBlocks` call, so this adds no
 * second request.
 *
 * Phase 3 adds the status line, and Phase 4 hangs the change model off here.
 */
export function EditorRoot({
  communityId,
  communityName,
  publicSiteUrl,
  hasSiteCustomDomain,
  hasPolishBlocks,
  canvasContext: serverCanvasContext,
  hasPublishedSite,
  initialNotice,
  siteIdentity,
  unitCount,
  canEditUnitCount,
  tagline,
  initialSiteSettings,
  presets,
  hasSiteCustomCss,
  showWizardBanner,
  initialPages,
}: EditorRootProps) {
  const { data: blocks } = useContentBlocks(communityId);
  // The Documents tool's count, reported by the code-split `RecordsAttention`.
  const [recordsAttention, setRecordsAttention] = useState(0);
  // The canvas, preview and publish-sheet contrast check all show the DRAFT
  // look (website builder v4), which changes as the Design panel saves. The
  // server context carries the live look; this re-derives theme and layout
  // from the design query, and is the server context until that query lands.
  const { data: design } = useSiteDesign(communityId);
  // Logos are live, not drafted, and the Design panel can change them while
  // the editor is open; the header shows the site logo, else the square one.
  // Until the query lands the server context's logo stands.
  const { data: liveBranding } = useLiveBranding(communityId);
  const canvasContext = useMemo(
    () => applyLiveLogoToCanvas(applyDesignToCanvas(serverCanvasContext, design), liveBranding),
    [serverCanvasContext, design, liveBranding],
  );
  // Shares the blocks query key, so this adds no request — and the publish
  // sheet calls the same hook, so the button's state and the sheet's "N changes
  // ready to publish" can never disagree.
  const {
    diff,
    validated,
    isPending: diffPending,
    isError: diffFailed,
  } = useSiteDiff(communityId);
  // Closed by default — the v4 builder opens on the page, not on a panel.
  const [activeTool, setActiveTool] = useState<EditorToolId | null>(null);
  // v4 Phase 5: the page being built, or the site's settings.
  const [view, setView] = useState<EditorView>('website');
  // A Settings tab a Help guide's "Show me" asked for; see `SettingsView`.
  const [settingsTabRequest, setSettingsTabRequest] = useState<{ tab: SettingsTabId } | null>(
    null,
  );
  // v4 Phase 3: the Help drawer, open beside whichever area is showing.
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * `previewOpen`, mirrored — read by the preview gate effect below.
   *
   * The effect must know whether the dialog was open WITHOUT taking
   * `previewOpen` as a dependency (that would re-run it on every open and
   * close) and without reading it inside a `setPreviewOpen` updater, which
   * React requires to be pure and calls more than once.
   *
   * Assignment during render is safe for a mirror ref: it derives nothing,
   * triggers nothing, and is read only from effects.
   */
  const previewOpenRef = useRef(false);
  previewOpenRef.current = previewOpen;
  const [publishOpen, setPublishOpen] = useState(false);
  // v4 device preview. Session-only: a PM who checks the phone layout and
  // reloads should come back to the full-width canvas they edit on.
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Which page the editor is editing. `null` until the PM picks one, at which
  // point the server seed's home page stands in — `initialPages` is home-first,
  // but `find` on the flag rather than `[0]` because "first row" is an ordering
  // detail and "is home" is the fact.
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  /**
   * A page just created in the Pages panel that the cached list does not hold
   * yet. Suppresses the repair below for exactly that id — see
   * `PagesPanelProps.onSelectPage`.
   *
   * It lives HERE, not in the panel, because `key={effectivePageId}` remounts
   * the panel on the same switch that sets the mark.
   */
  const [pendingSelectionId, setPendingSelectionId] = useState<number | null>(null);
  /**
   * A `block_order` the PM asked to fix on a page they were not on. Handed to
   * the provider that replaces the current one, which selects it on mount —
   * see `SiteEditorProviderProps.selectSlotOnMount`.
   *
   * Owned here rather than in `PublishSheetMount` for the same reason
   * `pendingSelectionId` is: the page switch that creates the need also
   * remounts everything below the `key`, so a mark held down there dies with
   * the instance that set it.
   */
  const [pendingSelectSlot, setPendingSelectSlot] = useState<number | null>(null);
  /**
   * A page THIS PM just deleted outright, so the repair below can move the
   * selection without announcing it — see `PagesPanelProps.onPageRemoved`.
   *
   * Cleared as soon as it is consumed, and never used to skip the repair
   * itself: the selection still has to move, it just does not need narrating
   * back to the person who caused it.
   */
  const [selfRemovedPageId, setSelfRemovedPageId] = useState<number | null>(null);
  /**
   * True when the selection moved because the PM clicked a row in the Pages
   * panel — so the remounted panel puts focus back on that row rather than
   * letting it fall to `<body>`. See `PagesPanelProps.restoreFocusToSelectedRow`.
   *
   * Reset on any other route to a page change (a "Fix this" jump, a repair), so
   * it never steals focus for a switch the PM did not initiate here — AND
   * released by the panel the moment it acts on it, via
   * `PagesPanelProps.onFocusRestored`.
   *
   * That release is load-bearing, not tidiness. `PagesPanel` is rendered behind
   * `if (tool === 'pages')`, so it unmounts on a tool switch and remounts on the
   * way back. While the flag merely latched, the ordinary journey — click a
   * page, go to Sections to add content, return to Pages — remounted the panel
   * with a stale `true` and yanked focus onto the row, which is precisely the
   * ambush the paragraph above says this flag prevents.
   */
  const [focusSelectedRow, setFocusSelectedRow] = useState(false);
  const handleFocusRestored = useCallback(() => setFocusSelectedRow(false), []);
  /**
   * The selected page's last-known name and staging state, kept for the one
   * moment the page itself is gone.
   *
   * Refs rather than state because the repair effect below reads them at the
   * exact tick the page has just LEFT the list — `selectedPage` is `undefined`
   * by then, so the live values say nothing about what was lost. They are
   * written only while a page is actually found (see the sync effect after
   * `selectedPageIsStaged`), so the last write is the page's final observed
   * state rather than the hole it left.
   *
   * Refs also keep them out of the repair effect's dependency array: they must
   * not be able to re-trigger the announcement.
   */
  const selectedPageWasStagedRef = useRef(false);
  const selectedPageNameRef = useRef<string | null>(null);
  /**
   * The banner's "Try again", so the preview gate has somewhere to put focus.
   *
   * The gate unmounts the dialog instead of closing it, and Radix then restores
   * focus to a Preview button the same render disables — a no-op, landing the
   * PM on `<body>`. This is the only actionable control on the surface that
   * replaces the editor, which makes it the right destination.
   */
  const retryPagesRef = useRef<HTMLButtonElement>(null);
  /** True while the gate holds focus on the retry, so it can hand it back. */
  const previewGateTookFocusRef = useRef(false);
  /** Focus destination for the return leg — re-enabled on the same render. */
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const handlePageRemoved = useCallback((pageId: number) => setSelfRemovedPageId(pageId), []);

  // Shares `useSiteDiff`'s query key, so this adds no request — the diff calls
  // `useSitePages` internally and unconditionally. Read here because selection
  // is owned at this level and so is everything that repairs it.
  const { data: pages, isError: pagesFailed, refetch: refetchPages } = useSitePages(communityId);

  /*
   * The server seed is the fast path, NOT the only one.
   *
   * `loadInitialPages` returns `[]` on any error, and the fallback matters
   * whatever the cause. (An earlier version of this comment justified it by
   * "routine contention on the `FOR UPDATE` community lock". That reasoning
   * expired with the lock-free refactor: `listSitePages` now locks only on the
   * branch that creates a missing home page, so a mature community's read
   * contends with nothing. The remaining causes are ordinary — a timeout, a
   * connection blip, a failed deploy of one lambda — and none of them is rare
   * enough to leave unhandled.) A null `effectivePageId` is not a harmless
   * "not known yet" here:
   * `blocksForPage(blocks, null)` returns the list UNCHANGED, which would
   * concatenate every page's sections into one canvas and send every write to
   * the home-page default. Falling back to the client query turns a silently
   * wrong editor into a correct one that took an extra round-trip.
   */
  // `?? pages[0]` is the same real fallback the repair below keeps, and it has
  // to be on BOTH or they disagree: a community whose home flag is somehow
  // unset would resolve to no page at all here, and `blocksForPage(blocks,
  // null)` returns the list UNCHANGED — every page's sections on one canvas,
  // every write defaulting to home. Repair cannot rescue that, because it only
  // runs once a page has been explicitly selected.
  const homePageId =
    initialPages.find((page) => page.isHome)?.id ??
    pages?.find((page) => page.isHome)?.id ??
    pages?.[0]?.id ??
    null;
  const effectivePageId = selectedPageId ?? homePageId;

  /*
   * BOTH page reads failed, and that is not a degraded editor — it is a wrong
   * one.
   *
   * The seed returns `[]` on error and the client query can fail for the same
   * reason (the same lock, the same database). `effectivePageId` is then null,
   * and `blocksForPage(blocks, null)` returns the list UNCHANGED: every page's
   * sections concatenated into one canvas, with no banner. Adds land on the
   * live home page, and editing a section that belongs to another page fails
   * with "Position 7 is already used by another page" — an instruction the
   * editor offers no control to follow.
   *
   * `use-selected-site-page.tsx` states the invariant this violates in its own
   * header: the editor must not render block-editing affordances before it
   * knows which page is selected. So when this is true, it does not — the
   * canvas, the Add panel and the Inspector are all withheld and the PM is told
   * why, with a retry.
   *
   * `pagesFailed` specifically, not `pages === undefined`: a query still in
   * flight is a normal first paint, and blanking the editor on it would flash a
   * failure banner on every load.
   */
  const pagesUnavailable = effectivePageId === null && pagesFailed;

  /**
   * Announcement for a page change that has no visible confirmation of its own.
   *
   * Lives here for the same reason the pending mark does: `PagesPanel` sets it
   * in the same batch as the selection change, and that change remounts the
   * panel via the `key` below — so a live region inside the panel is torn down
   * and rebuilt before the string can ever be announced. The panel keeps its
   * own region for reorders, which do not switch page and therefore survive.
   */
  const [pageAnnouncement, setPageAnnouncement] = useState('');

  const handleSelectPage = useCallback(
    (pageId: number, options?: { pending?: boolean; announce?: string }) => {
      setSelectedPageId(pageId);
      // Cleared, not left alone, when this is an ordinary selection: a stale
      // mark from an earlier creation would suppress repair for a page the PM
      // has since navigated away from.
      setPendingSelectionId(options?.pending ? pageId : null);
      // An ordinary page change abandons a "Fix this" that never resolved.
      // Leaving it armed would let it fire on some later remount, moving a
      // selection the PM did not ask for.
      setPendingSelectSlot(null);
      // Cleared here too. Deleting a page you are NOT currently on sets the
      // mark and the repair never runs, so nothing else would ever clear it —
      // safe today only because re-selecting a deleted `bigserial` id is
      // impossible, which is safety by accident of id allocation rather than by
      // construction.
      setSelfRemovedPageId(null);
      setFocusSelectedRow(true);
      setPageAnnouncement(options?.announce ?? '');
    },
    [],
  );

  // Released when — and only when — the list catches up. Releasing on "the
  // selection moved elsewhere" defeats the mechanism: at the moment the mark is
  // set, the list is BY DEFINITION not showing the new page yet.
  useEffect(() => {
    if (pendingSelectionId !== null && pages?.some((page) => page.id === pendingSelectionId)) {
      setPendingSelectionId(null);
    }
  }, [pages, pendingSelectionId]);

  /*
   * Selection repair, hoisted out of `PagesPanel`.
   *
   * The panel is dynamically imported and mounted only while its own tab is
   * active, so repair living there was absent in the window where the selected
   * page most commonly disappears: a publish that applies a staged removal,
   * which invalidates the whole `['pm','site']` prefix (D10′) and is normally
   * started from the shell header with Sections showing. `selectedPageId` then
   * named a deleted page, `blocksForPage` returned `[]`, and the canvas went
   * silently blank while subsequent writes 404'd.
   *
   * `pages === undefined` — still loading, or the read failed — is NOT a stale
   * selection; repairing on it would discard the server seed on every mount.
   */
  const home = pages?.find((page) => page.isHome) ?? pages?.[0];
  const selectionNeedsRepair =
    pages !== undefined &&
    home !== undefined &&
    selectedPageId !== null &&
    selectedPageId !== pendingSelectionId &&
    !pages.some((page) => page.id === selectedPageId);

  useEffect(() => {
    // Converges in one step: afterwards the selected id IS home's, so the
    // condition above is false and the effect does not re-fire.
    if (!selectionNeedsRepair || !home) return;
    const selfInflicted = selectedPageId === selfRemovedPageId;
    setSelectedPageId(home.id);
    setSelfRemovedPageId(null);
    setFocusSelectedRow(false);
    // SAID OUT LOUD, not done quietly — unless the PM did it themselves.
    //
    // The common cause is a co-manager publishing a staged removal of the page
    // you had open, and a silent swap is the wrong-but-200 this repair exists
    // to prevent, only with the destination reversed: the canvas repopulates
    // with home's sections, the PM keeps editing believing they are elsewhere,
    // and every write now lands on the LIVE home page and succeeds.
    //
    // But the same effect also fires one tick after the PM deletes the page
    // they were on, which already toasted "X was deleted." Telling them a page
    // is "no longer available" immediately afterwards describes their own
    // action back at them as if it were someone else's, and the alarm that
    // matters is the one that never cries wolf. The repair still RUNS — only
    // the announcement is suppressed.
    if (selfInflicted) return;
    // …and `selfRemovedPageId` only ever covers the IMMEDIATE hard delete, by
    // design (`PagesPanelProps.onPageRemoved`). The far more common route to
    // this effect is a published page, which cannot be hard-deleted at all: the
    // PM stages it, publishes, `usePublishSite` invalidates the whole
    // `['pm','site']` prefix (D10′), and the page leaves the list one beat after
    // the success toast. That path fired the co-manager alarm at the person who
    // had just deliberately caused it and been congratulated for it.
    //
    // The client still has no actor identity, and does not need one: the
    // STAGING STATE is enough. A page the PM was watching go away — the
    // `staged-page-banner` sat on this very screen saying so — needs a
    // confirmation, not an alarm. A page that vanished with no staging visible
    // is the genuinely unexplained event, and keeps the original wording.
    // Both sentences are true whoever pressed publish.
    const message = selectedPageWasStagedRef.current
      ? `"${selectedPageNameRef.current ?? 'That page'}" has been removed. You are now editing the home page.`
      : 'The page you were editing is no longer available. You are now editing the home page.';
    setPageAnnouncement(message);
    toast.info(message);
  }, [home, selectionNeedsRepair, selectedPageId, selfRemovedPageId]);

  /*
   * D-C2. The provider feeds `SectionList` — the DEFAULT tool — and the
   * Inspector, both of which sit beside the canvas and are read as one view
   * with it, so they get the same narrowing `Canvas` applies.
   *
   * Unfiltered, they listed every page's sections next to a one-page canvas,
   * and selecting a foreign row opened the Inspector on a block whose write
   * `assertSlotFreeAcrossPages` rejects — the selected page's id travels with
   * it (D-WRITE) and does not match the block's slot. A brand-new empty page
   * showed home's sections instead of its empty state.
   *
   * The whole-site list is still what the publish diff and the slot allocator
   * read (D-C3); they call `useContentBlocks` directly, not this context.
   */
  const pageBlocks = useMemo(
    () => blocksForPage(blocks ?? [], effectivePageId),
    [blocks, effectivePageId],
  );

  /*
   * The page being edited is on its way out.
   *
   * Said on the EDITING surface, not only as a "Removing" badge in the Pages
   * panel — that badge is in a tab the PM may never open, and the whole failure
   * is someone editing a page they do not know is going away. Writes to a staged
   * page SUCCEED (`resolvePageId` checks only `deletedAt`, which staging does
   * not set), so the editor happily reports "Saved" for work the next publish
   * will delete. Nothing else on screen contradicts that.
   *
   * Not blocked, only announced: the removal is still cancellable, and a PM who
   * changes their mind may legitimately keep editing. Refusing the write would
   * break that, and it is not this component's call to make.
   *
   * Shown to whoever staged it as well as to a co-manager. It is equally true
   * for both, and telling them apart would need an actor identity the client
   * does not have.
   */
  // `?? initialPages` because the RSC seed and the client query fail
  // independently, and the seed carries `deleteStagedAt` too: reading only
  // `pages` would make the warning silently absent for a session whose pages
  // query is failing — the one session least able to notice anything else is
  // wrong.
  //
  // Note this is the OPPOSITE precedence to `homePageId`, which reads the seed
  // first. An earlier comment here claimed the two were the same rule; they are
  // not, and both are deliberate. `homePageId` wants the value available on the
  // FIRST paint, before any query resolves, because a null page id makes
  // `blocksForPage` return every page's blocks. This wants the FRESHEST value,
  // because staging happens after load and a seed that predates it would hide a
  // removal the PM needs to see. Residual: if the query never succeeds, this
  // falls back to a seed that can be stale — an under-warning, which is the
  // safer direction than warning about a removal that was cancelled.
  const selectedPage = (pages ?? initialPages).find((page) => page.id === effectivePageId);
  const selectedPageIsStaged = selectedPage !== undefined && isStagedForRemoval(selectedPage);

  /*
   * The preview gate below unmounts the dialog; this is what closes it.
   *
   * Without this, `previewOpen` stays true while `pagesUnavailable` suppresses
   * the render — so the moment a retry succeeds and the flag clears, the dialog
   * springs back open over whatever the PM moved on to, having been dismissed
   * by nobody. Withholding a surface and forgetting the state that opened it is
   * a deferred pop-up, not a gate.
   */
  useEffect(() => {
    if (!pagesUnavailable) return;
    /*
     * The STATE half and the FOCUS half. The first version did only the state.
     *
     * This gate UNMOUNTS the dialog rather than closing it through Radix, so
     * `FocusScope`'s cleanup restores focus to the element it stored on open —
     * the Preview button — which the same render has just disabled via
     * `canPreview`. `focus()` on a disabled button is a no-op, so a keyboard PM
     * lands on `<body>`, at the top of a document whose main surface has just
     * been replaced by a danger banner and a retry they now have to Tab to find.
     *
     * Only when the dialog was actually open: this effect also runs on a first
     * paint that fails, where nothing had focus to lose and grabbing it would
     * be the ambush.
     *
     * Read from a REF, not from a `setPreviewOpen` updater. Scheduling the
     * focus inside the updater made it a side effect in a function React
     * requires to be pure — and calls more than once (the eager-state bail-out
     * check, a render replay, StrictMode's double-invoke), so the focus was
     * scheduled two or three times per transition. `focus()` is idempotent, so
     * nothing was observably wrong; it was also unassertable, which is the
     * other half of why it moves here.
     *
     * The RETURN leg is `previewGateTookFocusRef`: when the read recovers, the
     * banner unmounts and takes the focused "Try again" with it, dropping the
     * PM on `<body>` — the exact state this effect exists to prevent, on the
     * way out of the same round trip. Focus goes back to Preview, which that
     * same render re-enables.
     */
    if (previewOpenRef.current) {
      previewGateTookFocusRef.current = true;
      queueMicrotask(() => retryPagesRef.current?.focus());
    }
    setPreviewOpen(false);
  }, [pagesUnavailable]);

  // The return leg. Separate effect rather than an `else` above, because it
  // must run on the render where `pagesUnavailable` goes FALSE — at which point
  // the early return above has already fired.
  useEffect(() => {
    if (pagesUnavailable) return;
    if (!previewGateTookFocusRef.current) return;
    previewGateTookFocusRef.current = false;
    queueMicrotask(() => previewButtonRef.current?.focus());
  }, [pagesUnavailable]);

  // Guarded on `selectedPage !== undefined` deliberately: the tick that makes
  // the repair necessary is the tick the page stops being findable, so writing
  // unconditionally would overwrite the answer with `false`/`null` a render
  // before it is read. See the refs' own note.
  useEffect(() => {
    if (!selectedPage) return;
    selectedPageWasStagedRef.current = isStagedForRemoval(selectedPage);
    selectedPageNameRef.current = selectedPage.name;
  }, [selectedPage]);

  /*
   * `publicSiteUrl` is passed through as the community ROOT, deliberately.
   *
   * Round 5 asked for it to carry the selected page's slug ("'View site' never
   * opens the page being edited"). It cannot, and the reason is worth writing
   * down so the next round does not re-derive it: the editor has no desktop
   * "View site" affordance at all. `EditorShell` forwards this prop to exactly
   * one consumer, `PhoneGate`, which it returns INSTEAD of the editor on a
   * narrow viewport — so on every render that reads this link, the Pages panel
   * has never been mounted, `selectedPageId` is still null, and
   * `effectivePageId` is the seeded home page whose slug is `''`. A
   * page-suffixed URL would be dead code that reads as a working feature.
   *
   * (`DomainPanel` has its own "View site" link, but that one points at the
   * community's CUSTOM domain root and is about DNS, not about which page is
   * open.)
   *
   * The other half of that finding — the preview never naming the page — was
   * real and is fixed: `PreviewDialog` is page-scoped and now titled after the
   * page. Giving the editor a desktop "open this page" link is a new
   * affordance, not a correction, and belongs in its own change.
   */

  /*
   * A page picked from the top bar's "Editing page" menu.
   *
   * Not `handleSelectPage`: that one is the Pages panel's and sets
   * `focusSelectedRow`, which would pull focus into the panel's list when the
   * picker has already handed it back to its own trigger. Everything else it
   * clears is cleared here too, for the same reasons given there.
   */
  const handlePickPage = useCallback((pageId: number) => {
    setSelectedPageId(pageId);
    setPendingSelectionId(null);
    setPendingSelectSlot(null);
    setSelfRemovedPageId(null);
    setFocusSelectedRow(false);
    setPageAnnouncement('');
  }, []);
  const handlePreview = useCallback(() => setPreviewOpen(true), []);
  const handlePublish = useCallback(() => setPublishOpen(true), []);
  // "Fix this" hands back the PAGE and the block_order slot together. Surfacing
  // the Sections panel is this component's job; selecting the row needs the
  // editor context, so it happens one level down in PublishSheetMount.
  //
  // It also switches PAGE when the offending section is on another one. Since
  // D-C2 the editor context is page-scoped while the publish sheet's issues
  // cover every page, so an issue routinely names a section the current page's
  // `movableSections` does not contain — and `PublishSheetMount`'s `find` would
  // silently return undefined, closing the sheet and selecting nothing.
  //
  // The page arrives WITH the issue rather than being looked up from the slot.
  // The old form asked a slot→page map which page a slot was on, and that
  // question stops having one answer the moment 11c lets two pages hold the
  // same slot: the lookup would return whichever page won, and "Fix this" would
  // carry the PM confidently to the wrong page's section — right slot number,
  // wrong page, no error anywhere. `Issue.pageId` has carried the answer since
  // 11b; this now uses it.
  //
  // Switching page was only HALF the fix, and the other half was missing for a
  // round: `PublishSheetMount` resolves the slot against the PRE-switch
  // `movableSections`, so on a cross-page issue it finds nothing — and even if
  // it did, the `key` remount would discard the selection. So the intent is
  // parked in `pendingSelectSlot` and honoured by the provider that replaces
  // this one, which is the first instance whose blocks are the right page's.
  // Takes the PM to a section, switching page if it is on another one. The
  // checklist's "Show me" uses this without `handleSelectSlot`'s Sections
  // panel, which would cover the checklist the PM is working through.
  const handleGoToSlot = useCallback(
    (target: SlotTarget) => {
      // Reachable from Settings too (requirements pill, Publish's "Fix this"),
      // whose view hides the rail and canvas this lands on.
      setView('website');
      const targetPageId = Number(target.pageId);
      // `SITE_CHANGE_GROUP` is a non-numeric sentinel for a slot on no page.
      if (!Number.isFinite(targetPageId) || targetPageId === effectivePageId) return;
      setSelectedPageId(targetPageId);
      setPendingSelectionId(null);
      setPendingSelectSlot(target.slot);
      setFocusSelectedRow(false);
      setPageAnnouncement('');
    },
    [effectivePageId],
  );
  const handleSelectSlot = useCallback(
    (target: SlotTarget) => {
      setActiveTool('sections');
      handleGoToSlot(target);
    },
    [handleGoToSlot],
  );
  const handleSlotSelected = useCallback(() => setPendingSelectSlot(null), []);
  // The empty states in the Sections panel and on the canvas both name adding a
  // section; this is what makes them able to do it. Passed as a prop rather
  // than read from context because `setActiveTool` lives HERE — the provider's
  // parent — and only `useSiteEditor` is out of reach from this component.
  const handleGoToAdd = useCallback(() => {
    setView('website');
    setActiveTool('add');
  }, []);

  /*
   * v4 "Add section here": which section the next add goes above.
   *
   * Owned HERE, not by the Add panel or the editor context. The first version
   * lived in the context and the panel cleared it in an unmount cleanup, which
   * React StrictMode's mount → cleanup → mount fired the moment the panel
   * opened — so in the dev editor every "Add section here" appended. Found in
   * the browser; the jsdom tests do not run StrictMode.
   *
   * Keyed on the page it was picked on, so a page switch drops it without an
   * effect. Cleared when the PM picks ANY tool from the rail (including Add
   * itself), because a rail click says nothing about position.
   */
  const [addTarget, setAddTarget] = useState<{ pageId: number | null; blockId: number } | null>(
    null,
  );
  const insertBefore =
    addTarget !== null && addTarget.pageId === effectivePageId ? addTarget.blockId : null;
  const handleInsertAt = useCallback(
    (beforeBlockId: number | null) => {
      setAddTarget(
        beforeBlockId === null ? null : { pageId: effectivePageId, blockId: beforeBlockId },
      );
      setActiveTool('add');
    },
    [effectivePageId],
  );
  const handleToolChange = useCallback((tool: EditorToolId | null) => {
    setAddTarget(null);
    setActiveTool(tool);
  }, []);
  const handleInsertConsumed = useCallback(() => setAddTarget(null), []);
  // The publish sheet's route out of a page-set problem — a duplicate address
  // or a missing home page has no section slot, so "Fix this" cannot reach it.
  const handleGoToPages = useCallback(() => {
    setView('website');
    setActiveTool('pages');
  }, []);
  const handleViewChange = useCallback((next: EditorView) => {
    setView(next);
    // Spent: the PM's own switch opens Settings on its first tab again.
    setSettingsTabRequest(null);
  }, []);
  const handleHelpToggle = useCallback(() => setHelpOpen((open) => !open), []);
  const handleHelpClose = useCallback(() => setHelpOpen(false), []);
  const canOpenPublish = diff.changes.length > 0 || diffFailed;
  const handleShowMe = useCallback((action: HelpAction) => {
    if (action.kind === 'tool') {
      setView('website');
      // Like a rail click: says nothing about position, so "Open Add" appends.
      setAddTarget(null);
      setActiveTool(action.tool);
    } else if (action.kind === 'settings') {
      setView('settings');
      setSettingsTabRequest({ tab: action.tab });
    } else {
      setPublishOpen(true);
    }
  }, []);

  // v4 Phase 3: the manager's own editing mode and checklist progress (#1295).
  const preferences = useSiteEditorPreferences(communityId);
  const { mutate: updatePreferences } = useUpdateSiteEditorPreferences(communityId);
  // Free until the preferences have loaded (and for anyone the route refuses),
  // so a returning manager never sees Guided, or the chooser, flash first.
  const mode: EditorMode = preferences.data?.mode ?? 'free';
  // Closing the chooser without choosing means Free for this visit only.
  const [chooserDismissed, setChooserDismissed] = useState(false);
  // A publish in THIS visit counts too. `hasPublishedSite` is a server prop and
  // nothing refreshes it after a publish, so without the blocks query's
  // `latestPublishedAt` (refetched by the publish's invalidation; same key as
  // `useContentBlocks`, so no extra request) the checklist's Publish step stayed
  // open after a first publish, with a button that then did nothing.
  const publishToken = useSitePublishToken(communityId);
  const everPublished = hasPublishedSite || publishToken.data != null;
  // The shell renders only the phone gate below 768px, so the chooser must not
  // open over it — and a choice saved there would stick on every screen.
  const isPhone = useMediaQuery('(max-width: 767px)');
  const showChooser =
    preferences.data?.mode === null && !hasPublishedSite && !chooserDismissed && !isPhone;
  const [tourOpen, setTourOpen] = useState(false);
  /*
   * Asked for by the first choice, opened once the chooser has GONE. Opening it
   * in the same handler mounted the tour while the chooser — a modal whose
   * focus trap pulls focus back — was still up; the chooser then unmounted and
   * dropped focus on <body>, so the card never had focus and its Escape did
   * nothing. It also showed the Free step for a frame before `mode` landed.
   */
  const [tourPending, setTourPending] = useState(false);
  const tourDone = preferences.data?.tourDone ?? false;
  const handleChooseMode = useCallback(
    (next: EditorMode) => {
      updatePreferences({ mode: next });
      // The tour follows the first choice, once: never for a manager who has
      // already been through it (or skipped it).
      if (!tourDone) setTourPending(true);
    },
    [updatePreferences, tourDone],
  );
  useEffect(() => {
    if (!tourPending || showChooser) return;
    setTourPending(false);
    setTourOpen(true);
  }, [tourPending, showChooser]);
  // However it ends — finished, skipped, Escape, or cut short by Publish or a
  // switch to Settings — it is recorded, so it never starts by itself again.
  const handleTourEnd = useCallback(() => {
    setTourOpen(false);
    if (!tourDone) updatePreferences({ tourDone: true });
  }, [tourDone, updatePreferences]);
  const handleStartTour = useCallback(() => {
    setView('website');
    setTourOpen(true);
  }, []);
  useEffect(() => {
    if (tourOpen && (publishOpen || view !== 'website')) handleTourEnd();
  }, [tourOpen, publishOpen, view, handleTourEnd]);
  const handleChooserDismissed = useCallback(() => setChooserDismissed(true), []);
  const handleModeChange = useCallback(
    (next: EditorMode) => {
      updatePreferences({ mode: next });
      setAddTarget(null);
      setActiveTool(null);
      toast.info(
        next === 'guided'
          ? 'Guided mode: your checklist is on the left.'
          : 'Free edit: all tools are on the left. Switch back any time.',
      );
    },
    [updatePreferences],
  );
  // "Open design", "Review your pages" and "Check it on a phone" are done by
  // doing them, in either mode — so record each the first time it happens.
  const visited = preferences.data?.visited;
  // Each step is sent at most once per visit. A failed write rolls the
  // optimistic `visited` back to a NEW array without the step, which re-runs
  // this effect — without the ref that was a PATCH loop for as long as the
  // tool stayed open.
  const visitsSent = useRef(new Set<string>());
  useEffect(() => {
    if (!visited) return;
    const now = [
      activeTool === 'design' ? 'design' : null,
      activeTool === 'pages' ? 'pages' : null,
      device === 'phone' ? 'phone' : null,
    ] as const;
    for (const step of now) {
      if (step && !visited.includes(step) && !visitsSent.current.has(step)) {
        visitsSent.current.add(step);
        updatePreferences({ visit: step });
      }
    }
  }, [activeTool, device, visited, updatePreferences]);
  const handleStepAction = useCallback(
    (action: EditorStepAction) => {
      setView('website');
      if (action.kind === 'add-section') {
        // Appends, like the rail's Add: a stale "Add section here" target is dropped.
        setAddTarget(null);
        setActiveTool('add');
      }
      else if (action.kind === 'open-documents') setActiveTool('documents');
      else if (action.kind === 'open-tool') setActiveTool(action.tool);
      else if (action.kind === 'preview-phone') setDevice('phone');
      else if (canOpenPublish) setPublishOpen(true);
    },
    [canOpenPublish],
  );
  // Settings → Access links to the records: back to the page, Documents open.
  const handleOpenDocuments = useCallback(() => {
    setView('website');
    setActiveTool('documents');
  }, []);

  return (
    <SelectedSitePageProvider pageId={effectivePageId}>
      {/*
       * OUTSIDE the keyed provider on purpose. A live region only announces
       * changes observed while it is in the DOM, so one that is unmounted and
       * remounted by the very update it is reporting announces nothing.
       */}
      <UndoableRemoveProvider communityId={communityId}>
      {/*
       * Florida-required sections (v4 Phase 2). Whole-site, so it sits OUTSIDE
       * the page-keyed provider and survives page switches. `undefined` while
       * the diff is loading or failed keeps the controls locked and the pill
       * silent — see `RequiredSectionsProviderProps.pages`.
       */}
      <RequiredSectionsProvider
        communityId={communityId}
        communityType={siteIdentity.communityType}
        unitCount={unitCount}
        canEditUnitCount={canEditUnitCount}
        pages={diffPending || diffFailed ? undefined : validated}
      >
      <p
        data-testid="site-page-announcement"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {pageAnnouncement}
      </p>
      <SiteEditorProvider
        /*
         * D-SEL. The key is the whole mechanism, not a React housekeeping
         * detail: switching page REMOUNTS the provider, which discards the
         * canvas selection with it.
         *
         * The alternative — threading a page id through `selectSlot` and
         * checking it on every read — guards against a stale selection. This
         * makes one impossible: there is no code path on which a block id
         * selected on page A can still be selected while page B is open,
         * because the state holding it no longer exists. The provider carries
         * only the selection and one live-region string, so the remount costs
         * nothing worth measuring.
         *
         * `'none'` for the no-page case rather than `undefined`: an undefined
         * key is no key at all, which would silently disable the remount for
         * exactly the community whose page read failed.
         */
        key={effectivePageId ?? 'none'}
        communityId={communityId}
        blocks={pageBlocks}
        // No `onSelect`: in v4 selecting a section opens its inspector and
        // toolbar in place. Pulling the Sections panel forward as well would
        // cover a third of the canvas the PM just clicked on.
        // Cross-page "Fix this": this instance is the one that can resolve it.
        selectSlotOnMount={pendingSelectSlot}
        onSlotSelected={handleSlotSelected}
      >
      <AutosaveStatusProvider>
      {/* Apartments have no records checklist (the route refuses them), so
          they never ask. */}
      {siteIdentity.communityType !== 'apartment' ? (
        <RecordsAttention communityId={communityId} onCount={setRecordsAttention} />
      ) : null}
      <EditorShell
        communityName={communityName}
        // The only thing on screen naming the page while the Sections tool is
        // open — see `EditorTopBarProps.pageName`.
        pageName={selectedPage?.name}
        pages={pages ?? initialPages}
        selectedPageId={effectivePageId}
        onSelectPage={handlePickPage}
        onManagePages={handleGoToPages}
        changeCount={diff.changes.length}
        device={device}
        onDeviceChange={setDevice}
        requirements={
          <RequirementsPill onGoToSection={handleSelectSlot} onAddSection={handleGoToAdd} />
        }
        publicSiteUrl={publicSiteUrl}
        view={view}
        onViewChange={handleViewChange}
        settings={
          view === 'settings' ? (
            <SettingsView
              communityId={communityId}
              community={siteIdentity}
              tagline={tagline}
              initialSettings={initialSiteSettings}
              publicSiteUrl={publicSiteUrl}
              hasSiteCustomDomain={hasSiteCustomDomain}
              onOpenDocuments={handleOpenDocuments}
              tabRequest={settingsTabRequest}
            />
          ) : null
        }
        helpOpen={helpOpen}
        onHelpToggle={handleHelpToggle}
        help={
          helpOpen ? (
            <HelpDrawer
              communityId={communityId}
              view={view}
              onClose={handleHelpClose}
              onShowMe={handleShowMe}
              canPublish={canOpenPublish}
              mode={mode}
              onModeChange={handleModeChange}
              onStartTour={handleStartTour}
            />
          ) : null
        }
        mode={mode}
        onModeChange={handleModeChange}
        steps={
          mode === 'guided' ? (
            <NextSteps
              communityId={communityId}
              communityType={siteIdentity.communityType}
              pageId={effectivePageId}
              homePageId={homePageId}
              homeHero={
                blocks?.find((b) => b.pageId === homePageId && b.blockType === 'hero') ?? null
              }
              everPublished={everPublished}
              pendingChanges={diff.changes.length}
              preferences={preferences.data ?? { marked: [], visited: [] }}
              onMark={(step) => updatePreferences({ mark: step })}
              onAction={handleStepAction}
              onGoToSlot={handleGoToSlot}
              onWarnResidents={() => setActiveTool('notice')}
            />
          ) : null
        }
        toolBadges={recordsAttention > 0 ? { documents: recordsAttention } : undefined}
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
        activeTool={activeTool}
        onActiveToolChange={handleToolChange}
        onPreview={handlePreview}
        onPublish={handlePublish}
        // Openable when there is something to publish — and also when the diff
        // failed to load, because the sheet is the only surface that explains
        // that failure and offers a retry.
        canOpenPublish={canOpenPublish}
        // Withheld for the same reason the canvas is (see the PreviewDialog
        // render below). Disabled with a reason rather than left live and
        // silently inert: a button that does nothing when pressed is the
        // failure mode this whole branch exists to avoid.
        //
        // BOTH conjuncts of that render gate, not just the page one. This
        // shipped as `!pagesUnavailable` alone, which left the button enabled
        // and inert whenever `canvasContext` is null — the community row failed
        // to read, the canvas already says so, and the dialog is gated on it
        // too. Mirroring only part of a render condition is how a control ends
        // up inviting a click it cannot honour.
        canPreview={!pagesUnavailable && canvasContext !== null}
        // The button explains ITS OWN reason. Widening `canPreview` to cover
        // `canvasContext` without widening the explanation left the disabled
        // button blaming the pages read on a screen where the pages loaded
        // fine, the Pages panel works, and the top bar is naming the selected
        // page — telling the PM to retry a read that did not fail.
        previewDisabledReason={
          pagesUnavailable
            ? "We couldn't load this site's pages"
            : "We couldn't load this community's site settings"
        }
        previewButtonRef={previewButtonRef}
        // Driven by whichever inspector form is open. StatusLine renders
        // nothing while idle with no prior save, so this stays invisible until
        // the PM actually edits something.
        status={<AutosaveStatusLine />}
        // One slot, and the removal wins it: the wizard banner is an invitation
        // with no deadline, this is the only thing on screen saying the work in
        // progress is about to be deleted.
        banner={
          pagesUnavailable ? (
            <AlertBanner
              data-testid="pages-unavailable-banner"
              status="danger"
              title="We couldn't load this site's pages."
              description="Editing is paused until we know which page you're on — without it, changes could be saved to the wrong page. Your site is unchanged."
              action={
                <Button
                  ref={retryPagesRef}
                  size="sm"
                  variant="outline"
                  onClick={() => void refetchPages()}
                >
                  Try again
                </Button>
              }
            />
          ) : selectedPageIsStaged ? (
            <AlertBanner
              data-testid="staged-page-banner"
              status="warning"
              title={`"${selectedPage?.name ?? 'This page'}" is set to be removed.`}
              description="It stays on your live site until you publish, and the publish deletes it along with everything on it — including anything you change here now."
              action={
                <Button size="sm" variant="outline" onClick={() => setActiveTool('pages')}>
                  Go to Pages
                </Button>
              }
            />
          ) : showWizardBanner ? (
            <WizardEntryBanner communityId={communityId} />
          ) : null
        }
        renderToolPanel={(tool) => {
          // Nothing that writes a BLOCK is offered while the page is unknown —
          // a write with no page id defaults to the live home page, which is
          // precisely the silent wrong-page save the banner is warning about.
          // The other tools are unaffected: they are not page-scoped.
          if (pagesUnavailable && (tool === 'sections' || tool === 'add')) {
            return (
              <p className="p-4 text-sm text-content-secondary">
                Sections are unavailable until this site&apos;s pages load.
              </p>
            );
          }
          if (tool === 'sections') return <SectionList onAddSection={handleGoToAdd} />;
          if (tool === 'add') {
            return (
              <AddPanel
                communityId={communityId}
                hasPolishBlocks={hasPolishBlocks}
                insertBefore={insertBefore}
                onInsertConsumed={handleInsertConsumed}
              />
            );
          }
          if (tool === 'notice') {
            return (
              <UrgentNoticePanel
                communityId={communityId}
                hasPublishedSite={hasPublishedSite}
                initialNotice={initialNotice}
              />
            );
          }
          if (tool === 'design') {
            return (
              <DesignPanel
                communityId={communityId}
                communityType={siteIdentity.communityType}
                presets={presets}
                hasSiteCustomCss={hasSiteCustomCss}
                theme={resolveStylingTheme(canvasContext)}
              />
            );
          }
          if (tool === 'pages') {
            return (
              <PagesPanel
                communityId={communityId}
                selectedPageId={effectivePageId}
                restoreFocusToSelectedRow={focusSelectedRow}
                onFocusRestored={handleFocusRestored}
                onSelectPage={handleSelectPage}
                onPageRemoved={handlePageRemoved}
              />
            );
          }
          if (tool === 'documents') {
            return (
              <DocumentsPanel
                communityId={communityId}
                communityType={siteIdentity.communityType}
              />
            );
          }
          // Every tool in EDITOR_TOOLS now has a panel. This assignment is the
          // exhaustiveness check: adding an id to EDITOR_TOOLS without a branch
          // above fails typecheck here, instead of shipping a tab that renders
          // "not built yet" to a manager.
          const unhandled: never = tool;
          return unhandled;
        }}
        // Returns null when nothing is selected, so passing it unconditionally
        // costs an empty render rather than a branch here — except while the
        // page is unknown, where an inspector save would target home.
        inspector={pagesUnavailable ? null : <Inspector communityId={communityId} />}
      >
        {pagesUnavailable ? (
          // NOT the unfiltered canvas. `blocksForPage(blocks, null)` returns
          // every page's sections in one scroll, which is a plausible-looking
          // editor for a site that does not exist at any URL.
          <div className="mx-auto max-w-[1000px] px-5 py-4">
            <div className="rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-card p-10 text-center">
              <p className="text-sm text-content-secondary">
                Your sections are hidden until we know which page you&apos;re editing.
              </p>
            </div>
          </div>
        ) : canvasContext ? (
          <Canvas
            communityId={communityId}
            context={canvasContext}
            onAddSection={handleInsertAt}
            device={device}
          />
        ) : (
          <div className="mx-auto max-w-[1000px] px-5 py-4">
            <div className="rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-card p-10 text-center">
              <p className="text-sm text-content-secondary">
                We couldn&apos;t load this community&apos;s site settings.
              </p>
            </div>
          </div>
        )}
      </EditorShell>

      {/*
        * `!pagesUnavailable` belongs here for the same reason it gates the
        * canvas, the Add panel and the Inspector — and it was missing because
        * that list was written out by hand and the preview is not rendered
        * beside them.
        *
        * Left ungated, the preview was the WORST of the four. `blocksForPage`
        * returns the list unchanged for a null page, so the dialog rendered
        * every page's sections in one scroll, titled after the community
        * because there was no page to name it after, under a caption asserting
        * "This is the page you are editing… what visitors see once you
        * publish." — a claim about what will ship, on a screen whose sibling
        * banner says we do not know which page that is. `PreviewDialog`'s own
        * header calls exactly that render "a worse lie than no preview at all".
        */}
      {previewOpen && canvasContext && !pagesUnavailable ? (
        <PreviewDialog
          open
          onOpenChange={setPreviewOpen}
          communityId={communityId}
          context={canvasContext}
          // The dialog renders ONE page, so it is titled after that page.
          pageName={selectedPage?.name}
          // …and must not promise a page the next publish deletes.
          pageIsStaged={selectedPageIsStaged}
        />
      ) : null}

      {showChooser ? (
        <ModeChooser onChoose={handleChooseMode} onDismiss={handleChooserDismissed} />
      ) : null}

      {tourOpen ? <EditorTour mode={mode} onEnd={handleTourEnd} /> : null}

      {publishOpen ? (
        <PublishSheetMount
          communityId={communityId}
          theme={canvasContext?.theme ?? null}
          onOpenChange={setPublishOpen}
          onFixIssue={handleSelectSlot}
          onGoToPages={handleGoToPages}
        />
      ) : null}
      </AutosaveStatusProvider>
      </SiteEditorProvider>
      </RequiredSectionsProvider>
      </UndoableRemoveProvider>
    </SelectedSitePageProvider>
  );
}

/**
 * Renders the publish sheet inside the editor context, so "Fix this" can
 * actually select the offending section.
 *
 * A separate component because `EditorRoot` is the provider's PARENT and cannot
 * call `useSiteEditor` itself.
 */
function PublishSheetMount({
  communityId,
  theme,
  onOpenChange,
  onFixIssue,
  onGoToPages,
}: {
  communityId: number;
  theme: CanvasContext['theme'] | null;
  onOpenChange: (open: boolean) => void;
  onFixIssue: (target: SlotTarget) => void;
  onGoToPages: () => void;
}) {
  const { movableSections, select } = useSiteEditor();
  // From the provider, not a prop: a unit count corrected in the pill this
  // session must re-decide the sheet's checks too.
  const { subject } = useRequiredSections();

  const handleFixIssue = useCallback(
    (target: SlotTarget) => {
      onFixIssue(target);
      // `Issue.slot` is a block_order, not an index — resolve it against the
      // current list rather than treating it as a position.
      //
      // This handles the SAME-page case only, and deliberately. `movableSections`
      // here is still the pre-switch page's — `onFixIssue` has only queued a
      // state update — so on a cross-page issue `find` returns undefined and
      // this no-ops. That case is served by `selectSlotOnMount` on the provider
      // `EditorRoot` is about to remount, which is the first instance holding
      // the target page's blocks. Do not "fix" this by reaching for the new
      // page's list here: there isn't one yet, and the instance that would hold
      // the selection is about to be thrown away.
      const row = movableSections.find((b) => b.blockOrder === target.slot);
      if (row) select(row.id);
    },
    [movableSections, onFixIssue, select],
  );

  return (
    <PublishSheet
      open
      onOpenChange={onOpenChange}
      communityId={communityId}
      // The canvas context already carries the RESOLVED theme (resolveTheme
      // ran server-side in loadCanvasContext), so the contrast advisories get
      // real colours without pulling packages/theme into this bundle. Without
      // this the gate silently reports nothing at all.
      {...(theme
        ? {
            brandColors: {
              primaryColor: theme.primaryColor,
              accentColor: theme.accentColor,
            },
          }
        : {})}
      onFixIssue={handleFixIssue}
      // Page-set problems are fixed in the Pages panel and nowhere else.
      onGoToPages={onGoToPages}
      complianceSubject={subject}
    />
  );
}

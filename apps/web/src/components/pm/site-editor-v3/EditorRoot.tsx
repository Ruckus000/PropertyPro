'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import { useMediaQuery } from '@/hooks/use-media-query';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import { isStagedForRemoval } from '@/lib/site-editor/describe-page-state';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { applyDesignToCanvas, applyLiveLogoToCanvas } from '@/lib/site-editor/canvas-design';
import { navForEditor } from '@/lib/site-editor/editor-nav';
import { useSiteDesign } from '@/hooks/use-site-design';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useLiveBranding } from '@/hooks/use-live-branding';
import type { PresetCardData } from './panels/preset-cards';
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

// v4 Phase 5. The Settings view (site icon, footer, search, sharing image,
// web address and custom domain) is fetched when the PM switches to it, for
// the same budget reason as every panel: the web JS aggregate has little
// headroom, and a PM who never opens Settings should not pay for it.
const SettingsView = dynamic(
  () => import('./settings/SettingsView').then((m) => m.SettingsView),
  { loading: () => null },
);

// Same reasoning again: the Add a part dialog is mounted only while open, so
// the Radix dialog stack and the section catalog — and, behind its own nested
// dynamic import, the image upload flow — arrive on the first "Add a part"
// click. A PM editing existing sections never pays for them.
const AddPartDialog = dynamic(() => import('./AddPartDialog').then((m) => m.AddPartDialog), {
  loading: () => null,
});
// v4 Phase 3. Mounted only while open, so its guide reader (the help modal's
// article body, figures and lightbox) is fetched on the first Help click.
const HelpDrawer = dynamic(() => import('./help/HelpDrawer').then((m) => m.HelpDrawer), {
  loading: () => null,
});
// Type-only: erased at build, so the chunk is not pulled in.
import type { HelpAction } from './help/guides';
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from './settings/settings-tabs';
// The top bar's missing-records link; its query stays out of the first load.
const RecordsAttention = dynamic(
  () => import('./RecordsAttention').then((m) => m.RecordsAttention),
  { ssr: false, loading: () => null },
);
// Code-split, for the same reason as PreviewDialog/PublishSheet above: the
// inspector renders nothing until a section is selected, but a static import
// put its whole subtree — the form registry, and every form's shared field
// chrome — in the initial payload of every PM's editor.
const Inspector = dynamic(() => import('./Inspector').then((m) => m.Inspector), {
  // No `loading`: the inspector's own resting state IS nothing, so a skeleton
  // would appear where a blank column belongs.
  loading: () => null,
});

import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Canvas } from './canvas/Canvas';
import { SiteEditorProvider, useSiteEditor } from './editor-context';
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
import { LinkedFactsProvider } from './inspector/linked-facts-context';
import { SectionSourcesProvider } from './inspector/section-sources-context';
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
  /**
   * The area to open on, from `?view=settings&tab=<id>` (`parseEditorLocation`).
   * Absent means the Website view, as every link to the editor has always meant.
   */
  initialView?: EditorView;
  /** The Site settings tab to open on when `initialView` is `'settings'`. */
  initialSettingsTab?: SettingsTabId;
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
 * because selection and reordering are driven from more than the canvas: the
 * inspector, the Add a part dialog and the publish sheet's "Fix this" read it
 * too. The query key is shared with `Canvas`'s own `useContentBlocks` call, so
 * this adds no second request.
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
  initialPages,
  initialView = 'website',
  initialSettingsTab = DEFAULT_SETTINGS_TAB,
}: EditorRootProps) {
  const { data: blocks } = useContentBlocks(communityId);
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
  // v4 Phase 5: the page being built, or Site settings.
  const [view, setView] = useState<EditorView>(initialView);
  // The Site settings tab showing, or asked for by a link or a Help guide's
  // "Show me". Lives here, above the page-keyed provider, because choosing a
  // page in the Pages tab remounts the whole shell and `SettingsView`'s own
  // state with it. `SettingsView` reports every change, so this is also what a
  // remounted view opens on.
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(initialSettingsTab);
  const settingsTabRequest = useMemo(() => ({ tab: settingsTab }), [settingsTab]);
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
  // The size switcher shows from `lg` up. Below it (an iPad turned to portrait)
  // the canvas is full width, whatever size was picked: a phone-width frame
  // with no switcher to undo it would leave the PM stuck.
  const belowLg = useMediaQuery('(max-width: 1023px)');
  const effectiveDevice: PreviewDevice = belowLg ? 'desktop' : device;

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
   * That release is load-bearing, not tidiness. `PagesPanel` lives in Site
   * settings' Pages tab, so it unmounts when the PM goes back to the page and
   * remounts on the way back. While the flag merely latched, the ordinary
   * journey — click a page, go to the page to add content, return to Pages —
   * remounted the panel with a stale `true` and yanked focus onto the row,
   * which is precisely the ambush the paragraph above says this flag prevents.
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
   * D-C2. The provider feeds the section controls and the Inspector, which sit
   * on and beside the canvas and are read as one view with it, so they get the
   * same narrowing `Canvas` applies.
   *
   * Unfiltered, the old Sections list showed every page's sections next to a
   * one-page canvas, and selecting a foreign row opened the Inspector on a
   * block whose write `assertSlotFreeAcrossPages` rejects — the selected page's
   * id travels with it (D-WRITE) and does not match the block's slot. A brand-new empty page
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
   * The site chrome the canvas and the preview render around the blocks
   * (templates, v4): the page nav projected from the page list, the footer
   * from the site settings, and the page's identity for the empty-state hero.
   * The settings query shares the Settings view's key and seed, so a footer
   * edit there repaints the canvas footer without a second request.
   */
  const { data: siteSettings } = useSiteSettings(communityId, initialSiteSettings);
  const canvasNav = useMemo(
    () => navForEditor(pages ?? initialPages, effectivePageId),
    [pages, initialPages, effectivePageId],
  );
  const canvasFooter = siteSettings?.footer;
  const canvasPage = selectedPage
    ? { name: selectedPage.name, isHome: selectedPage.isHome }
    : undefined;

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
    // The Add a part dialog is gated the same way, for the same reason: it
    // must not spring back open when the read recovers.
    setAddOpen(false);
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
  // "Fix this" hands back the PAGE and the block_order slot together. Showing
  // the page is this component's job; selecting the section needs the editor
  // context, so it happens one level down in PublishSheetMount.
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
  // Takes the PM to a section, switching page if it is on another one.
  const handleGoToSlot = useCallback(
    (target: SlotTarget) => {
      // Reachable from Settings too (requirements pill, Publish's "Fix this"),
      // whose view hides the canvas this lands on.
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
  const handleSlotSelected = useCallback(() => setPendingSelectSlot(null), []);

  /*
   * Site settings, on one tab: the route every caller that used to open a rail
   * tool now takes — "Add or manage pages", the staged-page banner, the publish
   * sheet's "Go to Pages", the canvas's navigation bar, the Add a part
   * dialog's "Manage pages", and Help's "Show me".
   */
  const openSettingsTab = useCallback((tab: SettingsTabId) => {
    setView('settings');
    setSettingsTab(tab);
  }, []);
  const handleGoToPages = useCallback(() => openSettingsTab('pages'), [openSettingsTab]);

  /*
   * "Add a part" (combined plan Task 28): which section the next add goes
   * above, and whether the dialog is open.
   *
   * The target is owned HERE, not by the Add panel or the editor context. The
   * first version lived in the context and the panel cleared it in an unmount
   * cleanup, which React StrictMode's mount → cleanup → mount fired the moment
   * the panel opened — so in the dev editor every "Add section here" appended.
   * Found in the browser; the jsdom tests do not run StrictMode.
   *
   * Keyed on the page it was picked on, so a page switch drops it without an
   * effect. An opener with no position (Help, the requirements pill, the empty
   * page, the end of the page) clears it, so those add to the end.
   */
  const [addTarget, setAddTarget] = useState<{ pageId: number | null; blockId: number } | null>(
    null,
  );
  const [addOpen, setAddOpen] = useState(false);
  /** The "Add a part" button that opened the dialog; focus goes back to it. */
  const addOpenerRef = useRef<HTMLElement | null>(null);
  const insertBefore =
    addTarget !== null && addTarget.pageId === effectivePageId ? addTarget.blockId : null;
  const openAdd = useCallback(
    (beforeBlockId: number | null, opener: HTMLElement | null) => {
      setView('website');
      setAddTarget(
        beforeBlockId === null ? null : { pageId: effectivePageId, blockId: beforeBlockId },
      );
      addOpenerRef.current =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setAddOpen(true);
    },
    [effectivePageId],
  );
  const handleInsertAt = useCallback(
    (beforeBlockId: number | null, opener: HTMLElement) => openAdd(beforeBlockId, opener),
    [openAdd],
  );
  // The requirements pill's "Add" for a required section no page has: to the end.
  const handleGoToAdd = useCallback(() => openAdd(null, null), [openAdd]);
  const handleAddOpenChange = useCallback((open: boolean) => {
    setAddOpen(open);
    if (!open) setAddTarget(null);
  }, []);
  const handleInsertConsumed = useCallback(() => setAddTarget(null), []);
  // The dialog closes once a part is added — the new section's settings open
  // beside the page — and its own live region goes with it, so the addition is
  // announced from the editor's region, which outlives it.
  const handleAdded = useCallback((label: string) => {
    setAddOpen(false);
    setAddTarget(null);
    setPageAnnouncement(`${label} section added. Its settings are open.`);
  }, []);
  // The dialog's "Manage pages": the navigation bar is built from the pages.
  const handleAddGoToPages = useCallback(() => {
    setAddOpen(false);
    setAddTarget(null);
    openSettingsTab('pages');
  }, [openSettingsTab]);

  const handleViewChange = useCallback((next: EditorView) => {
    setView(next);
    // Spent: the PM's own switch opens Site settings on its first tab again.
    setSettingsTab(DEFAULT_SETTINGS_TAB);
  }, []);
  const handleHelpToggle = useCallback(() => setHelpOpen((open) => !open), []);
  const handleHelpClose = useCallback(() => setHelpOpen(false), []);
  const canOpenPublish = diff.changes.length > 0 || diffFailed;
  const handleShowMe = useCallback(
    (action: HelpAction) => {
      if (action.kind === 'add') {
        // Says nothing about position, so the part goes at the end.
        openAdd(null, null);
      } else if (action.kind === 'settings') {
        openSettingsTab(action.tab);
      } else {
        setPublishOpen(true);
      }
    },
    [openAdd, openSettingsTab],
  );

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
        // No `onSelect`: selecting a section opens its inspector and toolbar
        // in place, and that is all it needs to do.
        // Cross-page "Fix this": this instance is the one that can resolve it.
        selectSlotOnMount={pendingSelectSlot}
        onSlotSelected={handleSlotSelected}
      >
      <AutosaveStatusProvider>
      <EditorShell
        communityName={communityName}
        // The only thing on screen naming the page — see
        // `EditorTopBarProps.pageName`.
        pageName={selectedPage?.name}
        pages={pages ?? initialPages}
        selectedPageId={effectivePageId}
        onSelectPage={handlePickPage}
        onManagePages={handleGoToPages}
        changeCount={diff.changes.length}
        device={effectiveDevice}
        onDeviceChange={setDevice}
        requirements={
          <RequirementsPill onGoToSection={handleGoToSlot} onAddSection={handleGoToAdd} />
        }
        // Condos and HOAs only: apartments owe no records, and the count's
        // route refuses them. The page has already required a manager with
        // the site editor, the rest of the sidebar badge's condition.
        records={
          <RecordsAttention
            communityId={communityId}
            enabled={
              siteIdentity.communityType === 'condo_718' ||
              siteIdentity.communityType === 'hoa_720'
            }
          />
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
              tabRequest={settingsTabRequest}
              onTabChange={setSettingsTab}
              pagesPanel={{
                selectedPageId: effectivePageId,
                restoreFocusToSelectedRow: focusSelectedRow,
                onFocusRestored: handleFocusRestored,
                onSelectPage: handleSelectPage,
                onPageRemoved: handlePageRemoved,
              }}
              designPanel={{
                presets,
                hasSiteCustomCss,
                theme: resolveStylingTheme(canvasContext),
              }}
              noticePanel={{ hasPublishedSite, initialNotice }}
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
            />
          ) : null
        }
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
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
        // The only thing on screen saying the work in progress is about to be
        // deleted, or that the pages could not be read.
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
                <Button size="sm" variant="outline" onClick={handleGoToPages}>
                  Go to Pages
                </Button>
              }
            />
          ) : null
        }
        // Returns null when nothing is selected, so passing it unconditionally
        // costs an empty render rather than a branch here — except while the
        // page is unknown, where an inspector save would target home.
        inspector={
          pagesUnavailable ? null : (
            // The hero form previews its linked fields with the facts the canvas
            // draws them with, and each section's panel says where its content
            // comes from with the same canvas context.
            <LinkedFactsProvider facts={canvasContext?.community ?? null}>
              <SectionSourcesProvider
                layoutId={canvasContext?.layout ?? null}
                contact={canvasContext?.preview.contact ?? null}
                ownerRecordGroups={canvasContext?.ownerRecordGroups ?? null}
                // Apartments owe no records list, so their Documents panel says
                // nothing about owners' records.
                recordsApply={siteIdentity.communityType !== 'apartment'}
              >
                <Inspector communityId={communityId} />
              </SectionSourcesProvider>
            </LinkedFactsProvider>
          )
        }
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
            device={effectiveDevice}
            nav={canvasNav}
            footer={canvasFooter}
            page={canvasPage}
            onEditNavigation={handleGoToPages}
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
          nav={canvasNav}
          footer={canvasFooter}
          page={canvasPage}
        />
      ) : null}

      {publishOpen ? (
        <PublishSheetMount
          communityId={communityId}
          theme={canvasContext?.theme ?? null}
          layout={canvasContext?.layout ?? null}
          onOpenChange={setPublishOpen}
          onFixIssue={handleGoToSlot}
          onGoToPages={handleGoToPages}
        />
      ) : null}

      {/*
        * Inside the page-keyed provider: the catalog selects the section it
        * adds, and positions it, through the editor context. Withheld while the
        * page is unknown, like the canvas and the inspector: a section written
        * now would land on the live home page.
        */}
      {addOpen && !pagesUnavailable ? (
        <AddPartDialog
          onOpenChange={handleAddOpenChange}
          restoreFocusTo={addOpenerRef}
          communityId={communityId}
          hasPolishBlocks={hasPolishBlocks}
          insertBefore={insertBefore}
          onInsertConsumed={handleInsertConsumed}
          onAdded={handleAdded}
          onGoToPages={handleAddGoToPages}
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
  layout,
  onOpenChange,
  onFixIssue,
  onGoToPages,
}: {
  communityId: number;
  theme: CanvasContext['theme'] | null;
  layout: CanvasContext['layout'] | null;
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
              secondaryColor: theme.secondaryColor,
            },
          }
        : {})}
      onFixIssue={handleFixIssue}
      // The draft look's layout, like the colours: a look that paints the
      // secondary colour behind text gets text and headings checked on it.
      {...(layout ? { layout } : {})}
      // Page-set problems are fixed in the Pages panel and nowhere else.
      onGoToPages={onGoToPages}
      complianceSubject={subject}
    />
  );
}

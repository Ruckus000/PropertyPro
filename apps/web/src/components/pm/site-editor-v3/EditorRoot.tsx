'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import dynamic from 'next/dynamic';
import { EditorShell } from './EditorShell';
import { StatusLine } from './StatusLine';

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

// Phase 7. Deferred for the same budget reason, and it works because the panel
// body is only rendered when its tab is active — so the chunk (form + the Radix
// alert-dialog stack behind the remove confirmation) is requested on the click,
// not on mount. A PM who never posts a notice never pays for it.
const UrgentNoticePanel = dynamic(
  () => import('./panels/UrgentNoticePanel').then((m) => m.UrgentNoticePanel),
  { loading: () => null },
);

// Phase 8. Same reasoning as the notice panel: `renderToolPanel` only renders
// the ACTIVE tool, so this chunk (the form, the switches, the favicon upload
// path) is requested on the tab click rather than on mount. A PM who never
// opens Site pays nothing for it — which is the whole reason this route is
// still inside its 700 KiB budget.
const SitePanel = dynamic(
  () => import('./panels/SitePanel').then((m) => m.SitePanel),
  { loading: () => null },
);

// Same reasoning again: only the active tool's panel is rendered, so the Add
// catalog — and, behind its own nested dynamic import, the image upload flow —
// is fetched on the tab click. A PM editing existing sections never pays for it.
const AddPanel = dynamic(() => import('./panels/AddPanel').then((m) => m.AddPanel), {
  loading: () => null,
});

// The two Pro tools, split for the same budget reason as everything above — and
// with more force, since they are the two panels the median PM opens least. The
// domain panel in particular pulls its own query stack and DNS table.
const StylingPanel = dynamic(
  () => import('./panels/StylingPanel').then((m) => m.StylingPanel),
  { loading: () => null },
);
const DomainPanel = dynamic(
  () => import('./panels/DomainPanel').then((m) => m.DomainPanel),
  { loading: () => null },
);
const HelpPanel = dynamic(() => import('./panels/HelpPanel').then((m) => m.HelpPanel), {
  loading: () => null,
});

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
import type { EditorToolId, ProToolAccess } from './tools';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';
import { UndoableRemoveProvider } from './undoable-remove-context';
import { useSitePages, type SitePageSummary } from '@/hooks/use-site-pages';
import type { CustomCssOverrides } from '@propertypro/shared';
import { THEME_DEFAULTS } from '@propertypro/theme';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';
import type { SiteSettingsRecord } from '@/hooks/use-site-settings';
import type { SitePanelProps } from './panels/SitePanel';
import type { StylingPanelTheme } from './panels/StylingPanel';
import { AutosaveStatusProvider, useAutosaveStatus } from './inspector/autosave-status';
import { useSiteDiff } from './use-site-diff';

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
  proToolAccess: ProToolAccess;
  /**
   * `hasSitePolishBlocks` — whether the plan includes the FAQ / Gallery /
   * Amenities blocks the Add panel offers.
   *
   * Deliberately NOT folded into `proToolAccess`. That map is keyed by
   * `TOOL_PLAN_FEATURE`, and `ToolTabs` renders any tool present in it as
   * Pro-locked — so adding `add` there would lock the Add TAB, which is false:
   * seven of the ten types it offers are available on Essentials. This gates
   * three rows inside the panel, not the panel.
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
  tagline: string | null;
  initialSiteSettings: SiteSettingsRecord | undefined;
  /**
   * Stored Pro+ colour/font overrides, from the same `branding` read that
   * feeds the Site panel. The Colours panel needs no query of its own.
   *
   * There is no matching prop for the Address panel: its state lives at
   * Vercel, and server-seeding it would put a provider round-trip on every
   * editor load for a tab most PMs never open. It fetches on mount instead.
   */
  initialCustomCss: CustomCssOverrides | null;
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
 * What the site renders today — the Colours panel seeds its pickers from this
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
  proToolAccess,
  hasPolishBlocks,
  canvasContext,
  hasPublishedSite,
  initialNotice,
  siteIdentity,
  tagline,
  initialSiteSettings,
  initialCustomCss,
  showWizardBanner,
  initialPages,
}: EditorRootProps) {
  const { data: blocks } = useContentBlocks(communityId);
  // Shares the blocks query key, so this adds no request — and the publish
  // sheet calls the same hook, so the button's state and the sheet's "N changes
  // ready to publish" can never disagree.
  const { diff, isError: diffFailed, slotGroups } = useSiteDiff(communityId);
  const [activeTool, setActiveTool] = useState<EditorToolId>('sections');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

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
   * it never steals focus for a switch the PM did not initiate here.
   */
  const [focusSelectedRow, setFocusSelectedRow] = useState(false);
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
    const message = 'The page you were editing is no longer available. You are now editing the home page.';
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
  const selectedPageIsStaged = selectedPage?.deleteStagedAt != null;

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

  // Selecting a section on the canvas pulls the Sections panel forward, so the
  // controls for what you just clicked are visible without a second action.
  const handleSelect = useCallback(() => setActiveTool('sections'), []);
  const handlePreview = useCallback(() => setPreviewOpen(true), []);
  const handlePublish = useCallback(() => setPublishOpen(true), []);
  // "Fix this" hands back a block_order slot. Surfacing the Sections panel is
  // this component's job; selecting the row needs the editor context, so it
  // happens one level down in PublishSheetMount.
  //
  // It also switches PAGE when the offending section is on another one. Since
  // D-C2 the editor context is page-scoped while the publish sheet's issues
  // come from the whole-site snapshot, so an issue's slot routinely names a
  // section the current page's `movableSections` does not contain — and
  // `PublishSheetMount`'s `find` would silently return undefined, closing the
  // sheet and selecting nothing. The slot → page map comes from `useSiteDiff`,
  // which already builds it for change grouping.
  //
  // Switching page was only HALF the fix, and the other half was missing for a
  // round: `PublishSheetMount` resolves the slot against the PRE-switch
  // `movableSections`, so on a cross-page issue it finds nothing — and even if
  // it did, the `key` remount would discard the selection. So the intent is
  // parked in `pendingSelectSlot` and honoured by the provider that replaces
  // this one, which is the first instance whose blocks are the right page's.
  const handleSelectSlot = useCallback(
    (slot: number) => {
      setActiveTool('sections');
      const group = slotGroups.get(slot);
      if (group === undefined) return;
      const targetPageId = Number(group);
      // `SITE_CHANGE_GROUP` is a non-numeric sentinel for a slot on no page.
      if (!Number.isFinite(targetPageId) || targetPageId === effectivePageId) return;
      setSelectedPageId(targetPageId);
      setPendingSelectionId(null);
      setPendingSelectSlot(slot);
      setFocusSelectedRow(false);
      setPageAnnouncement('');
    },
    [effectivePageId, slotGroups],
  );
  const handleSlotSelected = useCallback(() => setPendingSelectSlot(null), []);
  // The empty states in the Sections panel and on the canvas both name adding a
  // section; this is what makes them able to do it. Passed as a prop rather
  // than read from context because `setActiveTool` lives HERE — the provider's
  // parent — and only `useSiteEditor` is out of reach from this component.
  const handleGoToAdd = useCallback(() => setActiveTool('add'), []);
  // The publish sheet's route out of a page-set problem — a duplicate address
  // or a missing home page has no section slot, so "Fix this" cannot reach it.
  const handleGoToPages = useCallback(() => setActiveTool('pages'), []);

  return (
    <SelectedSitePageProvider pageId={effectivePageId}>
      {/*
       * OUTSIDE the keyed provider on purpose. A live region only announces
       * changes observed while it is in the DOM, so one that is unmounted and
       * remounted by the very update it is reporting announces nothing.
       */}
      <UndoableRemoveProvider communityId={communityId}>
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
        onSelect={handleSelect}
        // Cross-page "Fix this": this instance is the one that can resolve it.
        selectSlotOnMount={pendingSelectSlot}
        onSlotSelected={handleSlotSelected}
      >
      <AutosaveStatusProvider>
      <EditorShell
        communityName={communityName}
        // The only thing on screen naming the page while the Sections tool is
        // open — see `EditorTopBarProps.pageName`.
        pageName={selectedPage?.name}
        publicSiteUrl={publicSiteUrl}
        proToolAccess={proToolAccess}
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
        activeTool={activeTool}
        onActiveToolChange={setActiveTool}
        onPreview={handlePreview}
        onPublish={handlePublish}
        // Openable when there is something to publish — and also when the diff
        // failed to load, because the sheet is the only surface that explains
        // that failure and offers a retry.
        canOpenPublish={diff.changes.length > 0 || diffFailed}
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
                <Button size="sm" variant="outline" onClick={() => void refetchPages()}>
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
          // The site/branding/domain/help tools are unaffected: they are not
          // page-scoped.
          if (pagesUnavailable && (tool === 'sections' || tool === 'add')) {
            return (
              <p className="p-4 text-sm text-content-secondary">
                Sections are unavailable until this site&apos;s pages load.
              </p>
            );
          }
          if (tool === 'sections') return <SectionList onAddSection={handleGoToAdd} />;
          if (tool === 'add') {
            return <AddPanel communityId={communityId} hasPolishBlocks={hasPolishBlocks} />;
          }
          if (tool === 'site') {
            return (
              <SitePanel
                communityId={communityId}
                community={siteIdentity}
                tagline={tagline}
                initialSettings={initialSiteSettings}
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
          if (tool === 'styling') {
            return (
              <StylingPanel
                communityId={communityId}
                hasSiteCustomCss={proToolAccess.styling}
                initial={initialCustomCss}
                theme={resolveStylingTheme(canvasContext)}
              />
            );
          }
          if (tool === 'domain') {
            return (
              <DomainPanel
                communityId={communityId}
                hasSiteCustomDomain={proToolAccess.domain}
              />
            );
          }
          if (tool === 'pages') {
            return (
              <PagesPanel
                communityId={communityId}
                selectedPageId={effectivePageId}
                restoreFocusToSelectedRow={focusSelectedRow}
                onSelectPage={handleSelectPage}
                onPageRemoved={handlePageRemoved}
              />
            );
          }
          if (tool === 'help') return <HelpPanel communityId={communityId} />;
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
            onAddSection={handleGoToAdd}
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

      {previewOpen && canvasContext ? (
        <PreviewDialog
          open
          onOpenChange={setPreviewOpen}
          communityId={communityId}
          context={canvasContext}
          // The dialog renders ONE page, so it is titled after that page.
          pageName={selectedPage?.name}
        />
      ) : null}

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
  onFixIssue: (slot: number) => void;
  onGoToPages: () => void;
}) {
  const { movableSections, select } = useSiteEditor();

  const handleFixIssue = useCallback(
    (slot: number) => {
      onFixIssue(slot);
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
      const target = movableSections.find((b) => b.blockOrder === slot);
      if (target) select(target.id);
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
    />
  );
}

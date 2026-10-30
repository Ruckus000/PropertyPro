'use client';

import { useMediaQuery } from '@/hooks/use-media-query';
import { EditorTopBar, type EditorTopBarPageProps, type EditorView } from './EditorTopBar';
import dynamic from 'next/dynamic';

// Below 768px only — a desktop PM never renders it (v4 Phase 3: the editor's
// first-load JavaScript is at its budget).
const PhoneGate = dynamic(() => import('./PhoneGate').then((m) => m.PhoneGate), {
  loading: () => null,
});

import type { UrgentNotice } from '@/hooks/use-urgent-notice';

export interface EditorShellProps extends EditorTopBarPageProps {
  communityName: string;
  /** Forwarded to the top bar; see `EditorTopBarProps.pageName` (Phase 11b-3). */
  pageName?: string;
  publicSiteUrl: string | null;
  /**
   * Phone-gate urgent-notice fast path. Threaded through the shell rather than
   * rendered by the caller because the shell owns the decision to show the gate
   * at all, and the gate is the only consumer.
   */
  communityId: number;
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
  /** The canvas column. Phase 2b fills this in. */
  children?: React.ReactNode;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  canOpenPublish: boolean;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  canPreview: boolean;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  previewDisabledReason: string;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  previewButtonRef: React.Ref<HTMLButtonElement>;
  status?: React.ReactNode;
  /** Forwarded to the top bar; see `EditorTopBarProps.requirements`. */
  requirements?: React.ReactNode;
  /** Forwarded to the top bar; see `EditorTopBarProps.records`. */
  records?: React.ReactNode;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  onPreview: () => void;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  onPublish: () => void;
  /** The inspector column. Rendered at >=1280px; below that it overlays. */
  inspector?: React.ReactNode;
  /**
   * Full-width strip between the top bar and the columns.
   *
   * Deliberately above the columns: what it carries is about the whole site
   * and must be seen whichever area is showing. Not rendered under the phone gate — the gate is a
   * deliberately minimal surface for posting an urgent notice.
   */
  banner?: React.ReactNode;
  /** Which area is showing (v4 Phase 5). Forwarded to the top bar's switch. */
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  /**
   * The Settings area's content, shown full width in place of the canvas and
   * inspector while `view` is `'settings'`.
   */
  settings: React.ReactNode;
  /**
   * The Help drawer (v4 Phase 3), or null while it is closed. It overlays the
   * right edge of either area, so it is laid over the columns rather than
   * being one of them: the canvas keeps its width while the PM reads.
   */
  help: React.ReactNode;
  helpOpen: boolean;
  /** Opens or closes the drawer — the top bar's Help button. */
  onHelpToggle: () => void;
}

/**
 * The editor: the top bar, then the canvas with the inspector beside it, or
 * Site settings in their place.
 *
 * There is no tool rail (combined plan Task 28). Sections are added and edited
 * on the page itself; pages, design and the notice are Site settings tabs.
 *
 * The whole editor is unmounted below 768px rather than hidden — see PhoneGate.
 * Column heights come from the route-group layout's `h-[100dvh]`, so every
 * column scrolls independently and the page itself never does.
 */
export function EditorShell({
  communityName,
  pageName,
  publicSiteUrl,
  communityId,
  hasPublishedSite,
  initialNotice,
  children,
  canOpenPublish,
  canPreview,
  previewDisabledReason,
  previewButtonRef,
  status,
  requirements,
  records,
  onPreview,
  onPublish,
  inspector,
  banner,
  pages,
  selectedPageId,
  onSelectPage,
  onManagePages,
  changeCount,
  device,
  onDeviceChange,
  view,
  onViewChange,
  settings,
  help,
  helpOpen,
  onHelpToggle,
}: EditorShellProps) {
  // Deliberately phrased as max-width, not min-width.
  //
  // `useMediaQuery` returns false on the server and on the first client render
  // so hydration matches. Asking `(min-width: 768px)` therefore makes the phone
  // gate the server-rendered output for EVERY user — a desktop PM would be
  // served "Editing needs a bigger screen" and only see the editor once
  // hydration ran. Inverting the query moves that initial false to the common
  // case: desktop renders immediately, and the small handful of phone users get
  // the gate one effect later.
  const isNarrow = useMediaQuery('(max-width: 767px)');

  if (isNarrow) {
    return (
      <PhoneGate
        publicSiteUrl={publicSiteUrl}
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorTopBar
        communityName={communityName}
        pageName={pageName}
        status={status}
        requirements={requirements}
        records={records}
        canOpenPublish={canOpenPublish}
        canPreview={canPreview}
        previewDisabledReason={previewDisabledReason}
        previewButtonRef={previewButtonRef}
        onPreview={onPreview}
        onPublish={onPublish}
        pages={pages}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        onManagePages={onManagePages}
        changeCount={changeCount}
        device={device}
        onDeviceChange={onDeviceChange}
        view={view}
        onViewChange={onViewChange}
        helpOpen={helpOpen}
        onHelpToggle={onHelpToggle}
      />

      {banner ? (
        <div className="shrink-0 border-b border-edge px-4 py-3">{banner}</div>
      ) : null}

      {/*
       * `relative` anchors the Help drawer, which overlays either area. The
       * named group lets the drawer step left of a DOCKED inspector rather than
       * cover it: the guides send the PM to a section's settings, so hiding
       * them under the drawer broke the guide being followed.
       */}
      <div className="group/editor relative flex min-h-0 flex-1 flex-col">
      {view === 'settings' ? (
        // `relative` for the same reason as the canvas scroller below.
        <div
          data-testid="settings-scroller"
          className="relative min-h-0 flex-1 overflow-y-auto bg-surface-page"
        >
          {settings}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/*
           * `relative` is load-bearing. The canvas and its dialogs announce
           * through `sr-only` live regions, which are `position: absolute`;
           * with no positioned ancestor they anchor to the PAGE at their static
           * position and stretch the document past the viewport. The page then
           * scrolls on the next announcement and carries the top bar out of
           * view (seen in the browser: a 1270px document in a 768px window).
           */}
          <div
            data-testid="canvas-scroller"
            className="relative min-w-0 flex-1 overflow-y-auto bg-surface-page"
          >
            {children}
          </div>

          {inspector}
        </div>
      )}
      {help}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EditorTopBar, type EditorTopBarPageProps, type EditorView } from './EditorTopBar';
import { PanelResizer } from './PanelResizer';
import { PhoneGate } from './PhoneGate';
import { ToolRail } from './ToolRail';
import { X } from 'lucide-react';
import { usePanelWidth } from './use-panel-width';
import { TOOL_PANEL_TITLES, type EditorToolId } from './tools';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';

const PANEL_ID = 'site-editor-tool-panel';

export interface EditorShellProps extends EditorTopBarPageProps {
  communityName: string;
  /** Forwarded to the top bar; see `EditorTopBarProps.pageName` (Phase 11b-3). */
  pageName?: string;
  publicSiteUrl: string | null;
  /** Counts shown on rail tools; see `ToolRailProps.badges`. */
  toolBadges?: Partial<Record<EditorToolId, number>>;
  /**
   * Phone-gate urgent-notice fast path. Threaded through the shell rather than
   * rendered by the caller because the shell owns the decision to show the gate
   * at all, and the gate is the only consumer.
   */
  communityId: number;
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
  /** Panel body per tool. Phase 1 passes placeholders; later phases pass real panels. */
  renderToolPanel: (tool: EditorToolId) => React.ReactNode;
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
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  onPreview: () => void;
  /** Forwarded to the top bar; required for the reason stated on `EditorTopBarProps`. */
  onPublish: () => void;
  /** The inspector column. Rendered at >=1280px; below that it overlays. */
  inspector?: React.ReactNode;
  /**
   * Full-width strip between the top bar and the columns.
   *
   * Deliberately above the columns rather than inside a tool panel: its one
   * consumer is the "you never finished the wizard" prompt, which is about the
   * whole site and would be missable behind a tab the PM has no reason to open.
   * Not rendered under the phone gate — the gate is a deliberately minimal
   * surface for posting an urgent notice, and setup guidance is not that.
   */
  banner?: React.ReactNode;
  /** Which area is showing (v4 Phase 5). Forwarded to the top bar's switch. */
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  /**
   * The Settings area's content, shown full width in place of the rail,
   * panel, canvas and inspector while `view` is `'settings'`.
   */
  settings: React.ReactNode;
}

/**
 * The controlled active tool — an all-or-nothing PAIR, enforced by the type.
 *
 * Supply both to let something outside the shell drive the panel (selecting a
 * section on the canvas switches to Sections); omit both and the shell keeps
 * its own state. What the type now forbids is the HALF-controlled shape:
 * `activeTool` without `onActiveToolChange` fell back to `setUncontrolledTool`,
 * whose value `controlledTool ?? uncontrolledTool` immediately discards — a
 * fully enabled, fully inert tab strip.
 *
 * That is the same "a missing handler yields a control that invites the click
 * and swallows it" shape that made `onPreview`/`onPublish`, `onGoToPages`,
 * `onPageRemoved` and `restoreFocusToSelectedRow` required in earlier rounds.
 * It cannot be fixed the same way, because omitting BOTH is a legitimate mode —
 * hence a union rather than two required props. `never` on the absent arm is
 * what makes the half-supplied shape fail to typecheck rather than merely be
 * discouraged by a comment.
 */
type ControlledToolProps =
  | {
      activeTool: EditorToolId | null;
      onActiveToolChange: (tool: EditorToolId | null) => void;
    }
  | { activeTool?: never; onActiveToolChange?: never };

export type EditorShellPropsWithTool = EditorShellProps & ControlledToolProps;

/**
 * Three-column editor: tool panel · canvas · (inspector, from Phase 2b).
 *
 * The whole editor is unmounted below 768px rather than hidden — see PhoneGate.
 * Column heights come from the route-group layout's `h-[100dvh]`, so every
 * column scrolls independently and the page itself never does.
 */
export function EditorShell({
  communityName,
  pageName,
  publicSiteUrl,
  toolBadges,
  communityId,
  hasPublishedSite,
  initialNotice,
  renderToolPanel,
  children,
  canOpenPublish,
  canPreview,
  previewDisabledReason,
  previewButtonRef,
  status,
  requirements,
  onPreview,
  onPublish,
  activeTool: controlledTool,
  onActiveToolChange,
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
}: EditorShellPropsWithTool) {
  // Closed by default: the v4 builder opens on the page itself, with the rail
  // offering the tools rather than one already covering a third of the screen.
  const [uncontrolledTool, setUncontrolledTool] = useState<EditorToolId | null>(null);
  // Both are decided by the SAME arm of `ControlledToolProps`, so they cannot
  // disagree — which is the half-controlled inert rail the union exists to make
  // unrepresentable. `controlledTool` is checked for `undefined`, not with `??`,
  // because `null` (panel closed) is a legitimate controlled value.
  const isControlled = onActiveToolChange !== undefined;
  const activeTool = isControlled ? (controlledTool ?? null) : uncontrolledTool;
  const setActiveTool = onActiveToolChange ?? setUncontrolledTool;
  const [panelWidth, setPanelWidth] = usePanelWidth();
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
      />

      {banner ? (
        <div className="shrink-0 border-b border-edge px-4 py-3">{banner}</div>
      ) : null}

      {view === 'settings' ? (
        // `relative` for the same reason as the tool panel's scroller below.
        <div
          data-testid="settings-scroller"
          className="relative min-h-0 flex-1 overflow-y-auto bg-surface-page"
        >
          {settings}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ToolRail
            active={activeTool}
            onSelect={setActiveTool}
            panelId={PANEL_ID}
            badges={toolBadges}
          />

          {activeTool !== null ? (
            <>
              <aside
                id={PANEL_ID}
                aria-labelledby={`${PANEL_ID}-title`}
                className="flex min-h-0 shrink-0 flex-col border-r border-edge bg-surface-card"
                style={{ width: panelWidth }}
              >
                <div className="flex shrink-0 items-center gap-2 px-4 pb-2.5 pt-3.5">
                  <h2 id={`${PANEL_ID}-title`} className="flex-1 text-base font-semibold text-content">
                    {TOOL_PANEL_TITLES[activeTool]}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close panel"
                    onClick={() => setActiveTool(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <X className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                </div>
                {/*
                 * `relative` is load-bearing. Panels announce through `sr-only`
                 * live regions, which are `position: absolute`; with no positioned
                 * ancestor they anchor to the PAGE at their static position — the
                 * bottom of a long panel list — and stretch the document past the
                 * viewport. The page then scrolls on the next announcement or focus
                 * move and carries the top bar out of view. Seen in the browser:
                 * document 1270px in a 768px window after an Add.
                 */}
                <div
                  data-testid="tool-panel-scroller"
                  className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-5"
                >
                  {renderToolPanel(activeTool)}
                </div>
              </aside>

              <PanelResizer width={panelWidth} onWidthChange={setPanelWidth} />
            </>
          ) : null}

          {/* `relative` for the same reason as the tool panel's scroller. */}
          <div
            data-testid="canvas-scroller"
            className="relative min-w-0 flex-1 overflow-y-auto bg-surface-page"
          >
            {children}
          </div>

          {inspector}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EditorTopBar } from './EditorTopBar';
import { PanelResizer } from './PanelResizer';
import { PhoneGate } from './PhoneGate';
import { ToolTabs } from './ToolTabs';
import { usePanelWidth } from './use-panel-width';
import { TOOL_PANEL_TITLES, type EditorToolId, type ProToolAccess } from './tools';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';

const PANEL_ID = 'site-editor-tool-panel';

export interface EditorShellProps {
  communityName: string;
  publicSiteUrl: string | null;
  proToolAccess: ProToolAccess;
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
  status?: React.ReactNode;
  onPreview?: () => void;
  onPublish?: () => void;
  /**
   * Controlled active tool. Supply both to let something outside the shell
   * drive the panel — selecting a section on the canvas switches to Sections.
   * Omit both and the shell keeps its own state.
   */
  activeTool?: EditorToolId;
  onActiveToolChange?: (tool: EditorToolId) => void;
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
}

/**
 * Three-column editor: tool panel · canvas · (inspector, from Phase 2b).
 *
 * The whole editor is unmounted below 768px rather than hidden — see PhoneGate.
 * Column heights come from the route-group layout's `h-[100dvh]`, so every
 * column scrolls independently and the page itself never does.
 */
export function EditorShell({
  communityName,
  publicSiteUrl,
  proToolAccess,
  communityId,
  hasPublishedSite,
  initialNotice,
  renderToolPanel,
  children,
  canOpenPublish,
  status,
  onPreview,
  onPublish,
  activeTool: controlledTool,
  onActiveToolChange,
  inspector,
  banner,
}: EditorShellProps) {
  const [uncontrolledTool, setUncontrolledTool] = useState<EditorToolId>('sections');
  const activeTool = controlledTool ?? uncontrolledTool;
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
        status={status}
        canOpenPublish={canOpenPublish}
        onPreview={onPreview}
        onPublish={onPublish}
      />

      {banner ? (
        <div className="shrink-0 border-b border-edge px-4 py-3">{banner}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 shrink-0 flex-col border-r border-edge bg-surface-card"
          style={{ width: panelWidth }}
        >
          <ToolTabs
            active={activeTool}
            onSelect={setActiveTool}
            proToolAccess={proToolAccess}
            panelId={PANEL_ID}
          />

          <div
            id={PANEL_ID}
            role="tabpanel"
            aria-labelledby={`site-editor-tab-${activeTool}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-3">
              <h2 className="text-base font-semibold text-content">
                {TOOL_PANEL_TITLES[activeTool]}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {renderToolPanel(activeTool)}
            </div>
          </div>
        </div>

        <PanelResizer width={panelWidth} onWidthChange={setPanelWidth} />

        <div className="min-w-0 flex-1 overflow-y-auto bg-surface-page">{children}</div>

        {inspector}
      </div>
    </div>
  );
}

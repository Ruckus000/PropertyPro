'use client';

import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EditorTopBar } from './EditorTopBar';
import { PanelResizer } from './PanelResizer';
import { PhoneGate } from './PhoneGate';
import { ToolTabs } from './ToolTabs';
import { usePanelWidth } from './use-panel-width';
import { TOOL_PANEL_TITLES, type EditorToolId, type ProToolAccess } from './tools';

const PANEL_ID = 'site-editor-tool-panel';

export interface EditorShellProps {
  communityName: string;
  publicSiteUrl: string | null;
  proToolAccess: ProToolAccess;
  /** Panel body per tool. Phase 1 passes placeholders; later phases pass real panels. */
  renderToolPanel: (tool: EditorToolId) => React.ReactNode;
  /** The canvas column. Phase 2b fills this in. */
  children?: React.ReactNode;
  changeCount?: number;
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
  renderToolPanel,
  children,
  changeCount = 0,
  status,
  onPreview,
  onPublish,
  activeTool: controlledTool,
  onActiveToolChange,
  inspector,
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
    return <PhoneGate publicSiteUrl={publicSiteUrl} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorTopBar
        communityName={communityName}
        status={status}
        changeCount={changeCount}
        onPreview={onPreview}
        onPublish={onPublish}
      />

      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 shrink-0 flex-col border-r border-edge bg-surface-card"
          style={{ width: panelWidth }}
        >
          <ToolTabs
            active={activeTool}
            onSelect={setActiveTool}
            counts={{ site: changeCount }}
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

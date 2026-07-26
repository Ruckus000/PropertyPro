'use client';

import { EditorShell } from './EditorShell';
import type { EditorToolId } from './tools';

export interface EditorRootProps {
  communityId: number;
  communityName: string;
  publicSiteUrl: string | null;
  hasProTools: boolean;
}

/**
 * Client root of the v3 editor — the seam where state will live.
 *
 * Phase 1 wires the shell with placeholder panels so the chrome, keyboard
 * behaviour and budget are all real and testable before any editing exists.
 * Phase 2b replaces the canvas placeholder, Phase 3 adds the status line, and
 * Phase 4 hangs the change model off here.
 */
export function EditorRoot({ communityName, publicSiteUrl, hasProTools }: EditorRootProps) {
  return (
    <EditorShell
      communityName={communityName}
      publicSiteUrl={publicSiteUrl}
      hasProTools={hasProTools}
      renderToolPanel={(tool) => <ToolPanelPlaceholder tool={tool} />}
    >
      <div className="mx-auto max-w-[1000px] px-5 py-4">
        <div className="rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-card p-10 text-center">
          <p className="text-sm text-content-secondary">
            The canvas arrives in the next phase.
          </p>
        </div>
      </div>
    </EditorShell>
  );
}

function ToolPanelPlaceholder({ tool }: { tool: EditorToolId }) {
  return (
    <p className="text-sm text-content-secondary" data-testid={`tool-panel-${tool}`}>
      This panel is not built yet.
    </p>
  );
}

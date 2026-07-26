'use client';

import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { EditorShell } from './EditorShell';
import { Canvas } from './canvas/Canvas';
import type { EditorToolId, ProToolAccess } from './tools';

export interface EditorRootProps {
  communityId: number;
  communityName: string;
  publicSiteUrl: string | null;
  proToolAccess: ProToolAccess;
  /** Null when the community row could not be read; the canvas degrades. */
  canvasContext: CanvasContext | null;
}

/**
 * Client root of the v3 editor — the seam where state will live.
 *
 * Phase 1 wires the shell with placeholder panels so the chrome, keyboard
 * behaviour and budget are all real and testable before any editing exists.
 * Phase 2b replaces the canvas placeholder, Phase 3 adds the status line, and
 * Phase 4 hangs the change model off here.
 */
export function EditorRoot({
  communityId,
  communityName,
  publicSiteUrl,
  proToolAccess,
  canvasContext,
}: EditorRootProps) {
  return (
    <EditorShell
      communityName={communityName}
      publicSiteUrl={publicSiteUrl}
      proToolAccess={proToolAccess}
      renderToolPanel={(tool) => <ToolPanelPlaceholder tool={tool} />}
    >
      {canvasContext ? (
        <Canvas communityId={communityId} context={canvasContext} />
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
  );
}

function ToolPanelPlaceholder({ tool }: { tool: EditorToolId }) {
  return (
    <p className="text-sm text-content-secondary" data-testid={`tool-panel-${tool}`}>
      This panel is not built yet.
    </p>
  );
}

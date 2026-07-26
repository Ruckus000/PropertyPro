'use client';

import { useCallback, useState } from 'react';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import dynamic from 'next/dynamic';
import { EditorShell } from './EditorShell';
import { Inspector } from './Inspector';
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
import { Canvas } from './canvas/Canvas';
import { SiteEditorProvider } from './editor-context';
import { SectionList } from './panels/SectionList';
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
  canvasContext,
}: EditorRootProps) {
  const { data: blocks } = useContentBlocks(communityId);
  const [activeTool, setActiveTool] = useState<EditorToolId>('sections');
  const [previewOpen, setPreviewOpen] = useState(false);

  // Selecting a section on the canvas pulls the Sections panel forward, so the
  // controls for what you just clicked are visible without a second action.
  const handleSelect = useCallback(() => setActiveTool('sections'), []);
  const handlePreview = useCallback(() => setPreviewOpen(true), []);

  return (
    <SiteEditorProvider
      communityId={communityId}
      blocks={blocks ?? []}
      onSelect={handleSelect}
    >
      <EditorShell
        communityName={communityName}
        publicSiteUrl={publicSiteUrl}
        proToolAccess={proToolAccess}
        activeTool={activeTool}
        onActiveToolChange={setActiveTool}
        onPreview={handlePreview}
        // Mounted idle. `useAutosave` drives this once the per-block inspector
        // forms exist — they are the only thing in the editor that autosaves,
        // and they arrive with the inspector body. Until then StatusLine
        // renders nothing (it deliberately shows no "Saved" without a save),
        // so mounting it now costs nothing and means the top bar does not have
        // to change when the forms land.
        status={<StatusLine status="idle" lastSavedAt={null} />}
        renderToolPanel={(tool) =>
          tool === 'sections' ? <SectionList /> : <ToolPanelPlaceholder tool={tool} />
        }
        // Returns null when nothing is selected, so passing it unconditionally
        // costs an empty render rather than a branch here.
        inspector={<Inspector />}
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

      {previewOpen && canvasContext ? (
        <PreviewDialog
          open
          onOpenChange={setPreviewOpen}
          communityId={communityId}
          context={canvasContext}
        />
      ) : null}
    </SiteEditorProvider>
  );
}

function ToolPanelPlaceholder({ tool }: { tool: EditorToolId }) {
  return (
    <p className="text-sm text-content-secondary" data-testid={`tool-panel-${tool}`}>
      This panel is not built yet.
    </p>
  );
}

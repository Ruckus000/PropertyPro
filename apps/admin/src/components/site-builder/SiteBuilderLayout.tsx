'use client';

/**
 * SiteBuilderLayout — switches between the legacy BlockEditor + PreviewPanel
 * and the new PuckEditor based on the NEXT_PUBLIC_USE_PUCK_EDITOR feature flag.
 *
 * ADR-002 #10: Feature flag enables instant rollback to the old editor.
 * ADR-002 #14: Passes community branding to PuckEditor for theme context.
 */
import { BlockEditor } from './BlockEditor';
import { PreviewPanel } from './PreviewPanel';
import { PuckEditor, type CommunityBranding } from './puck/PuckEditor';

interface SiteBuilderLayoutProps {
  communityId: number;
  communitySlug: string;
  /** Community branding for PuckEditor theme context (ADR-002 #14). */
  branding?: CommunityBranding | null;
}

/** Puck editor is the default. Set NEXT_PUBLIC_USE_PUCK_EDITOR=false for emergency rollback to legacy editor. */
const usePuckEditor = process.env.NEXT_PUBLIC_USE_PUCK_EDITOR !== 'false';

export function SiteBuilderLayout({ communityId, communitySlug, branding }: SiteBuilderLayoutProps) {
  if (usePuckEditor) {
    return (
      <div className="h-full">
        <PuckEditor
          communityId={communityId}
          communitySlug={communitySlug}
          branding={branding}
        />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-5 gap-4 p-4">
      {/* Block editor — 60% (3 of 5 columns) */}
      <div className="col-span-3 overflow-y-auto">
        <BlockEditor communityId={communityId} />
      </div>

      {/* Preview panel — 40% (2 of 5 columns) */}
      <div className="col-span-2 overflow-hidden">
        <PreviewPanel communitySlug={communitySlug} />
      </div>
    </div>
  );
}

'use client';

/**
 * SiteBuilderLayout — switches between the legacy BlockEditor + PreviewPanel
 * and the new PuckEditor based on the NEXT_PUBLIC_USE_PUCK_EDITOR feature flag.
 *
 * ADR-002 #10: Feature flag enables instant rollback to the old editor.
 */
import { BlockEditor } from './BlockEditor';
import { PreviewPanel } from './PreviewPanel';
import { PuckEditor } from './puck/PuckEditor';

interface SiteBuilderLayoutProps {
  communityId: number;
  communitySlug: string;
}

const usePuckEditor = process.env.NEXT_PUBLIC_USE_PUCK_EDITOR === 'true';

export function SiteBuilderLayout({ communityId, communitySlug }: SiteBuilderLayoutProps) {
  if (usePuckEditor) {
    return (
      <div className="h-full">
        <PuckEditor communityId={communityId} communitySlug={communitySlug} />
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

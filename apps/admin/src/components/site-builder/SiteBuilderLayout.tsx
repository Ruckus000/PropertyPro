'use client';

/**
 * SiteBuilderLayout — two-column grid: 60% BlockEditor, 40% PreviewPanel.
 */
import { BlockEditor } from './BlockEditor';
import { PreviewPanel } from './PreviewPanel';

interface SiteBuilderLayoutProps {
  communityId: number;
  communitySlug: string;
}

export function SiteBuilderLayout({ communityId, communitySlug }: SiteBuilderLayoutProps) {
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

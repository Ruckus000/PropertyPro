'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { useContentBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { CanvasBlock } from './CanvasBlock';

export interface CanvasProps {
  communityId: number;
  context: CanvasContext;
  /** Injected for deterministic tests; defaults to the real clock. */
  now?: number;
}

/**
 * The editor canvas — the community's site, rendered from the draft.
 *
 * Blocks come from the merged draft+published view, so the canvas shows what
 * the PM is iterating on rather than what is live. Every block renders through
 * the same view component the public site uses (see `view-registry.ts`), which
 * is what makes "what you see is what publishes" true rather than aspirational.
 *
 * Selection, inline controls and reordering land in the next slice; this one
 * establishes the render path.
 */
export function Canvas({ communityId, context, now }: CanvasProps) {
  const { data: blocks, isPending, isError, error, refetch } = useContentBlocks(communityId);
  // One timestamp for the whole render pass — otherwise two blocks with the
  // same window could disagree about where the cutoff falls.
  const renderedAt = useMemo(() => now ?? Date.now(), [now, blocks]);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-4 px-5 py-4" aria-busy="true">
        <span className="sr-only">Loading your site</span>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1000px] px-5 py-4">
        <AlertBanner
          status="danger"
          title="We couldn't load your site"
          description={error?.message ?? 'Please try again.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const ordered = sortBlocks(blocks ?? []);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-4">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
        {ordered.length === 0 ? (
          <EmptyState
            title="Your site is empty"
            description="Add your first section to give visitors something to read."
          />
        ) : (
          ordered.map((block) => (
            <CanvasBlock
              key={block.id}
              block={block}
              community={context.community}
              theme={context.theme}
              layout={context.layout}
              preview={context.preview}
              now={renderedAt}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Visitor order: hero first, then by `blockOrder`.
 *
 * The API returns rows in no guaranteed order, and the hero is not necessarily
 * at order 0 — it is pinned to the top on the published site regardless, so the
 * canvas has to do the same or the preview lies about the running order.
 */
export function sortBlocks(blocks: readonly SiteBlockSummary[]): SiteBlockSummary[] {
  return [...blocks].sort((a, b) => {
    if (a.blockType === 'hero' && b.blockType !== 'hero') return -1;
    if (b.blockType === 'hero' && a.blockType !== 'hero') return 1;
    return a.blockOrder - b.blockOrder;
  });
}

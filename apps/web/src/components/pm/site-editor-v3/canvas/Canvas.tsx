'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { hasView } from '@/components/public-site/blocks/view-registry';
import { useContentBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useSelectedSitePage } from '@/hooks/use-selected-site-page';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { CanvasBlock } from './CanvasBlock';
import { SectionShell } from './SectionShell';

export interface CanvasProps {
  communityId: number;
  context: CanvasContext;
  /**
   * Switches the shell to the Add tab. Optional so the canvas still renders
   * standalone, but without it the empty state tells the PM to add a section
   * and offers no way to do so.
   */
  onAddSection?: () => void;
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
 * Each block is wrapped in a `SectionShell`, which owns the selection chrome
 * and the hover/focus control cluster. The shell must be mounted inside a
 * `SiteEditorProvider` (see `EditorRoot`).
 *
 * ## Page scope (Phase 11b-3, D-C2)
 *
 * `useContentBlocks` returns EVERY page's blocks in one response — deliberately,
 * because the publish diff has to see the whole site. The canvas is one of the
 * two callers that must NOT (the other is `PreviewDialog`): it renders one page,
 * so it narrows the list with `blocksForPage` against the editor's selected
 * page. Without that, opening page B shows page A's sections, and clicking one
 * hands the inspector a block whose edits are written against the wrong page.
 *
 * The narrowing is a `useMemo` over the raw query result rather than a change to
 * the hook, so the publish path (`use-site-diff`) and the slot allocator
 * (`nextContentSlot`, D-C3) keep the community-wide list they require.
 */
export function Canvas({ communityId, context, onAddSection, now }: CanvasProps) {
  const { data: blocks, isPending, isError, error, refetch } = useContentBlocks(communityId);
  const selectedPageId = useSelectedSitePage();
  // One timestamp for the whole render pass — otherwise two blocks with the
  // same window could disagree about where the cutoff falls.
  const renderedAt = useMemo(() => now ?? Date.now(), [now, blocks]);

  // Filter BEFORE the empty check. The PM blocks endpoint returns tombstone
  // rows (staged deletions) and could return a type this build has no view for;
  // both render as null. Counting them would skip the empty state and leave a
  // bare bordered box with no explanation. Page scoping goes first, so "this
  // page is empty" is reported as an empty page and not as an empty site.
  //
  // The empty state's copy below has to agree with that, and for two rounds it
  // did not — it said "Your site is empty" on a page-scoped surface, which
  // tells a PM who just created a second page that the whole site is gone.
  // `PreviewDialog` had it right all along ("Add a section to this page"); this
  // is the canvas saying the same thing.
  const ordered = useMemo(
    () =>
      sortBlocks(blocksForPage(blocks, selectedPageId)).filter((b) =>
        hasView(b.blockType as never),
      ),
    [blocks, selectedPageId],
  );

  // Built once per block-list change rather than per render. `SectionShell`
  // subscribes to the editor context, so it re-renders on every selection
  // change — but it receives the same `children` element each time, which is
  // what keeps `CanvasBlock`'s `memo` effective. Rebuilding these elements
  // inline would hand every block a fresh element on each keystroke in the
  // inspector and defeat that memo.
  const sections = useMemo(
    () =>
      ordered.map((block) => (
        <SectionShell key={block.id} block={block} communityId={communityId}>
          <CanvasBlock
            block={block}
            community={context.community}
            theme={context.theme}
            layout={context.layout}
            preview={context.preview}
            now={renderedAt}
          />
        </SectionShell>
      )),
    [ordered, communityId, context, renderedAt],
  );

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

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-4">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
        {ordered.length === 0 ? (
          <EmptyState
            title="This page is empty"
            description="Add a section to give visitors something to read."
            action={
              onAddSection && (
                <Button type="button" onClick={onAddSection}>
                  Add a section
                </Button>
              )
            }
          />
        ) : (
          sections
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

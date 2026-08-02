'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { hasView } from '@/components/public-site/blocks/view-registry';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import { useSelectedSitePage } from '@/hooks/use-selected-site-page';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { CanvasBlock } from './canvas/CanvasBlock';
import { sortBlocks } from './canvas/Canvas';

export interface PreviewDialogProps {
  /** Controlled — the editor owns the open state (top bar's Preview action). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  context: CanvasContext;
  /**
   * The site page being previewed (Phase 11b-3). Names the dialog after the
   * page rather than the community, which is what it actually renders.
   *
   * Falls back to the community name when absent — the page read can genuinely
   * fail, and `Preview — Sunset Condos` is a worse title than
   * `Preview — Amenities` but a far better one than an empty heading.
   */
  pageName?: string;
  /**
   * The selected page is staged for removal, so the caption must not promise it
   * to visitors — publishing DELETES it.
   *
   * Optional with a `false` default is safe here, unlike the required props
   * elsewhere in this tree: absence degrades to the ordinary caption, which is
   * correct for every un-staged page. It is the only prop in this dialog whose
   * default is the common case rather than an "off" that hides a feature.
   */
  pageIsStaged?: boolean;
  /** Injected for deterministic tests; defaults to the real clock. */
  now?: number;
}

/**
 * Read-only preview of the community site as it currently stands in the DRAFT
 * layer — i.e. exactly what Publish would make live.
 *
 * Rendered through `CanvasBlock`, the same block dispatcher the canvas uses,
 * which in turn dispatches through `blockViewRegistry` — the same presentational
 * components the public site renders. There is deliberately no second render
 * path here: a preview that could disagree with either the canvas or the
 * published page would be worse than no preview at all.
 *
 * The difference from the canvas is purely the absence of editing chrome: no
 * `SectionShell` (so no selection outline, no float controls) and no inserters.
 * Nothing in this tree is clickable except the dialog's own close affordances.
 *
 * Accessibility is Radix's: `DialogTitle` names the dialog, Esc closes it, and
 * focus is trapped while open and restored to the trigger on close. We add no
 * focus management of our own — a second manager only fights Radix's.
 *
 * ONE exception, and it is the parent's: `EditorRoot` UNMOUNTS this dialog when
 * both page reads fail, rather than closing it. Radix then restores focus to a
 * Preview button the same render has disabled, which is a no-op — so `EditorRoot`
 * moves focus to the failure banner's "Try again" itself. That is the only path
 * on which focus does not return to the trigger.
 *
 * No width/device toggle. `PhoneFrame` frames an **iframe `src`**, and the only
 * URL available renders the *published* site, not the draft; and clamping this
 * in-tree render to a phone width would squeeze a desktop layout rather than
 * re-trigger the views' own responsive breakpoints — a mobile preview that
 * lies. Left out until there is a draft-preview URL to frame.
 *
 * ## Page scope (Phase 11b-3, D-C2)
 *
 * Scoped to the page the PM is editing, for the same reason the canvas is: a
 * preview that concatenated every page's sections into one scroll would not
 * correspond to any URL a visitor can open, which is a worse lie than no preview
 * at all. The copy says "page" rather than "site" so the PM is not left thinking
 * the pages that are not shown have gone missing — and the TITLE names the page
 * for the same reason. `Preview — Sunset Condos` over one page's sections reads
 * as "this is your site", which is exactly the misreading the scoping exists to
 * prevent.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  communityId,
  context,
  pageName,
  pageIsStaged = false,
  now,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" resizable>
        <DialogHeader>
          <DialogTitle>{`Preview — ${pageName ?? context.community.name}`}</DialogTitle>
          <DialogDescription>
            {pageIsStaged
              ? /*
                 * The caption cannot promise this page to visitors when the
                 * next publish deletes it. A PM previewing a staged page is
                 * usually checking what they are about to lose — the editor
                 * behind this modal is showing the staged banner saying exactly
                 * that, and the modal covers it. Asserting "what visitors see
                 * once you publish" over a page that publishing removes is the
                 * disagreement this dialog's own header rules out.
                 */
                `This is ${pageName ?? 'the page'} as it stands right now, including unpublished changes. This page is set to be removed, so publishing takes it off your site rather than updating it.`
              : 'This is the page you are editing as it stands right now, including unpublished changes. It is what visitors see once you publish.'}
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so the blocks query fires on demand rather
            than for every PM who never opens the preview. */}
        {open ? (
          <PreviewBody communityId={communityId} context={context} now={now} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface PreviewBodyProps {
  communityId: number;
  context: CanvasContext;
  now?: number;
}

function PreviewBody({ communityId, context, now }: PreviewBodyProps) {
  const { data: blocks, isPending, isError, error, refetch } = useContentBlocks(communityId);
  const selectedPageId = useSelectedSitePage();

  // One timestamp for the whole render pass, matching the canvas — two blocks
  // sharing a time window must not disagree about where the cutoff falls.
  const renderedAt = useMemo(() => now ?? Date.now(), [now, blocks]);

  // Narrowed to the selected page (D-C2), then filtered before the empty check
  // for the same reason the canvas does: the PM blocks endpoint returns
  // tombstone rows (staged deletions), and a build may not have a view for every
  // stored type. Both render as null, so counting them would skip the empty
  // message and show a blank white box.
  const ordered = useMemo(
    () =>
      sortBlocks(blocksForPage(blocks, selectedPageId)).filter((b) =>
        hasView(b.blockType as never),
      ),
    [blocks, selectedPageId],
  );

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">Loading your preview</span>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load your preview"
        description={error?.message ?? 'Please try again.'}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (ordered.length === 0) {
    return (
      <EmptyState
        title="There's nothing to preview yet"
        description="Add a section to this page and it will show up here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
      {ordered.map((block) => (
        <CanvasBlock
          key={block.id}
          block={block}
          community={context.community}
          theme={context.theme}
          layout={context.layout}
          preview={context.preview}
          now={renderedAt}
        />
      ))}
    </div>
  );
}

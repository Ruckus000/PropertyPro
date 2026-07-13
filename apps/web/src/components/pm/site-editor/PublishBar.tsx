'use client';

/**
 * PR #8b — sticky publish bar for the PM website editor.
 *
 * Surfaces:
 *  - Pending-changes badge ("N draft sections" — count of is_draft=true
 *    blocks loaded via use-content-blocks, including tombstone drafts,
 *    i.e. staged deletions).
 *  - Publish button that fires usePublishSite with the loaded
 *    expectedPublishedAt token. Disabled while loading or in-flight.
 *  - Discard-drafts button (slice 8f) — appears only when drafts are
 *    pending; reverts the editor to the live site's state.
 *  - Inline status — success ("Published N sections"), nothing-to-publish
 *    ("No changes to publish"), or error message (including the 409
 *    "another editor published" copy from PublishConflictError).
 *
 * Slice 8e is live: the editor's block/hero/reorder writes all land in the
 * draft layer, so the badge counts real pending changes and Publish promotes
 * them atomically (publishCommunitySite).
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useContentBlocks, useDiscardDrafts, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useHeroBlock } from '@/hooks/use-hero-block';
import { usePublishSite, PublishConflictError, type PublishSiteResult } from '@/hooks/use-publish-site';

interface Props {
  communityId: number;
}

/**
 * Optimistic-concurrency token: the latest `publishedAt` across the loaded
 * blocks. The publish endpoint compares this against the row-level lock it
 * acquires on the community; a mid-flight publish by another PM bumps every
 * published row's `publishedAt`, the tokens no longer match, and the API
 * returns 409. Returns null when no published rows exist yet (first publish).
 *
 * Only published rows contribute — draft rows carry `publishedAt = null`.
 */
function deriveExpectedPublishedAt(blocks: SiteBlockSummary[] | undefined): string | null {
  if (!blocks) return null;
  let latest: string | null = null;
  for (const b of blocks) {
    if (b.isDraft) continue;
    if (b.publishedAt && (!latest || b.publishedAt > latest)) {
      latest = b.publishedAt;
    }
  }
  return latest;
}

function classifyOutcome(result: PublishSiteResult): string {
  if (result.published) {
    return `Published — ${result.promotedCount} section${result.promotedCount === 1 ? '' : 's'} live.`;
  }
  return 'No changes to publish.';
}

export function PublishBar({ communityId }: Props) {
  const blocksQ = useContentBlocks(communityId);
  // useHeroBlock isn't read for its value here — the hook subscription
  // just primes the cache so invalidation on publish has something to
  // refetch in this view. It will also matter when 8e flips the hero
  // form to write drafts.
  useHeroBlock(communityId);

  const publish = usePublishSite(communityId);
  const discard = useDiscardDrafts(communityId);
  const [outcome, setOutcome] = useState<string | null>(null);

  const pendingCount = useMemo(() => {
    if (!blocksQ.data) return 0;
    return blocksQ.data.filter((b) => b.isDraft).length;
  }, [blocksQ.data]);

  // Whether anything is actually live yet. Without this, a never-published or
  // empty site (pendingCount === 0) would misleadingly read "All changes
  // published". Only published (non-draft) rows count — correct under both the
  // current straight-to-prod model and the future draft/publish model.
  const hasPublished = useMemo(
    () => blocksQ.data?.some((b) => !b.isDraft) ?? false,
    [blocksQ.data],
  );

  const isLoading = blocksQ.isLoading || publish.isPending || discard.isPending;

  function onDiscard() {
    const confirmed = window.confirm(
      'Discard all pending drafts? Your live site is untouched; unpublished edits, reorders, and staged removals will be lost.',
    );
    if (!confirmed) return;
    setOutcome(null);
    discard.mutate(undefined, {
      onSuccess: ({ discardedCount }) => {
        toast.success(
          discardedCount > 0
            ? `Discarded ${discardedCount} pending change${discardedCount === 1 ? '' : 's'}.`
            : 'Nothing to discard.',
        );
      },
      onError: (err) => {
        setOutcome(err instanceof Error ? err.message : 'Discard failed.');
      },
    });
  }

  async function onPublish() {
    setOutcome(null);
    try {
      const result = await publish.mutateAsync({
        expectedPublishedAt: deriveExpectedPublishedAt(blocksQ.data),
      });
      setOutcome(classifyOutcome(result));
      if (result.published) {
        toast.success(classifyOutcome(result));
      }
    } catch (err) {
      if (err instanceof PublishConflictError) {
        setOutcome(`Conflict: ${err.message}`);
      } else {
        setOutcome(err instanceof Error ? err.message : 'Publish failed.');
      }
    }
  }

  return (
    <div
      role="region"
      aria-label="Publish website"
      className="sticky bottom-0 z-10 mt-6 rounded-md border border-default bg-surface-card p-4 shadow-e1"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-content">Website</span>
          <span
            data-testid="pending-changes-badge"
            className={
              pendingCount > 0
                ? 'inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent'
                : hasPublished
                  ? 'inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary'
                  : 'inline-flex items-center rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning'
            }
          >
            {pendingCount > 0
              ? `${pendingCount} draft section${pendingCount === 1 ? '' : 's'}`
              : hasPublished
                ? 'All changes published'
                : 'Not published yet'}
          </span>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          {outcome && (
            <span
              role="status"
              className="text-sm text-content-secondary truncate max-w-[40ch]"
            >
              {outcome}
            </span>
          )}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={isLoading}
              data-testid="discard-drafts-button"
              className="inline-flex items-center rounded-md border border-default px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            >
              {discard.isPending ? 'Discarding…' : 'Discard Drafts'}
            </button>
          )}
          <button
            type="button"
            onClick={onPublish}
            disabled={isLoading}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {publish.isPending ? 'Publishing…' : 'Publish Website'}
          </button>
        </div>
      </div>
    </div>
  );
}

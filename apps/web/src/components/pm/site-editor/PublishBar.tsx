'use client';

/**
 * PR #8b — sticky publish bar for the PM website editor.
 *
 * Surfaces:
 *  - Pending-changes badge ("N draft sections" — count of is_draft=true
 *    blocks loaded via use-content-blocks).
 *  - Publish button that fires usePublishSite with the loaded
 *    expectedPublishedAt token. Disabled while loading or in-flight.
 *  - Inline status — success ("Published N sections"), nothing-to-publish
 *    ("No changes to publish"), or error message (including the 409
 *    "another editor published" copy from PublishConflictError).
 *
 * Until slice 8e ships (editor refactor to write is_draft=true), every
 * block is published-straight-to-prod, so the badge always reads 0 and
 * the Publish button is effectively decorative. The button still works
 * — clicking it produces a `nothing-to-publish` response. Wiring it up
 * now lets the API surface, the styling, and the optimistic-concurrency
 * plumbing all ship + be reviewed before the user-visible behavior
 * change lands.
 */

import { useMemo, useState } from 'react';
import { useContentBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
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
  const [outcome, setOutcome] = useState<string | null>(null);

  const pendingCount = useMemo(() => {
    if (!blocksQ.data) return 0;
    return blocksQ.data.filter((b) => b.isDraft).length;
  }, [blocksQ.data]);

  const isLoading = blocksQ.isLoading || publish.isPending;

  async function onPublish() {
    setOutcome(null);
    try {
      const result = await publish.mutateAsync({
        expectedPublishedAt: deriveExpectedPublishedAt(blocksQ.data),
      });
      setOutcome(classifyOutcome(result));
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
                : 'inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary'
            }
          >
            {pendingCount > 0
              ? `${pendingCount} draft section${pendingCount === 1 ? '' : 's'}`
              : 'All changes published'}
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

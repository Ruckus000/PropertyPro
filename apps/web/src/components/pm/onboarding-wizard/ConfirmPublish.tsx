'use client';

/**
 * Step 5 of the onboarding wizard — confirm + publish.
 *
 * Shows the current block list (draft + published merged view) and a
 * "Publish my site" button that fires the atomic-publish transaction
 * via the existing /api/v1/pm/site/publish endpoint (PR #8a/#8b).
 *
 * Spec §4.1 Step 5 also calls for: per-block Configure expanders + a
 * reorder UI (↑/↓ + drag). Both ride on the content-sections list
 * surface and land in a follow-up slice; for v1 this surface is
 * confirm + publish only.
 */
import { useMemo, useState } from 'react';
import { describePublishedCounts } from '@/lib/site-editor/describe-publish-outcome';
import { useContentBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import {
  usePublishSite,
  PublishConflictError,
  type PublishSiteResult,
} from '@/hooks/use-publish-site';

interface Props {
  communityId: number;
  communitySlug?: string | null;
}

interface BlockSummary {
  blockType: string;
  blockOrder: number;
  isDraft: boolean;
}

function blockLabel(blockType: string): string {
  switch (blockType) {
    case 'hero':
      return 'Welcome (hero)';
    case 'text':
      return 'Text section';
    case 'image':
      return 'Image';
    case 'announcements':
      return 'Announcements';
    case 'documents':
      return 'Documents';
    case 'meetings':
      return 'Meetings';
    case 'contact':
      return 'Contact';
    default:
      return blockType;
  }
}

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

function classifyOutcome(result: PublishSiteResult, communitySlug?: string | null): string {
  if (result.published) {
    const where = communitySlug
      ? ` Live at ${communitySlug}.getpropertypro.com.`
      : '';
    /*
     * Shared with the editor's review sheet, not counted here.
     *
     * This used to interpolate `promotedCount` alone, which reports
     * "Published — 0 sections live." for a publish made entirely of page
     * changes — and that is reachable from here, not hypothetical: this wizard
     * is entered FROM the editor (`WizardEntryBanner`), and the Pages tool is
     * available the whole time, so a PM can create a page, click through, and
     * publish without touching a single section.
     */
    return `${describePublishedCounts(result)}${where}`;
  }
  // Deliberately NOT the sheet's wording. This is a wizard step's resting
  // state, not a report on a click the PM was invited to make.
  return 'No changes to publish.';
}

export function ConfirmPublish({ communityId, communitySlug }: Props) {
  const blocksQ = useContentBlocks(communityId);
  const publish = usePublishSite(communityId);
  const [outcome, setOutcome] = useState<string | null>(null);

  const summary: BlockSummary[] = useMemo(() => {
    if (!blocksQ.data) return [];
    return blocksQ.data
      .slice()
      .sort((a, b) => a.blockOrder - b.blockOrder)
      .map((b) => ({
        blockType: b.blockType,
        blockOrder: b.blockOrder,
        isDraft: b.isDraft,
      }));
  }, [blocksQ.data]);

  const draftCount = useMemo(
    () => summary.filter((s) => s.isDraft).length,
    [summary],
  );

  const isLoading = blocksQ.isLoading || publish.isPending;

  async function onPublish() {
    setOutcome(null);
    try {
      const result = await publish.mutateAsync({
        expectedPublishedAt: deriveExpectedPublishedAt(blocksQ.data),
        // Final wizard step — stamp onboarding complete so the dashboard
        // banner / "Site" pill / WizardEntryBanner stop prompting.
        markOnboardingComplete: true,
      });
      setOutcome(classifyOutcome(result, communitySlug));
    } catch (err) {
      if (err instanceof PublishConflictError) {
        setOutcome(`Conflict: ${err.message}`);
      } else {
        setOutcome(err instanceof Error ? err.message : 'Publish failed.');
      }
    }
  }

  return (
    <section
      aria-labelledby="wizard-step-5-heading"
      data-testid="confirm-publish"
      className="rounded-md border border-default bg-surface-card p-6 shadow-e0"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-content-secondary">
          Step 5 of 5
        </p>
        <h2 id="wizard-step-5-heading" className="mt-1 text-xl font-semibold text-content">
          Confirm what&apos;s shown
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Here&apos;s the order visitors will see. Publish when you&apos;re ready — your draft
          stays saved until you do.
        </p>
      </div>

      {blocksQ.isLoading ? (
        <p
          data-testid="confirm-publish-loading"
          className="rounded-md border border-default bg-surface-subtle p-3 text-sm text-content-secondary"
        >
          Loading block list…
        </p>
      ) : summary.length === 0 ? (
        <p
          data-testid="confirm-publish-empty"
          className="rounded-md border border-dashed border-default bg-surface-subtle p-3 text-sm text-content-secondary"
        >
          No blocks configured yet. Add content in previous steps to publish.
        </p>
      ) : (
        <ol className="space-y-2" data-testid="confirm-publish-list">
          {summary.map((s) => (
            <li
              key={`${s.blockOrder}-${s.blockType}`}
              data-testid={`confirm-row-${s.blockType}`}
              className="flex items-center justify-between gap-3 rounded-md border border-default bg-surface-card px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-content">
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-interactive-subtle text-xs font-semibold text-interactive"
                >
                  {s.blockOrder}
                </span>
                {blockLabel(s.blockType)}
              </span>
              {/* Draft pill uses the solid brand-status pair. The previous
                  accent tint applied a slash-opacity modifier to a bare var(),
                  so the pill had no fill at all, and accent-as-text is
                  coral-200 — too light to read. */}
              {s.isDraft ? (
                <span className="rounded-full bg-status-brand-bg px-2 py-0.5 text-xs font-medium text-status-brand">
                  Draft
                </span>
              ) : (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-secondary">
                  Live
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <p
          data-testid="confirm-publish-badge"
          className="text-sm text-content-secondary"
          aria-live="polite"
        >
          {draftCount === 0
            ? 'All changes already published.'
            : `${draftCount} draft section${draftCount === 1 ? '' : 's'} ready to publish.`}
        </p>
        <div className="flex items-center gap-3">
          {outcome && (
            <span role="status" className="text-sm text-content-secondary max-w-[40ch] truncate">
              {outcome}
            </span>
          )}
          <button
            type="button"
            onClick={onPublish}
            disabled={isLoading || summary.length === 0}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {publish.isPending ? 'Publishing…' : 'Publish my site'}
          </button>
        </div>
      </div>
    </section>
  );
}

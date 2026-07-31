'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { PlanBadge } from '@propertypro/ui';
import { cn } from '@/lib/utils';
import { useContentBlocks, useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useSelectedSitePage } from '@/hooks/use-selected-site-page';
import { useSiteEditor } from '@/components/pm/site-editor-v3/editor-context';
import { ADD_CATALOG, nextContentSlot, type AddCatalogEntry } from './add-catalog';

// Only mounted once the PM picks Image or Gallery, which keeps the upload
// pipeline (`useImageUpload` plus the client-side validators) out of the Add
// panel's own chunk. Most sections added are text or a system-of-record block,
// and those PMs should never download an uploader.
const AddImageFlow = dynamic(() => import('./AddImageFlow').then((m) => m.AddImageFlow), {
  loading: () => null,
});

export interface AddPanelProps {
  communityId: number;
  /**
   * `hasSitePolishBlocks`. False renders faq/gallery/amenities
   * disabled-but-visible rather than hiding them (spec §3.4) — the upsell is
   * the point. The server gate is unconditional either way.
   */
  hasPolishBlocks: boolean;
}

/**
 * The Add tool panel: create a section and open its settings.
 *
 * ## Why every section starts with real content
 *
 * There is no "insert a blank block" option. `PATCH /api/v1/pm/site/blocks`
 * parses content through the block's Zod schema and 400s on a miss, and several
 * schemas have required fields. So each type carries a schema-valid seed (see
 * `add-catalog.ts`), and the PM edits from there rather than into an empty
 * shell. The upside is that adding a section can never leave the community
 * unable to publish — `publishBlocked` freezes publishing for the *whole* site
 * on any invalid row, and this path cannot produce one.
 *
 * ## Why the new section is selected by slot, not by id
 *
 * `useUpsertContentBlock` resolves to `void`. Auto-selecting therefore cannot
 * use `select(id)`: besides having no id, the continuation after `await` holds
 * the `select` closure from before the refetch, which would look the new block
 * up in the stale list, find nothing, and clear the selection — silently, with
 * the only symptom being an inspector that does not open. `selectSlot` anchors
 * on `(order, blockType)`, which the selection hook already re-resolves every
 * render, so there is nothing to learn and nothing to go stale.
 *
 * ## Why the panel reads the block list itself
 *
 * `EditorRoot` hands the provider `blocks ?? []`, which makes "still loading"
 * indistinguishable from "empty site" — and the next slot for an empty site is
 * 2, which would overwrite whatever really sits there. Calling
 * `useContentBlocks` here shares the query key (no extra request) and exposes
 * the `isPending` the slot maths needs.
 *
 * ## Why the slot list is NOT page-scoped (Phase 11b-3, D-C3)
 *
 * This is the one place in the phase where the community-wide list is the
 * correct input and narrowing it would be the bug. `block_order` is unique
 * across the WHOLE community until 11c drops the surviving 3-column index, so
 * `nextContentSlot` has to see every page's blocks to return a slot that is
 * actually free. Filtering to the selected page would return
 * `max(this page) + 1` — a value another page is very likely already holding,
 * which the server now refuses (`assertSlotFreeAcrossPages`) and which before
 * that guard existed surfaced as an opaque 500. `nextContentSlot(blocks)` below
 * therefore takes the raw query result, deliberately.
 *
 * ## Why the write carries an explicit page id (D-WRITE)
 *
 * `useUpsertContentBlock` would default to the selected page anyway. It is
 * passed explicitly because "the page being added to" and "the page currently
 * selected" are the same value by coincidence, not by contract — and the cost of
 * that coincidence breaking is a section written onto the live home page.
 */
export function AddPanel({ communityId, hasPolishBlocks }: AddPanelProps) {
  const { data: blocks, isPending, isError } = useContentBlocks(communityId);
  const targetPageId = useSelectedSitePage();
  const upsert = useUpsertContentBlock(communityId);
  const { selectSlot } = useSiteEditor();

  const [imageEntry, setImageEntry] = useState<AddCatalogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Tombstones INCLUDED — they are staged deletions that still hold their slot,
  // and writing over one cancels the deletion. `blocks` is the raw list;
  // `movableSections` would filter them out and is the wrong input here.
  const slot = blocks === undefined ? null : nextContentSlot(blocks);
  const isFull = blocks !== undefined && slot === null;

  const handleAdded = useCallback(
    (blockOrder: number, entry: AddCatalogEntry) => {
      selectSlot(blockOrder, entry.blockType);
      setImageEntry(null);
      setAnnouncement(`${entry.label} section added. Its settings are open.`);
    },
    [selectSlot],
  );

  const add = async (entry: AddCatalogEntry) => {
    if (slot === null || entry.seed === null) return;
    setError(null);
    try {
      await upsert.mutateAsync({
        blockType: entry.blockType,
        blockOrder: slot,
        content: entry.seed,
        pageId: targetPageId,
      });
      handleAdded(slot, entry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not add that section.');
    }
  };

  if (imageEntry !== null) {
    return (
      <div className="space-y-5" data-testid="tool-panel-add">
        <AddImageFlow
          communityId={communityId}
          entry={imageEntry}
          blockOrder={slot}
          pageId={targetPageId}
          onCancel={() => setImageEntry(null)}
          onAdded={handleAdded}
        />
      </div>
    );
  }

  // Disabled while the list is in flight (the slot would be a guess), while a
  // write is in flight (two clicks would compute the same slot and the second
  // would replace the first), and when every slot is taken.
  const blocked = isPending || isError || isFull || upsert.isPending;

  return (
    <div className="space-y-5" data-testid="tool-panel-add">
      <p className="text-sm text-content-secondary">
        Pick a section to add to the bottom of your page. You can reorder it afterwards
        in Sections.
      </p>

      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          We couldn&apos;t load your current sections, so adding is unavailable. Please
          refresh and try again.
        </p>
      )}

      {/* Community-wide, not per page: section positions are shared across the
          whole site until 11c, so the 98-section ceiling is reached across all
          pages together. Saying "this page is full" on a page holding two
          sections would be unactionable. */}
      {isFull && (
        <p role="alert" className="text-sm text-status-danger">
          Your site is full — it already has the maximum of 98 sections across all
          pages. Remove one before adding another.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {ADD_CATALOG.map((entry) => {
          const lockedByPlan = entry.isPolish && !hasPolishBlocks;
          const disabled = blocked || lockedByPlan;
          const Icon = entry.icon;
          return (
            <li key={entry.blockType}>
              <button
                type="button"
                data-testid={`add-section-${entry.blockType}`}
                disabled={disabled}
                title={
                  lockedByPlan
                    ? `Upgrade to Professional to add ${entry.label} sections`
                    : undefined
                }
                onClick={() =>
                  entry.needsImage ? setImageEntry(entry) : void add(entry)
                }
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border border-edge p-3 text-left',
                  'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-focus',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
                )}
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-content">{entry.label}</span>
                    {lockedByPlan && <PlanBadge variant="pro" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-content-secondary">
                    {entry.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* One region for this panel. The provider's own live region announces
          reorders; this announces additions, and the two never fire together. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

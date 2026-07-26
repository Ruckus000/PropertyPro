'use client';

import { memo } from 'react';
import type { BlockType } from '@propertypro/shared';
import {
  blockViewRegistry,
  isDataDrivenBlock,
} from '@/components/public-site/blocks/view-registry';
import type {
  LayoutId,
  PublicCommunity,
  ResolvedTheme,
} from '@/components/public-site/blocks/types';
import {
  selectAnnouncements,
  selectContact,
  selectDocuments,
  selectMeetings,
  type CanvasPreviewData,
} from '@/lib/site-editor/preview-data';

export interface CanvasBlockProps {
  block: { id: number; blockType: string; blockOrder: number; content: unknown };
  community: PublicCommunity;
  theme: ResolvedTheme;
  layout: LayoutId;
  preview: CanvasPreviewData;
  /** Injected so selection is deterministic under test. */
  now: number;
}

/**
 * Renders one block through the view registry.
 *
 * Two shapes, branched on `isDataDrivenBlock`: the six authored types take the
 * public site's own `BlockRendererProps`, and the four system-of-record types
 * take `BlockViewProps` with rows narrowed from the preview superset.
 *
 * Memoised on identity: editing one block must not re-render the whole canvas.
 * The narrowing is cheap, but re-rendering ten blocks (some with dozens of
 * rows) on every keystroke is not.
 */
function CanvasBlockImpl({ block, community, theme, layout, preview, now }: CanvasBlockProps) {
  const blockType = block.blockType as BlockType;
  const View = blockViewRegistry[blockType];

  // Unknown types are skipped rather than thrown — the public site does the
  // same, and a block type this build does not know about must not take the
  // whole canvas down.
  if (!View) return null;

  if (!isDataDrivenBlock(blockType)) {
    return (
      <View
        block={{
          id: block.id,
          blockType,
          blockOrder: block.blockOrder,
          content: block.content,
        }}
        community={community}
        theme={theme}
        layout={layout}
      />
    );
  }

  const data = selectPreviewRows(blockType, block.content, preview, now);
  if (data === undefined) return null;

  return (
    <View blockId={block.id} content={block.content} data={data} community={community} />
  );
}

/**
 * Narrow the preview superset for one SoR block.
 *
 * Content is `unknown` here because it has not been through its Zod schema —
 * the views themselves are tolerant, and the shells validate on the publish
 * path. Missing fields fall back to the schema defaults so a half-configured
 * block still previews instead of disappearing.
 */
function selectPreviewRows(
  blockType: BlockType,
  content: unknown,
  preview: CanvasPreviewData,
  now: number,
): unknown {
  const c = (content ?? {}) as Record<string, unknown>;
  const limit = typeof c['limit'] === 'number' ? c['limit'] : undefined;
  const windowDays = typeof c['timeWindowDays'] === 'number' ? c['timeWindowDays'] : undefined;

  switch (blockType) {
    case 'announcements':
      return selectAnnouncements(
        { limit: limit ?? 5, timeWindowDays: windowDays ?? 30 },
        preview.announcements,
        now,
      );
    case 'documents':
      return selectDocuments(
        {
          limit: limit ?? 5,
          includeCategories: Array.isArray(c['includeCategories'])
            ? (c['includeCategories'] as never)
            : ([] as never),
        },
        preview.documents,
      );
    case 'meetings':
      return selectMeetings(
        { limit: limit ?? 10, timeWindowDays: windowDays ?? 30 },
        preview.meetings,
        now,
      );
    case 'contact':
      return selectContact(
        {
          showManagement: c['showManagement'] !== false,
          showBoard: c['showBoard'] !== false,
        },
        preview.contact,
      );
    default:
      return undefined;
  }
}

export const CanvasBlock = memo(CanvasBlockImpl);

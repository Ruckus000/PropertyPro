'use client';
import { useState } from 'react';
import { useContentBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { TextBlockForm } from './TextBlockForm';
import { ImageBlockForm } from './ImageBlockForm';
import { AnnouncementsBlockForm } from './AnnouncementsBlockForm';
import {
  textBlockSchema,
  imageBlockSchema,
  announcementsBlockSchema,
  type TextBlockContent,
  type ImageBlockContent,
  type AnnouncementsBlockContent,
} from '@propertypro/shared';

interface Props {
  communityId: number;
}

const HERO_BLOCK_ORDER = 1;

function nextBlockOrder(existing: SiteBlockSummary[]): number {
  const orders = existing.map((b) => b.blockOrder);
  if (orders.length === 0) return HERO_BLOCK_ORDER + 1; // first content block after hero
  return Math.max(...orders) + 1;
}

function parseTextBlock(content: unknown): TextBlockContent | null {
  const parse = textBlockSchema.safeParse(content);
  return parse.success ? parse.data : null;
}

function parseImageBlock(content: unknown): ImageBlockContent | null {
  const parse = imageBlockSchema.safeParse(content);
  return parse.success ? parse.data : null;
}

function parseAnnouncementsBlock(content: unknown): AnnouncementsBlockContent | null {
  const parse = announcementsBlockSchema.safeParse(content);
  return parse.success ? parse.data : null;
}

export function ContentSectionsList({ communityId }: Props) {
  const { data: blocks, isLoading, isError, error } = useContentBlocks(communityId);
  const [adding, setAdding] = useState<'text' | 'image' | 'announcements' | null>(null);

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading content sections…</p>;
  }
  if (isError) {
    return (
      <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
        Failed to load content sections: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  const contentBlocks = (blocks ?? []).filter(
    (b) => b.blockType === 'text' || b.blockType === 'image' || b.blockType === 'announcements',
  );

  return (
    <section aria-labelledby="content-sections" className="space-y-6">
      <h2 id="content-sections" className="text-lg font-medium text-content">
        Content Sections
      </h2>
      {contentBlocks.length === 0 && (
        <p className="text-sm text-content-secondary">
          No content sections yet — add a text or image block below.
        </p>
      )}
      {contentBlocks.map((b) => (
        <div key={b.id} className="rounded-md border border-default bg-surface-card p-4">
          <div className="mb-3 text-xs text-content-secondary">
            #{b.blockOrder} — {b.blockType}
          </div>
          {b.blockType === 'text' && (
            <TextBlockForm
              communityId={communityId}
              blockOrder={b.blockOrder}
              initial={parseTextBlock(b.content)}
            />
          )}
          {b.blockType === 'image' && (
            <ImageBlockForm
              communityId={communityId}
              blockOrder={b.blockOrder}
              initial={parseImageBlock(b.content)}
            />
          )}
          {b.blockType === 'announcements' && (
            <AnnouncementsBlockForm
              communityId={communityId}
              blockOrder={b.blockOrder}
              initial={parseAnnouncementsBlock(b.content)}
            />
          )}
        </div>
      ))}
      {adding === 'text' && (
        <div className="rounded-md border-2 border-dashed border-default bg-surface-card p-4">
          <div className="mb-3 text-xs text-content-secondary">
            New text section #{nextBlockOrder(contentBlocks)}
          </div>
          <TextBlockForm
            communityId={communityId}
            blockOrder={nextBlockOrder(contentBlocks)}
            initial={null}
            onSaved={() => setAdding(null)}
          />
        </div>
      )}
      {adding === 'image' && (
        <div className="rounded-md border-2 border-dashed border-default bg-surface-card p-4">
          <div className="mb-3 text-xs text-content-secondary">
            New image section #{nextBlockOrder(contentBlocks)}
          </div>
          <ImageBlockForm
            communityId={communityId}
            blockOrder={nextBlockOrder(contentBlocks)}
            initial={null}
            onSaved={() => setAdding(null)}
          />
        </div>
      )}
      {adding === 'announcements' && (
        <div className="rounded-md border-2 border-dashed border-default bg-surface-card p-4">
          <div className="mb-3 text-xs text-content-secondary">
            New announcements section #{nextBlockOrder(contentBlocks)}
          </div>
          <AnnouncementsBlockForm
            communityId={communityId}
            blockOrder={nextBlockOrder(contentBlocks)}
            initial={null}
            onSaved={() => setAdding(null)}
          />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => setAdding('text')}
          className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          + Add text section
        </button>
        <button
          type="button"
          onClick={() => setAdding('image')}
          className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          + Add image section
        </button>
        <button
          type="button"
          onClick={() => setAdding('announcements')}
          className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          + Add announcements section
        </button>
      </div>
    </section>
  );
}

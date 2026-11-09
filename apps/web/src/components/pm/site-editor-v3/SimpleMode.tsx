'use client';

/**
 * Simple mode: the two things a volunteer changes, beside the home page they
 * change.
 *
 * - **Welcome**: the headline, subtitle and photos, in ONE `HeroForm`. The hero
 *   route replaces the whole hero on every save, so the words and the photos
 *   must come from one form: two forms would each save the other's stale half.
 * - **Look**: `LookChooser`, the same control Advanced's Design panel shows.
 *
 * Both save drafts, like everything in the editor; the top bar's Publish makes
 * them live. Contact details are not here: they belong to the community
 * profile and are used across PropertyPro, so they save straight away where
 * they live, and this panel links there.
 *
 * Always the home page: `EditorRoot` pins the page to home while Simple shows,
 * so the preview (`PreviewBody` reads the selected page) and the hero agree.
 *
 * Laid out panel first: on a phone the edits come first and the preview below,
 * and from 768px the preview is on the left with the panel beside it, each
 * column scrolling on its own.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { SiteFooter, SiteNav, SitePageContext } from '@/components/public-site/layouts/types';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import { cn } from '@/lib/utils';
import type { PreviewDevice } from './EditorTopBar';
import { useSiteEditor } from './editor-context';
import { HeroForm } from './inspector/forms/HeroForm';
import { LookChooser } from './panels/LookChooser';
import { PreviewBody } from './PreviewDialog';
import type { SimpleItem } from './settings/settings-tabs';

export interface SimpleModeProps {
  communityId: number;
  context: CanvasContext;
  device: PreviewDevice;
  nav?: SiteNav;
  footer?: SiteFooter;
  page?: SitePageContext;
  /** The row open on arrival (`?item=`, the overview's quick edits). */
  initialItem: SimpleItem;
}

const FRAME_WIDTH: Record<PreviewDevice, string> = {
  desktop: 'max-w-none',
  tablet: 'max-w-3xl',
  phone: 'max-w-sm',
};

export function SimpleMode({
  communityId,
  context,
  device,
  nav,
  footer,
  page,
  initialItem,
}: SimpleModeProps) {
  const [open, setOpen] = useState<SimpleItem | null>(initialItem);
  const { blocks } = useSiteEditor();
  const hero = blocks.find((block) => block.blockType === 'hero');

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row-reverse">
      <aside
        aria-label="Edit your website"
        className="shrink-0 border-b border-edge bg-surface-card md:w-96 md:overflow-y-auto md:border-b-0 md:border-l"
      >
        <div className="space-y-2 p-4">
          <Row
            item="welcome"
            title="Welcome"
            hint="The words and photo at the top of your home page."
            open={open}
            onToggle={setOpen}
          >
            <HeroForm
              communityId={communityId}
              blockType="hero"
              blockOrder={hero?.blockOrder ?? 1}
              content={hero?.content}
              variant="simple"
            />
          </Row>
          <Row
            item="look"
            title="Look"
            hint="How your whole site is laid out."
            open={open}
            onToggle={setOpen}
          >
            <LookChooser communityId={communityId} hideLegend />
          </Row>
          <p className="px-1 pt-2 text-sm text-content-secondary">
            Phone, email and office hours come from your{' '}
            <Link
              href={`/settings?communityId=${communityId}#community-profile`}
              className="font-medium text-content-link underline"
            >
              community profile
            </Link>
            . Changes there take effect straight away.
          </p>
          <p className="px-1 text-sm text-content-secondary">
            Pages and sections are in Advanced. Your changes come with you.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-surface-page p-4 md:overflow-y-auto md:p-6">
        <div className={cn('mx-auto w-full', FRAME_WIDTH[device])}>
          <PreviewBody
            communityId={communityId}
            context={context}
            nav={nav}
            footer={footer}
            page={page}
          />
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  item: SimpleItem;
  title: string;
  hint: string;
  open: SimpleItem | null;
  onToggle: (next: SimpleItem | null) => void;
  children: React.ReactNode;
}

/** One disclosure row. One row is open at a time; opening another closes it. */
function Row({ item, title, hint, open, onToggle, children }: RowProps) {
  // Not useId: under next/dynamic it differs between server and hydration, and
  // React leaves the server's id, so aria-controls pointed at nothing. One
  // Simple panel per page makes the item name unique.
  const regionId = `simple-${item}-region`;
  const expanded = open === item;
  return (
    <section className="rounded-[var(--radius-md)] border border-edge bg-surface-card">
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          // Only while the region exists: a collapsed row's region is not rendered.
          aria-controls={expanded ? regionId : undefined}
          onClick={() => onToggle(expanded ? null : item)}
          className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-md)] px-4 py-2 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-content">{title}</span>
            <span className="block text-sm text-content-secondary">{hint}</span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-content-tertiary', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h2>
      {expanded ? (
        <div id={regionId} className="border-t border-edge-subtle px-4 pb-4 pt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

'use client';

/**
 * The card layouts of the Communities page.
 *
 * - `CommunityChooser` (one or two communities): a large card each, with the
 *   status written out and two ways in, the dashboard and the website.
 * - `CommunityGallery` (three or more, in cards view): one site card per
 *   community, plus an Add Community tile.
 */
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';
import { communityMeta, dashboardHref, websiteHref } from '@/lib/pm/communities-page';
import { SiteThumbnail } from './SiteThumbnail';
import { StatusLine, StatusPanel, UnpublishedEditsTag } from './CommunityStatus';

export function CommunityChooser({ communities }: { communities: PortfolioCommunity[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
      {communities.map((c) => (
        <li key={c.communityId} className="relative flex flex-col overflow-hidden rounded-md border border-edge bg-surface-card">
          {c.hasUnpublishedSiteDrafts && <UnpublishedEditsTag className="absolute right-3 top-3" />}
          <SiteThumbnail color={c.brandColor} size="lg" className="border-b border-edge" />
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            <div>
              <h2 className="text-lg font-semibold leading-tight text-content md:text-xl">{c.communityName}</h2>
              <p className="mt-1 text-sm text-content-secondary">{communityMeta(c, { long: true })}</p>
            </div>
            <StatusPanel community={c} />
            <div className="mt-auto flex gap-2">
              <Button asChild className="flex-1">
                <Link href={dashboardHref(c.communityId)} aria-label={`Open dashboard for ${c.communityName}`}>
                  Open dashboard
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={websiteHref(c.communityId)} aria-label={`Website for ${c.communityName}`}>
                  Website
                </Link>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface CommunityGalleryProps {
  communities: PortfolioCommunity[];
  /** Show the Add Community tile (the full portfolio is on screen). */
  showAddTile: boolean;
  onAdd: () => void;
  addDisabled: boolean;
}

export function CommunityGallery({ communities, showAddTile, onAdd, addDisabled }: CommunityGalleryProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {communities.map((c) => (
        <li key={c.communityId}>
          <Link
            href={dashboardHref(c.communityId)}
            className={cn(
              'relative flex h-full gap-3 overflow-hidden rounded-md border border-edge bg-surface-card p-3 md:flex-col md:gap-0 md:p-0',
              'transition-colors duration-quick hover:border-edge-strong',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            )}
          >
            <SiteThumbnail
              color={c.brandColor}
              size="md"
              className="w-28 shrink-0 self-start rounded-sm border border-edge md:w-full md:rounded-none md:border-0 md:border-b"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-0 md:p-5">
              <h2 className="text-base font-semibold leading-tight text-content">{c.communityName}</h2>
              <p className="text-sm text-content-secondary md:mt-1">{communityMeta(c)}</p>
              <StatusLine
                community={c}
                requests
                duesAmount
                className="md:mt-4 md:border-t md:border-edge md:pt-4"
              />
              {c.hasUnpublishedSiteDrafts && (
                <UnpublishedEditsTag className="mt-1 self-start md:absolute md:right-3 md:top-3 md:mt-0" />
              )}
            </div>
          </Link>
        </li>
      ))}
      {showAddTile && (
        <li className="hidden md:block">
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className={cn(
              'flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-edge p-5',
              'transition-colors duration-quick hover:border-interactive hover:bg-surface-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-edge bg-surface-card">
              <Plus aria-hidden="true" className="size-5 text-content" />
            </span>
            <span className="text-sm font-semibold text-content">Add Community</span>
            <span className="text-sm text-content-secondary">Set up a new association</span>
          </button>
        </li>
      )}
    </ul>
  );
}

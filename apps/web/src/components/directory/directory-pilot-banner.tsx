import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

/**
 * Shown on the old Units and Residents pages to communities in the
 * `directory_v2` pilot — the entry point until the nav cutover phase.
 */
export function DirectoryPilotBanner({ communityId, tab }: { communityId: number; tab: 'units' | 'residents' }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-status-info-border bg-status-info-bg px-4 py-3 text-status-info">
      <Sparkles size={18} className="shrink-0" aria-hidden="true" />
      <p className="min-w-60 flex-1 text-sm">
        <strong className="font-semibold">Try the new Directory.</strong> Units, residents and access requests on one
        page.
      </p>
      <Link
        href={`/dashboard/directory?communityId=${communityId}&tab=${tab}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-status-info-border bg-surface-card px-3 text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Open Directory
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

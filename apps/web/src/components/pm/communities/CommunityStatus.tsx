/**
 * How a community's measured status reads on the Communities page: a dot, the
 * label in the status colour, then what was measured. Never colour alone —
 * the label always carries the meaning.
 */
import { AlertCircle, CheckCircle2, MinusCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';
import { STATUS_LABELS, statusDetails, type CommunityStatus } from '@/lib/pm/communities-page';

const TONE: Record<CommunityStatus, { text: string; dot: string; box: string; icon: LucideIcon; count: string }> = {
  needs_attention: {
    text: 'text-status-danger',
    dot: 'bg-status-danger',
    box: 'border-status-danger-border bg-status-danger-bg',
    icon: AlertCircle,
    count: 'bg-status-danger-bg text-status-danger',
  },
  on_track: {
    text: 'text-status-success',
    dot: 'bg-status-success',
    box: 'border-status-success-border bg-status-success-bg',
    icon: CheckCircle2,
    count: 'bg-status-success-bg text-status-success',
  },
  not_tracked: {
    text: 'text-content',
    dot: 'bg-status-neutral',
    box: 'border-edge bg-surface-muted',
    icon: MinusCircle,
    count: 'bg-surface-muted text-content-secondary',
  },
};

export function statusCountClass(status: CommunityStatus): string {
  return TONE[status].count;
}

/** The dot and the label, for the dense table's Status column. */
export function StatusLabel({ status, className }: { status: CommunityStatus; className?: string }) {
  const tone = TONE[status];
  return (
    <span className={cn('inline-flex items-center gap-2 font-medium', tone.text, className)}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface StatusLineProps {
  community: PortfolioCommunity;
  requests?: boolean;
  duesAmount?: boolean;
  className?: string;
}

/** "• Needs attention · 3 documents past deadline". */
export function StatusLine({ community, requests, duesAmount, className }: StatusLineProps) {
  const tone = TONE[community.status];
  const details = statusDetails(community, { requests, duesAmount });
  return (
    <p className={cn('text-sm text-content-secondary', className)}>
      <span
        aria-hidden="true"
        className={cn('mr-2 inline-block size-1.5 rounded-full align-middle', tone.dot)}
      />
      <span className={cn('font-medium', tone.text)}>{STATUS_LABELS[community.status]}</span>
      {details.map((part) => (
        <span key={part}> · {part}</span>
      ))}
    </p>
  );
}

/** The chooser's status panel: icon, label, and the long wording. */
export function StatusPanel({ community }: { community: PortfolioCommunity }) {
  const tone = TONE[community.status];
  const Icon = tone.icon;
  const details = statusDetails(community, { requests: true, long: true });
  return (
    <div className={cn('flex gap-3 rounded-md border p-4', tone.box)}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', tone.text)} />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', tone.text)}>{STATUS_LABELS[community.status]}</p>
        {details.length > 0 && <p className="mt-0.5 text-sm text-content-secondary">{details.join(' · ')}</p>}
      </div>
    </div>
  );
}

/** Shown only when the site has edits nobody has published. */
export function UnpublishedEditsTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-edge bg-surface-card px-2 py-0.5 text-xs font-medium text-content',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status-warning" />
      Unpublished edits
    </span>
  );
}

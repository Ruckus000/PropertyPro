'use client';

/**
 * The Documents tool (website builder v4, Phase 6 — the thin version).
 *
 * The design drew a whole documents library inside the editor. The product
 * already has one (`/communities/<id>/documents`: drafts, multi-file upload,
 * replacing a file, duplicate detection, the personal-information check), so
 * this panel does what the library cannot do from inside the editor: says, per
 * group of official records, whether the website's records section has what
 * it should — and links straight to the library to fix it.
 *
 * Statuses come from the compliance checklist (`summarizeRecords`), which
 * already follows the website rule's size threshold. No fine amounts and no
 * "required" claims beyond what the checklist says — see the v4 plan's
 * legal-copy rule.
 */

import Link from 'next/link';
import { CircleCheck, Clock, FilePen, FileX, ExternalLink } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { summarizeRecords, type RecordsGroup, type RecordsStatus } from '@/lib/site-editor/records-status';
import { useRequiredSections } from '../required-sections-context';

export interface DocumentsPanelProps {
  communityId: number;
  communityType: CommunityType;
}

const STATUS_COPY: Record<RecordsStatus, { label: string; tone: string; Icon: typeof FileX }> = {
  nothing_posted: { label: 'Nothing posted', tone: 'text-status-danger', Icon: FileX },
  not_posted: { label: 'Saved, not posted', tone: 'text-status-warning', Icon: FilePen },
  out_of_date: { label: 'Out of date', tone: 'text-status-warning', Icon: Clock },
  up_to_date: { label: 'Up to date', tone: 'text-status-success', Icon: CircleCheck },
};

function GroupRow({ group, libraryHref }: { group: RecordsGroup; libraryHref: string }) {
  const { label, tone, Icon } = STATUS_COPY[group.status];
  const href =
    group.draftDocumentId !== null ? `${libraryHref}?doc=${group.draftDocumentId}` : libraryHref;
  return (
    <li
      data-testid={`records-group-${group.category}`}
      className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-edge p-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-content">{group.label}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${tone}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </p>
        <p className="mt-0.5 text-xs text-content-tertiary">
          {group.satisfied} of {group.total} posted
        </p>
      </div>
      {group.status !== 'up_to_date' ? (
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          {group.status === 'not_posted' ? 'Review and post' : 'Upload'}
          <span className="sr-only"> — {group.label}</span>
        </Link>
      ) : null}
    </li>
  );
}

export function DocumentsPanel({ communityId, communityType }: DocumentsPanelProps) {
  const libraryHref = `/communities/${communityId}/documents`;
  // Apartments have no statutory records checklist; the compliance route
  // refuses them, so the request is never made.
  const hasChecklist = communityType !== 'apartment';
  const checklist = useComplianceChecklist(communityId, { enabled: hasChecklist });
  const { level, threshold, subject } = useRequiredSections();

  const openLibrary = (
    <Link href={libraryHref} className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-2')}>
      Open documents
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </Link>
  );

  if (!hasChecklist) {
    return (
      <div className="space-y-4" data-testid="tool-panel-documents">
        <p className="text-sm text-content-secondary">
          Documents you post can appear on your website. Upload and manage them in Documents.
        </p>
        {openLibrary}
      </div>
    );
  }

  if (checklist.isError) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load your records"
        action={
          <Button variant="outline" size="sm" onClick={() => void checklist.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!checklist.data) {
    return (
      <div role="status" aria-label="Loading records" className="space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  const groups = summarizeRecords(checklist.data);

  return (
    <div className="space-y-4" data-testid="tool-panel-documents">
      <p className="text-sm text-content-secondary">
        Documents you post fill the official records section of your website.
      </p>
      {level === 'recommended' && threshold && subject.unitCount !== null ? (
        <p className="text-sm text-content-secondary" data-testid="records-recommended-note">
          Florida&apos;s website-posting rule applies from {threshold.minUnits} {threshold.unitNoun};
          this association has {subject.unitCount}, so posting these is recommended.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-content-secondary">No records are tracked for this community yet.</p>
      ) : (
        <ul className="space-y-2" aria-label="Official records">
          {groups.map((group) => (
            <GroupRow key={group.category} group={group} libraryHref={libraryHref} />
          ))}
        </ul>
      )}
      {openLibrary}
    </div>
  );
}

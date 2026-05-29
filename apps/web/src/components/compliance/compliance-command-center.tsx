'use client';

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@propertypro/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useComplianceChecklist } from '@/hooks/useComplianceChecklist';
import { useComplianceMutations } from '@/hooks/useComplianceMutations';
import { buildComplianceSummary, sortByPriority } from '@/lib/utils/compliance-calculator';
import { ComplianceOnboarding } from './compliance-onboarding';
import { ComplianceActivityFeed } from './compliance-activity-feed';
import { ComplianceRequirementCard } from './compliance-requirement-card';
import { ComplianceStatusHero } from './compliance-status-hero';
import { UploadDocumentModal } from './upload-document-modal';
import { LinkDocumentModal } from './link-document-modal';
import type { CommunityRole, NewCommunityRole } from '@propertypro/shared';
import type { ChecklistItemData } from './compliance-checklist-item';

export interface ComplianceCommandCenterProps {
  communityId: number;
  role: CommunityRole | NewCommunityRole;
  canWrite: boolean;
}

export function ComplianceCommandCenter({
  communityId,
  role,
  canWrite,
}: ComplianceCommandCenterProps) {
  const router = useRouter();
  const [uploadItem, setUploadItem] = useState<ChecklistItemData | null>(null);
  const [linkItem, setLinkItem] = useState<ChecklistItemData | null>(null);
  const { data: items = [], isLoading, error, refetch } = useComplianceChecklist(communityId);
  const mutations = useComplianceMutations(communityId);

  const summary = useMemo(
    () => buildComplianceSummary(items as ChecklistItemData[], new Date()),
    [items],
  );
  const prioritized = useMemo(
    () => sortByPriority(items as ChecklistItemData[]),
    [items],
  );
  const needsYou = useMemo(
    () => prioritized.filter((i) => i.status === 'overdue' || i.status === 'unsatisfied'),
    [prioritized],
  );
  const done = useMemo(
    () => prioritized.filter((i) => i.status === 'satisfied' || i.status === 'not_applicable'),
    [prioritized],
  );
  const worst = needsYou[0] ?? null;

  function jumpToWorst() {
    if (!worst) return;
    const el = document.querySelector<HTMLElement>(`[data-card-id="${worst.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      requestAnimationFrame(() => el.focus({ preventScroll: true }));
    }
  }

  const cardHandlers = {
    onUpload: (item: ChecklistItemData) => setUploadItem(item),
    onLink: (item: ChecklistItemData) => setLinkItem(item),
    onView: (item: ChecklistItemData) => {
      if (item.documentId) {
        window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
      }
    },
    onMarkApplicable: (item: ChecklistItemData) =>
      mutations.markApplicable.mutate({ itemId: item.id }),
    onMarkNA: (item: ChecklistItemData) =>
      mutations.markNotApplicable.mutate({ itemId: item.id }),
    onUnlink: (item: ChecklistItemData) =>
      mutations.unlinkDocument.mutate({ itemId: item.id }),
  };

  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load compliance records"
        description="Please try again."
        action={
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const breadcrumb = (
    <ol className="flex items-center gap-2 text-sm text-content-secondary">
      <li><Link href="/dashboard">Communities</Link></li>
      <li aria-hidden="true">/</li>
      <li aria-current="page" className="text-content">Compliance</li>
    </ol>
  );

  const actions = canWrite ? (
    <Button variant="secondary" onClick={() => router.push('/documents')}>
      Upload record
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={breadcrumb}
        title="Compliance"
        description="Records and statutory requirements"
        actions={actions}
      />

      {isLoading ? (
        <ComplianceLoadingSkeleton />
      ) : (
        <>
          <ComplianceStatusHero summary={summary} worstItem={worst} onJumpToWorst={jumpToWorst} />

          <section
            aria-label="Compliance metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <KpiCard
              label="Readiness"
              value={`${summary.readiness.percentage}%`}
              meta={`${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} satisfied`}
            />
            <KpiCard
              label="Posting windows"
              value={summary.postingWindowsDueSoonCount}
              meta="Due inside 7 days"
            />
            <KpiCard
              label="Overdue"
              value={summary.overdueCount}
              meta="Past deadline"
              tone={summary.overdueCount > 0 ? 'alert' : 'default'}
            />
            <KpiCard
              label="Needs board action"
              value={summary.needsBoardActionCount}
              meta="Approvals and reviews pending"
            />
          </section>

          <ComplianceOnboarding
            items={items as ChecklistItemData[]}
            onUpload={(item) => setUploadItem(item as ChecklistItemData)}
          />

          <section aria-labelledby="needs-you-heading" className="flex flex-col gap-3">
            <h2 id="needs-you-heading" className="text-lg font-semibold">Needs you</h2>
            {needsYou.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center">
                <p className="text-base font-semibold text-content">You&apos;re all caught up</p>
                <p className="mt-1 text-sm text-content-secondary">No records need attention right now.</p>
              </div>
            ) : (
              needsYou.map((item) => (
                <div key={item.id} data-card-id={item.id} tabIndex={-1}>
                  <ComplianceRequirementCard
                    item={item}
                    communityId={communityId}
                    canWrite={canWrite}
                    role={role}
                    variant="needs-attention"
                    {...cardHandlers}
                  />
                </div>
              ))
            )}
          </section>

          {done.length > 0 && (
            <details className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)]">
                You&apos;re caught up on {done.length} {done.length === 1 ? 'record' : 'records'}
              </summary>
              <div className="flex flex-col gap-3 p-4 pt-0">
                {done.map((item) => (
                  <div key={item.id} data-card-id={item.id} tabIndex={-1}>
                    <ComplianceRequirementCard
                      item={item}
                      communityId={communityId}
                      canWrite={canWrite}
                      role={role}
                      variant="done"
                      {...cardHandlers}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {uploadItem && (
            <UploadDocumentModal
              communityId={communityId}
              defaultTitle={uploadItem.title}
              categoryName={uploadItem.category}
              onUploaded={(documentId) => {
                mutations.linkDocument.mutate({ itemId: uploadItem.id, documentId });
                setUploadItem(null);
              }}
              onClose={() => setUploadItem(null)}
            />
          )}
          {linkItem && (
            <LinkDocumentModal
              communityId={communityId}
              onSelect={(documentId) => {
                mutations.linkDocument.mutate({ itemId: linkItem.id, documentId });
                setLinkItem(null);
              }}
              onClose={() => setLinkItem(null)}
            />
          )}

          <section id="compliance-activity-feed">
            <ComplianceActivityFeed communityId={communityId} />
          </section>
        </>
      )}
    </div>
  );
}

function ComplianceLoadingSkeleton() {
  return (
    <div
      data-testid="compliance-loading"
      aria-busy="true"
      aria-label="Loading compliance records"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label, value, meta, tone = 'default',
}: { label: string; value: string | number; meta: string; tone?: 'default' | 'alert' }) {
  return (
    <article className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{label}</div>
      <div
        className={cn(
          'mt-2 flex items-center gap-2 text-3xl font-bold tabular-nums',
          tone === 'alert' ? 'text-[var(--status-danger)]' : 'text-content',
        )}
      >
        {tone === 'alert' && <AlertTriangle size={20} aria-hidden="true" />}
        {value}
      </div>
      <div className="mt-1 text-sm text-content-secondary">{meta}</div>
    </article>
  );
}

export default ComplianceCommandCenter;

'use client';

import * as React from 'react';
import { Download, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useDeleteWindMitigationReport,
  useWindMitigationReports,
} from '@/hooks/use-wind-mitigation';
import {
  WIND_MITIGATION_DISCLAIMER,
  WIND_MITIGATION_CARD_DISCLAIMER,
  WIND_MITIGATION_EXPIRED_WARNING,
  WIND_MITIGATION_EXPIRY_CAPTION,
  buildWindMitigationAgentEmail,
} from '@/lib/constants/insurance-disclaimers';
import {
  WIND_MITIGATION_FORM_LABELS,
  WIND_MITIGATION_VERSION_LABELS,
  type WindMitigationExpiryBand,
  type WindMitigationReportRecord,
} from './types';
import { WindMitigationFormDialog } from './wind-mitigation-form-dialog';

interface WindMitigationSectionProps {
  communityId: number;
  communityName: string;
  /** Admin-tier viewers get the add/edit/supersede affordances. */
  canManage: boolean;
}

/**
 * Map an expiry band onto a StatusBadge status + label.
 *
 * Status is never conveyed by color alone (design rule): StatusBadge renders
 * an icon and text alongside the color. Labels are stated in the owner's
 * terms ("Expires in 24 days") rather than the internal band name.
 */
function expiryBadge(
  band: WindMitigationExpiryBand,
  daysUntilExpiry: number,
): { status: string; label: string } {
  switch (band) {
    case 'expired':
      return { status: 'overdue', label: 'Expired' };
    case '30_days':
    case '90_days':
      return { status: 'due_soon', label: `Expires in ${daysUntilExpiry} days` };
    case '180_days':
      return { status: 'brand', label: `Expires in ${daysUntilExpiry} days` };
    case 'none':
      return { status: 'compliant', label: 'Current' };
  }
}

/** Render an ISO date as a human date without pulling in a formatting lib. */
function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ReportCard({
  report,
  communityId,
  communityName,
  canManage,
  onEdit,
}: {
  report: WindMitigationReportRecord;
  communityId: number;
  communityName: string;
  canManage: boolean;
  onEdit: (report: WindMitigationReportRecord) => void;
}) {
  const deleteReport = useDeleteWindMitigationReport(communityId);
  const badge = expiryBadge(report.expiryBand, report.daysUntilExpiry);

  const isExpired = report.expiryBand === 'expired';

  // The owner mails their own agent from their own client: PropertyPro hands
  // them a pre-written message rather than contacting an insurer on their
  // behalf. Copy is attorney-reviewed (insurance-disclaimers.ts). The email now
  // carries the validity/expiry date and an expired-form warning (legal
  // review #1/#5) so the caveat travels with the transmission, not just the
  // on-screen badge.
  const agentEmail = buildWindMitigationAgentEmail({
    communityName,
    buildingLabel: report.buildingLabel,
    inspectedAt: formatIsoDate(report.inspectedAt),
    expiresAt: formatIsoDate(report.expiresAt),
    isExpired,
  });
  const mailtoHref = `mailto:?subject=${encodeURIComponent(agentEmail.subject)}&body=${encodeURIComponent(agentEmail.body)}`;
  const downloadHref = `/api/v1/documents/${report.documentId}/download?communityId=${communityId}&attachment=true`;

  // Legal-review blocker #1: gate Download + Send behind an expiry interstitial
  // when the form is expired, so the owner is warned at the point of
  // transmission. For a current form the plain links are used unchanged.
  const guardExpired = (proceed: () => void) => {
    if (!isExpired || window.confirm(WIND_MITIGATION_EXPIRED_WARNING(formatIsoDate(report.expiresAt)))) {
      proceed();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {WIND_MITIGATION_FORM_LABELS[report.formType]}
            {report.buildingLabel ? ` — ${report.buildingLabel}` : ''}
          </CardTitle>
          <p className="text-sm text-content-tertiary">
            {WIND_MITIGATION_VERSION_LABELS[report.formVersion]} · Inspected{' '}
            {formatIsoDate(report.inspectedAt)}
          </p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} subtle />
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block">
            {/* 'Expires' not 'Valid until' — the latter asserts insurer-acceptance
                fact (legal review #7). Caption reframes the date as a guideline. */}
            <dt className="text-content-tertiary">Expires</dt>
            <dd className="text-content">{formatIsoDate(report.expiresAt)}</dd>
          </div>
          {report.inspectorName && (
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-content-tertiary">Inspector</dt>
              <dd className="text-content">
                {report.inspectorName}
                {report.inspectorLicense ? ` (${report.inspectorLicense})` : ''}
              </dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-content-tertiary">{WIND_MITIGATION_EXPIRY_CAPTION}</p>

        {report.notes && <p className="text-sm text-content-secondary">{report.notes}</p>}

        <div className="flex flex-wrap gap-2">
          {/* Reuses the existing signed-URL download route — 1-hour TTL, audited.
              An expired report interstitials both actions (legal review #1). */}
          <Button size="sm" onClick={() => guardExpired(() => { window.location.href = downloadHref; })}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => guardExpired(() => { window.location.href = mailtoHref; })}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Send to My Insurance Agent
          </Button>

          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onEdit(report)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteReport.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Remove this report from the wind-mitigation locker? Owners will no longer see it here. The uploaded document remains in your document library and part of your association records — removing it here does not affect your record-retention or records-request obligations.',
                    )
                  ) {
                    deleteReport.mutate(report.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </>
          )}
        </div>

        {/* Per-card no-advice / no-promise hedge travels with the actions
            (legal review #6), not just the section header. */}
        <p className="text-xs text-content-tertiary">{WIND_MITIGATION_CARD_DISCLAIMER}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Wind-mitigation locker section of the insurance hub.
 *
 * Resident-first by construction: the download and "send to my agent" actions
 * are the primary affordances for every role, and management controls are
 * additive for admins.
 */
export function WindMitigationSection({
  communityId,
  communityName,
  canManage,
}: WindMitigationSectionProps) {
  const { data: reports, isLoading, isError, refetch } = useWindMitigationReports({ communityId });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WindMitigationReportRecord | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (report: WindMitigationReportRecord) => {
    setEditing(report);
    setDialogOpen(true);
  };

  return (
    <section className="space-y-4" aria-labelledby="wind-mitigation-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="wind-mitigation-heading" className="text-xl font-semibold text-content">
            Wind Mitigation
          </h2>
          <p className="max-w-2xl text-sm text-content-tertiary">
            {WIND_MITIGATION_DISCLAIMER}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Report
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {isError && (
        <AlertBanner
          status="danger"
          title="We couldn't load the wind-mitigation reports"
          description="Please try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && reports && reports.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              preset={canManage ? 'wind_mitigation_empty_admin' : 'wind_mitigation_empty_resident'}
              action={
                canManage ? (
                  <Button onClick={openCreate} size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Report
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && reports && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              communityId={communityId}
              communityName={communityName}
              canManage={canManage}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {canManage && (
        <WindMitigationFormDialog
          communityId={communityId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </section>
  );
}

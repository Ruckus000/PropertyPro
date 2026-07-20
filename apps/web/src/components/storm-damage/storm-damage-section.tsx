'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useStormDamageReports,
  useUpdateStormDamageStatus,
} from '@/hooks/use-storm-damage';
import {
  STORM_DAMAGE_CARD_DISCLAIMER,
  STORM_DAMAGE_DISCLAIMER,
  STORM_DAMAGE_STATUS_NOTE,
} from '@/lib/constants/storm-disclaimers';
import {
  STORM_DAMAGE_CATEGORY_LABELS,
  STORM_DAMAGE_SEVERITY_LABELS,
  STORM_DAMAGE_STATUS_LABELS,
  type StormDamageReportRecord,
  type StormDamageStatus,
} from './types';
import { StormDamageFormDialog } from './storm-damage-form-dialog';

interface Props {
  communityId: number;
  /** Admin-tier controls (status transitions). */
  canManage: boolean;
}

const STATUS_OPTIONS = Object.keys(STORM_DAMAGE_STATUS_LABELS) as StormDamageStatus[];

// Map each report status to a StatusBadge visual variant. Labels come from the
// single-source-of-truth STORM_DAMAGE_STATUS_LABELS so the resident-visible
// badge can never drift from the attorney-reviewed neutral vocabulary.
const STATUS_BADGE_VARIANT: Record<StormDamageStatus, string> = {
  submitted: 'submitted',
  acknowledged: 'in_progress',
  closed: 'closed',
};

function statusBadge(status: StormDamageStatus): { status: string; label: string } {
  return {
    status: STATUS_BADGE_VARIANT[status],
    label: STORM_DAMAGE_STATUS_LABELS[status],
  };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function ReportCard({
  report,
  communityId,
  canManage,
}: {
  report: StormDamageReportRecord;
  communityId: number;
  canManage: boolean;
}) {
  const updateStatus = useUpdateStormDamageStatus(communityId);
  const badge = statusBadge(report.status);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {STORM_DAMAGE_CATEGORY_LABELS[report.category]} — {report.locationLabel}
          </CardTitle>
          <p className="text-sm text-content-tertiary">
            {STORM_DAMAGE_SEVERITY_LABELS[report.severity]} · Reported {formatDateTime(report.createdAt)}
            {report.occurredAt ? ` · Occurred ${formatDateTime(report.occurredAt)}` : ''}
          </p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} subtle />
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-content">{report.description}</p>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-content-tertiary">Status</span>
            <Select
              value={report.status}
              onValueChange={(v) => updateStatus.mutate({ id: report.id, status: v as StormDamageStatus })}
              disabled={updateStatus.isPending}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STORM_DAMAGE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p className="text-xs text-content-tertiary">{STORM_DAMAGE_CARD_DISCLAIMER}</p>
      </CardContent>
    </Card>
  );
}

export function StormDamageSection({ communityId, canManage }: Props) {
  const { data: reports, isLoading, isError, refetch } = useStormDamageReports({ communityId });
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <section className="space-y-4" aria-labelledby="storm-damage-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="storm-damage-heading" className="text-xl font-semibold text-content">
            Storm Damage
          </h2>
          <p className="max-w-2xl text-sm text-content-tertiary">{STORM_DAMAGE_DISCLAIMER}</p>
          <p className="max-w-2xl text-xs text-content-tertiary">{STORM_DAMAGE_STATUS_NOTE}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Report Damage
        </Button>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {isError && (
        <AlertBanner
          status="danger"
          title="We couldn't load storm-damage reports"
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
              preset={canManage ? 'storm_damage_empty_admin' : 'storm_damage_empty_resident'}
              action={
                <Button onClick={() => setDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Report Damage
                </Button>
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
              canManage={canManage}
            />
          ))}
        </div>
      )}

      <StormDamageFormDialog
        communityId={communityId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  );
}

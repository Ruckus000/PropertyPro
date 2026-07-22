'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useWindMitigationReports } from '@/hooks/use-wind-mitigation';
import { ReportCard } from './wind-mitigation-section';
import { WindMitigationFormDialog } from './wind-mitigation-form-dialog';
import type { WindMitigationReportRecord } from './types';

interface WindMitigationReportDetailProps {
  communityId: number;
  communityName: string;
  /** Admin-tier viewers get the edit/supersede affordances. */
  canManage: boolean;
  reportId: number;
  /** Insurance hub href, for the "report removed" fallback. */
  hubHref: string;
}

/**
 * Client detail view for a single wind-mitigation report.
 *
 * Reuses the enriched list query (`useWindMitigationReports`) rather than a
 * bespoke single-report endpoint — the per-community row count is tiny, the
 * data is already cached from the hub, and this reuses the API's server-computed
 * expiry band. It renders the same `ReportCard` as the hub (minus the
 * self-referential detail link) so the download / send-to-agent / edit
 * affordances — and their attorney-reviewed disclaimers — stay single-sourced.
 *
 * The server page has already resolved this report (for the page title), so the
 * not-found branch here only trips in the rare window where it was removed
 * between the server render and this client fetch.
 */
export function WindMitigationReportDetail({
  communityId,
  communityName,
  canManage,
  reportId,
  hubHref,
}: WindMitigationReportDetailProps) {
  const { data: reports, isLoading, isError, refetch } = useWindMitigationReports({ communityId });
  const [editing, setEditing] = React.useState<WindMitigationReportRecord | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load this report"
        description="Please try again."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const report = reports?.find((r) => r.id === reportId) ?? null;

  if (!report) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-content-secondary">
            This wind-mitigation report is no longer available — it may have been removed.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={hubHref}>Back to Insurance</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ReportCard
        report={report}
        communityId={communityId}
        communityName={communityName}
        canManage={canManage}
        onEdit={(r) => {
          setEditing(r);
          setDialogOpen(true);
        }}
      />
      {canManage && (
        <WindMitigationFormDialog
          communityId={communityId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </>
  );
}

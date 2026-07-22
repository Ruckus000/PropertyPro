'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { useTransparencySettings, useUpdateTransparencySettings } from '@/hooks/use-transparency';
import { buildComplianceSummary } from '@/lib/utils/compliance-calculator';
import { buildCommunityUrl } from '@/lib/utils/community-url';

interface FoundingAhaPanelProps {
  communityId: number;
  communitySlug: string;
  communityName: string;
}

export function FoundingAhaPanel({
  communityId,
  communitySlug,
  communityName,
}: FoundingAhaPanelProps) {
  const {
    data: items = [],
    isLoading: checklistLoading,
    isError: checklistError,
    refetch: refetchChecklist,
  } = useComplianceChecklist(communityId);
  const summary = useMemo(() => buildComplianceSummary(items), [items]);
  const settingsQuery = useTransparencySettings(communityId);
  const updateSettings = useUpdateTransparencySettings(communityId);
  const [acknowledged, setAcknowledged] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostHomeUrl = buildCommunityUrl(communitySlug, '/');
  const transparencyHostUrl = buildCommunityUrl(communitySlug, '/transparency');
  const transparencyEnabled = settingsQuery.data?.enabled ?? false;

  const firstActionItem = items.find(
    (item) => item.status !== 'satisfied' && item.status !== 'not_applicable',
  );

  function handleEnableTransparency() {
    setError(null);
    updateSettings.mutate(
      { enabled: true, acknowledged: true },
      {
        onSuccess: () => setSuccess(true),
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : 'Failed to enable transparency');
        },
      },
    );
  }

  const readinessPct = summary.readiness.percentage;
  const saving = updateSettings.isPending;

  return (
    <section
      aria-label={`Getting started with ${communityName}`}
      className="rounded-md border border-edge bg-surface-card shadow-sm"
    >
      <div className="border-b border-edge px-5 py-4">
        <h2 className="text-lg font-semibold text-content">Get your community live</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Build compliance readiness, then share your public transparency page — all in one session.
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <Card className="border-edge bg-surface-page">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Compliance readiness</CardTitle>
            <CardDescription>
              {checklistLoading
                ? 'Loading checklist...'
                : checklistError
                  ? "Couldn't load compliance status"
                  : `${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} records on file`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <p className="text-4xl font-semibold tabular-nums text-content">
                {checklistLoading || checklistError ? '—' : `${readinessPct}%`}
              </p>
              <p className="pb-1 text-sm text-content-secondary">ready</p>
            </div>
            {/* B3: error, action-needed, complete, and genuinely-empty are now
                distinct — an errored query no longer masquerades as "all on file". */}
            {checklistError ? (
              <div className="space-y-2">
                <p className="text-sm text-status-danger">
                  We couldn&apos;t load your compliance status.
                </p>
                <button
                  type="button"
                  onClick={() => refetchChecklist()}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content transition-colors hover:bg-surface-muted"
                >
                  Retry
                </button>
              </div>
            ) : firstActionItem ? (
              <div className="space-y-2">
                <p className="text-sm text-content-secondary">
                  Next: link or upload <span className="font-medium text-content">{firstActionItem.title}</span>
                </p>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content transition-colors hover:bg-surface-muted"
                  href={`/communities/${communityId}/compliance`}
                >
                  Update compliance records
                </Link>
              </div>
            ) : items.length > 0 ? (
              <p className="text-sm text-status-success">All applicable records are on file.</p>
            ) : (
              <p className="text-sm text-content-secondary">No compliance items yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-edge bg-surface-page">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Public transparency</CardTitle>
            <CardDescription>
              {transparencyEnabled
                ? 'Your transparency page is live on your community host.'
                : 'One click publishes your compliance transparency page.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger">
                {error}
              </p>
            ) : null}

            {success || transparencyEnabled ? (
              <div className="space-y-3 rounded-md border border-status-success-border bg-status-success-bg p-4">
                <p className="text-sm font-medium text-status-success">
                  Your community is live at your public host URL.
                </p>
                <div className="flex flex-col gap-2 text-sm">
                  <a
                    className="font-medium text-content-link underline"
                    href={hostHomeUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {hostHomeUrl}
                  </a>
                  <a
                    className="font-medium text-content-link underline"
                    href={transparencyHostUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {transparencyHostUrl}
                  </a>
                </div>
              </div>
            ) : (
              <>
                <label className="flex items-start gap-3 rounded-md border border-edge p-3">
                  <input
                    aria-label="Acknowledge transparency page scope"
                    checked={acknowledged}
                    className="mt-1 h-5 w-5 rounded border-edge-strong"
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm text-content-secondary">
                    I understand this page displays factual compliance data tracked in PropertyPro. It
                    is not legal certification, and tracked items are publicly visible.
                  </span>
                </label>
                <Button disabled={!acknowledged || saving || settingsQuery.isLoading} onClick={handleEnableTransparency}>
                  {saving ? 'Publishing...' : 'Publish transparency page'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

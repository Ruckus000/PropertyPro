'use client';

import * as React from 'react';
import { Download, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useDeleteInsurancePolicy,
  useInsurancePolicies,
} from '@/hooks/use-insurance';
import {
  INSURANCE_SUMMARY_DISCLAIMER,
  INSURANCE_POLICY_EXPIRED_BANNER,
} from '@/lib/constants/insurance-disclaimers';
import {
  INSURANCE_POLICY_TYPE_LABELS,
  type InsurancePolicyRecord,
} from './types';
import { InsurancePolicyFormDialog } from './insurance-policy-form-dialog';
import { CertificateRequestDialog } from './certificate-request-dialog';

interface Props {
  communityId: number;
  canManage: boolean;
  /** The member's own unit, to prefill the certificate request where known. */
  ownUnitLabel?: string;
}

function formatIsoDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function expiryBadge(band: InsurancePolicyRecord['expiryBand'], days: number) {
  switch (band) {
    case 'expired':
      return { status: 'overdue', label: 'Expired' };
    case '30_days':
    case '60_days':
      return { status: 'due_soon', label: `Renews in ${days} days` };
    case 'none':
      return { status: 'compliant', label: 'Active' };
  }
}

function PolicyCard({
  policy,
  communityId,
  canManage,
  ownUnitLabel,
  onEdit,
}: {
  policy: InsurancePolicyRecord;
  communityId: number;
  canManage: boolean;
  ownUnitLabel?: string;
  onEdit: (p: InsurancePolicyRecord) => void;
}) {
  const deletePolicy = useDeleteInsurancePolicy(communityId);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const badge = expiryBadge(policy.expiryBand, policy.daysUntilExpiry);
  const expired = policy.expiryBand === 'expired';

  return (
    <Card>
      {expired && (
        <div className="px-6 pt-6">
          <AlertBanner status="danger" title={INSURANCE_POLICY_EXPIRED_BANNER(formatIsoDate(policy.expiresAt))} />
        </div>
      )}
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {INSURANCE_POLICY_TYPE_LABELS[policy.policyType]} — {policy.carrierName}
          </CardTitle>
          <p className="text-sm text-content-tertiary">
            Effective {formatIsoDate(policy.effectiveAt)} · Expires {formatIsoDate(policy.expiresAt)}
            {policy.policyNumber ? ` · Policy ${policy.policyNumber}` : ''}
          </p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} subtle />
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {policy.coverageSummary && (
            <div>
              <dt className="text-content-tertiary">Coverage</dt>
              <dd className="whitespace-pre-wrap text-content">{policy.coverageSummary}</dd>
            </div>
          )}
          {policy.deductibleSummary && (
            <div>
              <dt className="text-content-tertiary">Deductibles</dt>
              <dd className="whitespace-pre-wrap text-content">{policy.deductibleSummary}</dd>
            </div>
          )}
          {(policy.agentName || policy.agentEmail || policy.agentPhone) && (
            <div className="sm:col-span-2">
              <dt className="text-content-tertiary">Agent of record</dt>
              <dd className="text-content">
                {[policy.agentName, policy.agentEmail, policy.agentPhone].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap gap-2">
          {policy.documentId != null && (
            <Button asChild size="sm" variant="outline">
              <a href={`/api/v1/documents/${policy.documentId}/download?communityId=${communityId}&attachment=true`}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download Policy
              </a>
            </Button>
          )}
          <Button size="sm" onClick={() => setRequestOpen(true)} disabled={!policy.agentEmail}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Request a Certificate for My Lender
          </Button>

          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onEdit(policy)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deletePolicy.isPending}
                onClick={() => {
                  if (window.confirm('Remove this policy summary? Owners will no longer see it.')) {
                    deletePolicy.mutate(policy.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </>
          )}
        </div>
        {!policy.agentEmail && (
          <p className="text-xs text-content-tertiary">
            Add the agent’s email to this policy to enable certificate requests.
          </p>
        )}
      </CardContent>

      <CertificateRequestDialog
        communityId={communityId}
        policy={policy}
        open={requestOpen}
        onOpenChange={setRequestOpen}
        defaultUnitLabel={ownUnitLabel}
      />
    </Card>
  );
}

export function InsuranceSummarySection({ communityId, canManage, ownUnitLabel }: Props) {
  const { data: policies, isLoading, isError, refetch } = useInsurancePolicies({ communityId });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InsurancePolicyRecord | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: InsurancePolicyRecord) => {
    setEditing(p);
    setDialogOpen(true);
  };

  return (
    <section className="space-y-4" aria-labelledby="insurance-summary-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="insurance-summary-heading" className="text-xl font-semibold text-content">
            Master Policy
          </h2>
          <p className="max-w-2xl text-sm text-content-tertiary">{INSURANCE_SUMMARY_DISCLAIMER}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Policy
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {isError && (
        <AlertBanner
          status="danger"
          title="We couldn't load the insurance summary"
          description="Please try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && policies && policies.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              preset={canManage ? 'insurance_policy_empty_admin' : 'insurance_policy_empty_resident'}
              action={
                canManage ? (
                  <Button onClick={openCreate} size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Policy
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && policies && policies.length > 0 && (
        <div className="space-y-3">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              communityId={communityId}
              canManage={canManage}
              ownUnitLabel={ownUnitLabel}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {canManage && (
        <InsurancePolicyFormDialog
          communityId={communityId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </section>
  );
}

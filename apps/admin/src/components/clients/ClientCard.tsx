import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Badge, type BadgeVariant } from '@propertypro/ui';
import { COMMUNITY_TYPE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/constants/community-labels';
import type { ClientRow } from '@/lib/server/clients';

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'neutral',
};

interface ClientCardProps {
  client: ClientRow;
}

/** Design's client card: name, location · type, status badge, compliance bar, plan · members footer, and a rootless/dispute warning line. */
export function ClientCard({ client }: ClientCardProps) {
  const type = COMMUNITY_TYPE_LABELS[client.community_type] ?? COMMUNITY_TYPE_LABELS.condo_718!;
  const statusEntry = client.subscription_status
    ? SUBSCRIPTION_STATUS_LABELS[client.subscription_status]
    : undefined;
  const statusVariant = client.subscription_status
    ? (STATUS_BADGE_VARIANT[client.subscription_status] ?? 'neutral')
    : 'neutral';
  const score = client.complianceScore;
  const planLabel = client.subscription_plan
    ? client.subscription_plan.replace(/_/g, ' ')
    : '—';
  const location = [client.city, client.state].filter(Boolean).join(', ');

  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-card p-5 shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-content" title={client.name}>
            {client.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-content-tertiary">
            {location || '—'} · {type.label}
          </p>
        </div>
        {statusEntry ? (
          <Badge variant={statusVariant} size="sm" className="shrink-0">
            {statusEntry.label}
          </Badge>
        ) : (
          <span className="shrink-0 text-xs text-content-disabled">—</span>
        )}
      </div>

      {score !== null && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-surface-muted">
            <div
              className={`h-1.5 rounded-full ${score >= 70 ? 'bg-status-success' : 'bg-status-danger'}`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
          <p className="text-xs text-content-tertiary">{score}% compliant</p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-edge-subtle pt-3 text-xs text-content-tertiary">
        <span className="capitalize">{planLabel}</span>
        <span>
          {client.memberCount} {client.memberCount === 1 ? 'member' : 'members'}
        </span>
      </div>

      {(client.rootless || client.disputeOpen) && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-status-warning">
          <AlertTriangle size={12} aria-hidden="true" />
          {client.disputeOpen ? 'Root claim disputed' : 'No root manager'}
        </p>
      )}
    </Link>
  );
}

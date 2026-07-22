'use client';

import { StatusBadge, type StatusKey } from '@propertypro/ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { TransparencyDocumentGroup, TransparencyDocumentStatus } from '@/lib/services/transparency-service';

function mapStatus(status: TransparencyDocumentStatus): StatusKey {
  switch (status) {
    case 'posted':
      return 'completed';
    case 'not_posted':
      return 'overdue';
    case 'not_required':
    default:
      return 'neutral';
  }
}

function statusLabel(status: TransparencyDocumentStatus): string {
  switch (status) {
    case 'posted':
      return 'Posted';
    case 'not_posted':
      return 'Not yet posted';
    case 'not_required':
    default:
      return 'Not required';
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  groups: TransparencyDocumentGroup[];
}

export function DocumentChecklistSection({ groups }: Props) {
  if (groups.length === 0) {
    return (
      <Card className="border-edge bg-surface-card">
        <CardContent>
          <p className="text-sm text-content-secondary">
            No compliance checklist data has been generated yet for this community.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.category} className="border-edge bg-surface-card">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col">
              <CardTitle>{group.label}</CardTitle>
              <CardDescription>{group.items.length} tracked item{group.items.length === 1 ? '' : 's'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <article
                key={item.templateKey}
                className="rounded-md border border-edge p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-content">{item.title}</h3>
                    <p className="text-xs text-content-tertiary">Statute: {item.statuteReference}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium text-content-secondary">
                    <StatusBadge status={mapStatus(item.status)} showLabel={false} />
                    <span>{statusLabel(item.status)}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-content-tertiary">Last posted: {formatDate(item.postedAt)}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

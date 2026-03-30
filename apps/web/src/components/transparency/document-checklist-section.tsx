'use client';

import { Card, StatusBadge, type StatusKey } from '@propertypro/ui';
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
        <Card.Body>
          <p className="text-sm text-content-secondary">
            No compliance checklist data has been generated yet for this community.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.category} className="border-edge bg-surface-card">
          <Card.Header>
            <div className="flex flex-col">
              <Card.Title>{group.label}</Card.Title>
              <Card.Subtitle>{group.items.length} tracked item{group.items.length === 1 ? '' : 's'}</Card.Subtitle>
            </div>
          </Card.Header>
          <Card.Body className="space-y-3">
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
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}

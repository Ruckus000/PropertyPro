'use client';

import { Card, StatusBadge } from '@propertypro/ui';

interface Props {
  passwordProtected: boolean;
  individualCredentials: boolean;
  publicNoticesPage: boolean;
}

function renderBooleanItem(label: string, value: boolean) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-edge p-3">
      <span className="text-sm font-medium text-content">{label}</span>
      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <StatusBadge status={value ? 'completed' : 'neutral'} showLabel={false} />
        <span>{value ? 'Active' : 'Not available'}</span>
      </div>
    </li>
  );
}

export function PortalStatusSection({
  passwordProtected,
  individualCredentials,
  publicNoticesPage,
}: Props) {
  return (
    <Card className="border-edge bg-surface-card">
      <Card.Header>
        <div className="flex flex-col">
          <Card.Title>Portal Status</Card.Title>
          <Card.Subtitle>Platform-level access controls</Card.Subtitle>
        </div>
      </Card.Header>
      <Card.Body>
        <ul className="space-y-2">
          {renderBooleanItem('Password-protected portal', passwordProtected)}
          {renderBooleanItem('Individual owner credentials', individualCredentials)}
          {renderBooleanItem('Public notices page', publicNoticesPage)}
        </ul>
      </Card.Body>
    </Card>
  );
}

'use client';

import { StatusBadge } from '@propertypro/ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

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
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex flex-col">
          <CardTitle>Portal Status</CardTitle>
          <CardDescription>Platform-level access controls</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {renderBooleanItem('Password-protected portal', passwordProtected)}
          {renderBooleanItem('Individual owner credentials', individualCredentials)}
          {renderBooleanItem('Public notices page', publicNoticesPage)}
        </ul>
      </CardContent>
    </Card>
  );
}

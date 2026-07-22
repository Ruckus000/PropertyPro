'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { TransparencyMinutesMonth } from '@/lib/services/transparency-service';

interface Props {
  months: TransparencyMinutesMonth[];
  monthsWithMinutes: number;
}

function cellClasses(status: TransparencyMinutesMonth['status']): string {
  switch (status) {
    case 'minutes_posted':
      return 'border-status-success bg-status-success-bg text-status-success';
    case 'minutes_missing':
      return 'border-status-danger bg-status-danger-bg text-status-danger';
    case 'not_expected':
    default:
      return 'border-edge-strong bg-surface-muted text-content-tertiary';
  }
}

function statusText(status: TransparencyMinutesMonth['status']): string {
  switch (status) {
    case 'minutes_posted':
      return 'Posted';
    case 'minutes_missing':
      return 'Missing';
    case 'not_expected':
    default:
      return 'N/A';
  }
}

export function MinutesAvailabilityGrid({ months, monthsWithMinutes }: Props) {
  return (
    <Card className="border-edge bg-surface-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex flex-col">
          <CardTitle>Minutes Availability</CardTitle>
          <CardDescription>Rolling 12-month view</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-content-secondary">
          {monthsWithMinutes} of {months.length} months have posted minutes.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {months.map((month) => (
            <div key={month.month} className="space-y-1 text-center">
              <div className={`rounded-md border p-3 text-xs font-semibold ${cellClasses(month.status)}`}>
                {statusText(month.status)}
              </div>
              <p className="text-xs text-content-tertiary">{month.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

import { Card } from '@propertypro/ui';
import type { TransparencyMinutesMonth } from '@/lib/services/transparency-service';

interface Props {
  months: TransparencyMinutesMonth[];
  monthsWithMinutes: number;
}

function cellClasses(status: TransparencyMinutesMonth['status']): string {
  switch (status) {
    case 'minutes_posted':
      return 'border-green-700 bg-green-100 text-green-900';
    case 'minutes_missing':
      return 'border-red-700 bg-red-100 text-red-900';
    case 'not_expected':
    default:
      return 'border-gray-300 bg-gray-100 text-gray-500';
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
    <Card className="border-gray-200 bg-white">
      <Card.Header>
        <div className="flex flex-col">
          <Card.Title>Minutes Availability</Card.Title>
          <Card.Subtitle>Rolling 12-month view</Card.Subtitle>
        </div>
      </Card.Header>
      <Card.Body>
        <p className="mb-4 text-sm text-gray-600">
          {monthsWithMinutes} of {months.length} months have posted minutes.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {months.map((month) => (
            <div key={month.month} className="space-y-1 text-center">
              <div className={`rounded-md border p-3 text-xs font-semibold ${cellClasses(month.status)}`}>
                {statusText(month.status)}
              </div>
              <p className="text-xs text-gray-500">{month.label}</p>
            </div>
          ))}
        </div>
      </Card.Body>
    </Card>
  );
}

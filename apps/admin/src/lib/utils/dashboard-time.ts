import { differenceInDays, formatDistanceStrict } from 'date-fns';

export function formatRelativeTime(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  const days = differenceInDays(now, date);

  if (days >= 30) {
    return date.toLocaleDateString();
  }

  const distance = formatDistanceStrict(date, now, { roundingMethod: 'floor' });
  const [value, unit] = distance.split(' ');

  if (!value || !unit || unit.startsWith('second')) {
    return 'just now';
  }

  if (unit.startsWith('minute')) {
    return `${value}m ago`;
  }

  if (unit.startsWith('hour')) {
    return `${value}h ago`;
  }

  return `${days}d ago`;
}

export function daysOld(dateStr: string, now: Date = new Date()): number {
  return differenceInDays(now, new Date(dateStr));
}

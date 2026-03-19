import { addDays } from 'date-fns';
import { BadRequestError } from '@/lib/api/errors';
import { resolveTimezone } from '@/lib/utils/timezone';

const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readInt(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return parsed;
}

function parseWallClockValue(value: string): DateParts {
  const match = WALL_CLOCK_PATTERN.exec(value);
  if (!match) {
    throw new BadRequestError('Invalid datetime-local value');
  }

  return {
    year: readInt(match[1], 'year'),
    month: readInt(match[2], 'month'),
    day: readInt(match[3], 'day'),
    hour: readInt(match[4], 'hour'),
    minute: readInt(match[5], 'minute'),
    second: 0,
  };
}

function parseDateOnlyValue(value: string): DateParts {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new BadRequestError('Invalid date value');
  }

  return {
    year: readInt(match[1], 'year'),
    month: readInt(match[2], 'month'),
    day: readInt(match[3], 'day'),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function partsToUtcMillis(parts: DateParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
}

function getZonedParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: readInt(values.year, 'year'),
    month: readInt(values.month, 'month'),
    day: readInt(values.day, 'day'),
    hour: readInt(values.hour, 'hour'),
    minute: readInt(values.minute, 'minute'),
    second: readInt(values.second, 'second'),
  };
}

function zonedDateTimeToUtc(parts: DateParts, timeZone: string): Date {
  const desiredAsUtc = partsToUtcMillis(parts);
  let guess = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getZonedParts(new Date(guess), timeZone);
    const observedAsUtc = partsToUtcMillis(observed);
    const offset = observedAsUtc - guess;
    const nextGuess = desiredAsUtc - offset;

    if (nextGuess === guess) {
      break;
    }

    guess = nextGuess;
  }

  return new Date(guess);
}

function formatWallClock(parts: DateParts): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${parts.year}-${month}-${day}T${hour}:${minute}`;
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function utcDateToWallClockValue(date: Date, timeZone: string): string {
  return formatWallClock(getZonedParts(date, resolveTimezone(timeZone)));
}

export function wallClockValueToUtcDate(value: string, timeZone: string): Date {
  return zonedDateTimeToUtc(parseWallClockValue(value), resolveTimezone(timeZone));
}

export function wallClockValueToUtcIso(value: string, timeZone: string): string {
  return wallClockValueToUtcDate(value, timeZone).toISOString();
}

export function dateOnlyToUtcStart(value: string, timeZone: string): Date {
  return zonedDateTimeToUtc(parseDateOnlyValue(value), resolveTimezone(timeZone));
}

export function nextDateOnly(value: string): string {
  const parts = parseDateOnlyValue(value);
  const current = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return formatDateOnly(addDays(current, 1));
}

export function dateOnlyRangeToUtcBounds(
  start: string,
  end: string,
  timeZone: string,
): { startUtc: Date; endUtcExclusive: Date } {
  return {
    startUtc: dateOnlyToUtcStart(start, timeZone),
    endUtcExclusive: dateOnlyToUtcStart(nextDateOnly(end), timeZone),
  };
}

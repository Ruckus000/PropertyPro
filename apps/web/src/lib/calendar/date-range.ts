import { differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';
import { BadRequestError } from '@/lib/api/errors';
import { dateOnlyRangeToUtcBounds } from '@/lib/utils/zoned-datetime';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, 'Must use YYYY-MM-DD format')
  .refine((value) => {
    const parts = value.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return false;
    }

    const [year, month, day] = parts as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      Number.isFinite(date.getTime())
      && date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day
    );
  }, 'Must be a valid calendar date');

const requiredRangeSchema = z
  .object({
    start: dateOnlySchema,
    end: dateOnlySchema,
  })
  .superRefine((value, ctx) => {
    const startDate = new Date(`${value.start}T00:00:00.000Z`);
    const endDate = new Date(`${value.end}T00:00:00.000Z`);

    if (endDate.getTime() < startDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'end must be on or after start',
      });
      return;
    }

    if (differenceInCalendarDays(endDate, startDate) > 366) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'Date range cannot exceed 366 days',
      });
    }
  });

export interface ParsedCalendarDateRange {
  start: string;
  end: string;
  startUtc: Date;
  endUtcExclusive: Date;
}

function toBadRequest(error: z.ZodError): BadRequestError {
  return new BadRequestError(
    error.issues[0]?.message ?? 'Invalid date range',
  );
}

export function parseRequiredCalendarDateRange(
  searchParams: URLSearchParams,
  timeZone: string,
): ParsedCalendarDateRange {
  const parsed = requiredRangeSchema.safeParse({
    start: searchParams.get('start'),
    end: searchParams.get('end'),
  });

  if (!parsed.success) {
    throw toBadRequest(parsed.error);
  }

  return {
    ...parsed.data,
    ...dateOnlyRangeToUtcBounds(parsed.data.start, parsed.data.end, timeZone),
  };
}

export function parseOptionalCalendarDateRange(
  searchParams: URLSearchParams,
  timeZone: string,
): ParsedCalendarDateRange | null {
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start && !end) {
    return null;
  }

  if (!start || !end) {
    throw new BadRequestError('start and end must be provided together');
  }

  return parseRequiredCalendarDateRange(searchParams, timeZone);
}

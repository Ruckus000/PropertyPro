/**
 * The "received or created on" date a manager gives a record (audit
 * 2026-11-05, H-2). The 30-day posting clock of §718.111(12)(g)1. runs from it.
 *
 * Sent as an ISO instant. The form turns a calendar date into the LAST moment
 * of that day in the viewer's clock, so a posting made on day 30 is never
 * called late, and "today" into the current moment.
 */
import { z } from 'zod';

/** End of "today" anywhere on Earth is at most ~26 hours ahead of UTC now. */
const FUTURE_TOLERANCE_MS = 26 * 60 * 60 * 1000;
/** Older than any record an association website is asked to carry. */
const EARLIEST = Date.UTC(1950, 0, 1);

export const receivedAtSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Date.parse(value) <= Date.now() + FUTURE_TOLERANCE_MS, {
    message: 'The received date cannot be in the future',
  })
  .refine((value) => Date.parse(value) >= EARLIEST, {
    message: 'The received date is too far in the past',
  });

const MS_PER_DAY = 86_400_000;

/** Days of grace after subscription cancellation for paid GA communities. */
export const PAID_GRACE_DAYS = 7 as const;

/**
 * Days before the grace expiry that the final warning email is sent.
 * Reminder fires at canceledAt + (PAID_GRACE_DAYS - GRACE_EXPIRY_WARNING_OFFSET_DAYS).
 */
export const GRACE_EXPIRY_WARNING_OFFSET_DAYS = 2 as const;

/** End of the paid grace window after subscription cancellation. */
export function paidGraceEndsAt(canceledAt: Date): Date {
  return new Date(canceledAt.getTime() + PAID_GRACE_DAYS * MS_PER_DAY);
}

/** Whether `now` is still inside the paid grace window (exclusive at grace end). */
export function isWithinPaidGrace(canceledAt: Date, now: Date = new Date()): boolean {
  return now.getTime() < paidGraceEndsAt(canceledAt).getTime();
}

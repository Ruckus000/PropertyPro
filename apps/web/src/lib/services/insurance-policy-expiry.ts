/**
 * Master-policy expiry banding — powers the expired-policy banner and the
 * (deferred) renewal-alert cron. Pure date math, no DB.
 *
 * Master policies renew annually, so the alert bands are tighter than the
 * wind-mit form: 60/30 days then expired.
 */
import { differenceInCalendarDays, parseISO } from 'date-fns';

export type InsurancePolicyExpiryBand = '60_days' | '30_days' | 'expired' | 'none';

export function classifyInsurancePolicyExpiry(
  expiresAtStr: string,
  referenceDate: Date = new Date(),
): { daysUntilExpiry: number; band: InsurancePolicyExpiryBand } {
  const daysUntilExpiry = differenceInCalendarDays(parseISO(expiresAtStr), referenceDate);
  if (daysUntilExpiry < 0) return { daysUntilExpiry, band: 'expired' };
  if (daysUntilExpiry <= 30) return { daysUntilExpiry, band: '30_days' };
  if (daysUntilExpiry <= 60) return { daysUntilExpiry, band: '60_days' };
  return { daysUntilExpiry, band: 'none' };
}

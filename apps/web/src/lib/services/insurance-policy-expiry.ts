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

/**
 * Alertable bands, narrowest → widest. Every band earns one email (unlike the
 * wind-mit ladder, which skips its middle band): a master policy renews yearly,
 * so a 60-day heads-up, a 30-day nudge, and an expired notice is the right
 * cadence, not noise. Mirrors WIND_MITIGATION_ALERT_BANDS_ORDERED.
 */
export const INSURANCE_POLICY_ALERT_BANDS_ORDERED: readonly InsurancePolicyExpiryBand[] = [
  'expired',
  '30_days',
  '60_days',
] as const;

/**
 * True when `band` is an alertable band the community has not been emailed about
 * yet for this policy. Bands only ever narrow as expiry approaches, so
 * "already alerted" is decided by rank, not equality: once "expires in 60 days"
 * has gone out, a later 60_days evaluation must not re-fire, but the 30_days and
 * expired transitions still outrank it and must. See the wind-mit twin for the
 * fuller rationale.
 */
export function shouldSendInsurancePolicyAlert(
  band: InsurancePolicyExpiryBand,
  lastAlertBand: string | null,
): boolean {
  const rank = (b: string | null): number => {
    const idx = INSURANCE_POLICY_ALERT_BANDS_ORDERED.indexOf(b as InsurancePolicyExpiryBand);
    // Unknown/null (never alerted) ranks below every alertable band.
    return idx === -1 ? INSURANCE_POLICY_ALERT_BANDS_ORDERED.length : idx;
  };

  if (!INSURANCE_POLICY_ALERT_BANDS_ORDERED.includes(band)) return false;
  return rank(band) < rank(lastAlertBand);
}

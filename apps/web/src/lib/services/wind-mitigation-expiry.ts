/**
 * Wind-mitigation expiry banding.
 *
 * Wind-mitigation forms are valid ~5 years, and re-inspection has a long lead
 * time (scheduling an inspector, then handing the new form to every owner's
 * insurer at their next renewal) — so the early band is 180 days, unlike the
 * 30/60/90 cadence used for vendor contracts (contract-renewal-alerts.ts).
 *
 * Pure date math, no DB access: shared by the API/UI (badge rendering) and the
 * daily alert cron (band-transition detection). Uses date-fns for UTC-safe
 * calendar arithmetic, matching the contract-renewal-alerts convention.
 */
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { EscalationTier } from '@propertypro/ui/tokens';

/** Ordered widest → narrowest. Mirrors WIND_MITIGATION_ALERT_BANDS in the schema. */
export type WindMitigationExpiryBand = '180_days' | '90_days' | '30_days' | 'expired' | 'none';

export interface WindMitigationExpiryStatus {
  daysUntilExpiry: number;
  band: WindMitigationExpiryBand;
}

/**
 * Classify a report's expiry band.
 *
 * @param expiresAtStr - ISO date string (YYYY-MM-DD)
 * @param referenceDate - date to compute against (defaults to now)
 */
export function classifyWindMitigationExpiry(
  expiresAtStr: string,
  referenceDate: Date = new Date(),
): WindMitigationExpiryStatus {
  const expiresAt = parseISO(expiresAtStr);
  const daysUntilExpiry = differenceInCalendarDays(expiresAt, referenceDate);

  if (daysUntilExpiry < 0) return { daysUntilExpiry, band: 'expired' };
  if (daysUntilExpiry <= 30) return { daysUntilExpiry, band: '30_days' };
  if (daysUntilExpiry <= 90) return { daysUntilExpiry, band: '90_days' };
  if (daysUntilExpiry <= 180) return { daysUntilExpiry, band: '180_days' };

  return { daysUntilExpiry, band: 'none' };
}

/**
 * Map an expiry band onto the platform's compliance escalation tiers, so the
 * insurance hub speaks the same visual language as the compliance dashboard
 * (calm → aware → urgent → critical).
 */
export function windMitigationEscalationTier(band: WindMitigationExpiryBand): EscalationTier {
  switch (band) {
    case 'expired':
      return 'critical';
    case '30_days':
    case '90_days':
      return 'urgent';
    case '180_days':
      return 'aware';
    case 'none':
      return 'calm';
  }
}

/**
 * Bands that warrant a board alert, narrowest → widest. `90_days` is
 * deliberately absent: it renders as `urgent` in the UI but does not earn its
 * own email. Three lifetime emails per 5-year form (180d heads-up, 30d nudge,
 * expired) is the ceiling before this becomes noise a board tunes out.
 */
export const WIND_MITIGATION_ALERT_BANDS_ORDERED: readonly WindMitigationExpiryBand[] = [
  'expired',
  '30_days',
  '180_days',
] as const;

/**
 * True when `band` is an alertable band the community has not been emailed
 * about yet for this report.
 *
 * Bands only ever narrow as a date approaches, so "already alerted" is decided
 * by rank, not equality: once a board has been told "expires in 30 days", a
 * later 30_days evaluation must not re-fire, and an `expired` transition must
 * still fire because it outranks it.
 */
export function shouldSendWindMitigationAlert(
  band: WindMitigationExpiryBand,
  lastAlertBand: string | null,
): boolean {
  const rank = (b: string | null): number => {
    const idx = WIND_MITIGATION_ALERT_BANDS_ORDERED.indexOf(b as WindMitigationExpiryBand);
    // Unknown/null (never alerted) ranks below every alertable band.
    return idx === -1 ? WIND_MITIGATION_ALERT_BANDS_ORDERED.length : idx;
  };

  if (!WIND_MITIGATION_ALERT_BANDS_ORDERED.includes(band)) return false;
  return rank(band) < rank(lastAlertBand);
}

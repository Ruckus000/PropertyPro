/**
 * Contract Renewal Alerts — computes expiration windows for contracts (P3-52).
 *
 * Classifies contracts into 30/60/90-day expiration alert buckets
 * based on their endDate. Uses date-fns for UTC-safe date arithmetic.
 */
import { differenceInCalendarDays, parseISO } from 'date-fns';

export type ExpirationWindow = '30_days' | '60_days' | '90_days' | 'expired' | 'none';

export interface ContractExpirationAlert {
  contractId: number;
  title: string;
  vendorName: string;
  endDate: string;
  daysUntilExpiry: number;
  window: ExpirationWindow;
}

interface ContractForAlert {
  id: number;
  title: string;
  vendorName: string;
  endDate: string | null;
  status: string;
}

/**
 * Classify a contract's expiration window.
 *
 * @param endDateStr - ISO date string (YYYY-MM-DD) or null for open-ended contracts
 * @param referenceDate - The date to compute against (defaults to now)
 * @returns The expiration window classification
 */
export function classifyExpirationWindow(
  endDateStr: string | null,
  referenceDate: Date = new Date(),
): { daysUntilExpiry: number; window: ExpirationWindow } {
  if (!endDateStr) {
    return { daysUntilExpiry: Infinity, window: 'none' };
  }

  const endDate = parseISO(endDateStr);
  const daysUntilExpiry = differenceInCalendarDays(endDate, referenceDate);

  if (daysUntilExpiry < 0) {
    return { daysUntilExpiry, window: 'expired' };
  }
  if (daysUntilExpiry <= 30) {
    return { daysUntilExpiry, window: '30_days' };
  }
  if (daysUntilExpiry <= 60) {
    return { daysUntilExpiry, window: '60_days' };
  }
  if (daysUntilExpiry <= 90) {
    return { daysUntilExpiry, window: '90_days' };
  }

  return { daysUntilExpiry, window: 'none' };
}

/**
 * Get expiration alerts for a set of contracts.
 *
 * Only returns contracts that fall within an alert window (30/60/90 days or expired).
 * Excludes open-ended contracts (no endDate) and already-terminated contracts.
 */
export function getContractExpirationAlerts(
  contracts: ContractForAlert[],
  referenceDate: Date = new Date(),
): ContractExpirationAlert[] {
  return contracts
    .filter((c) => c.endDate !== null && c.status !== 'terminated')
    .map((c) => {
      const { daysUntilExpiry, window } = classifyExpirationWindow(c.endDate, referenceDate);
      return {
        contractId: c.id,
        title: c.title,
        vendorName: c.vendorName,
        endDate: c.endDate as string,
        daysUntilExpiry,
        window,
      };
    })
    .filter((alert) => alert.window !== 'none');
}

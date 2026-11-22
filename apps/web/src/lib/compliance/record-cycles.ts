/**
 * Which checklist rows renew every year, and whose clock is the statute's.
 *
 * Keyed by template key, like `MEETING_NOTICE_TEMPLATE_KEYS`: the rows already
 * exist in every community, so nothing is stored and no row data changes.
 */
import type { ClockBasis } from '@/lib/utils/compliance-calculator';
import { MEETING_NOTICE_TEMPLATE_KEYS } from './meeting-notice-status';

/**
 * Records the association replaces every year: a new budget is adopted, a new
 * financial report is prepared, insurance renews. Last year's file does not
 * satisfy this year's item (audit 2026-11-05, H-2).
 */
export const YEARLY_RECORD_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  '718_budget',
  '718_financial_report',
  '718_insurance',
  '720_budget',
  '720_financial_report',
  '720_insurance',
]);

/**
 * Whether a row's clock is the statute's. §720.303(4)(b) has no general
 * 30-day posting deadline and no minutes-posting item, so on an HOA those
 * clocks are product defaults. HOA meeting notices and agendas are statutory
 * (§720.303(2), (4)(b)1.l–m).
 */
export function clockBasisFor(templateKey: string): ClockBasis {
  if (MEETING_NOTICE_TEMPLATE_KEYS.has(templateKey)) return 'statute';
  return templateKey.startsWith('720_') ? 'product_default' : 'statute';
}

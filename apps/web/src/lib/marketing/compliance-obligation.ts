/**
 * Marketing-only helper that maps an association's unit/parcel count to its
 * Florida website-compliance obligation. General information for the landing
 * page checker — NOT legal advice (see .claude/rules/florida-compliance.md).
 * Thresholds mirror the facts used elsewhere in the app: condos §718.111(12)(g)
 * (150+ already required, 25–149 by Jan 1 2026, under 25 exempt); HOAs
 * §720.303 (100+ parcels required, under 100 exempt).
 */
export type AssociationType = 'condo' | 'hoa';

export interface ObligationInput {
  type: AssociationType;
  count: number;
}

export type ObligationStatus = 'required-now' | 'required-2026' | 'exempt';

export interface ObligationResult {
  required: boolean;
  status: ObligationStatus;
  headline: string;
  detail: string;
  /** Hard deadline date, or null when already required / exempt. */
  deadline: string | null;
}

const JAN_2026 = 'January 1, 2026';

export function getComplianceObligation({
  type,
  count,
}: ObligationInput): ObligationResult {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count must be a positive integer');
  }

  if (type === 'condo') {
    if (count >= 150) {
      return {
        required: true,
        status: 'required-now',
        headline: 'Required now',
        detail:
          'Condominium associations of 150+ units are already required to maintain a compliant website with posted official records. Enforcement is active.',
        deadline: null,
      };
    }
    if (count >= 25) {
      return {
        required: true,
        status: 'required-2026',
        headline: 'Required by January 1, 2026',
        detail:
          'Condominium associations of 25–149 units must have a compliant website — document posting, meeting notices, and an owner portal — by January 1, 2026.',
        deadline: JAN_2026,
      };
    }
    return {
      required: false,
      status: 'exempt',
      headline: 'Not yet required',
      detail:
        'Condominium associations under 25 units are currently exempt, though voluntary compliance is recommended for transparency.',
      deadline: null,
    };
  }

  // HOA
  if (count >= 100) {
    return {
      required: true,
      status: 'required-now',
      headline: 'Required now',
      detail:
        'HOAs of 100+ parcels are required to maintain a website for official records and meeting notices, with the same posting requirements as condos.',
      deadline: null,
    };
  }
  return {
    required: false,
    status: 'exempt',
    headline: 'Not yet required',
    detail:
      'HOAs under 100 parcels are currently exempt, though voluntary compliance builds owner trust.',
    deadline: null,
  };
}

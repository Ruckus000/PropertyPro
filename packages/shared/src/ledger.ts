export const LEDGER_ENTRY_TYPES = [
  'assessment',
  'rent',
  'payment',
  'refund',
  'fine',
  'fee',
  'adjustment',
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_SOURCE_TYPES = [
  'assessment',
  'rent',
  'payment',
  'violation',
  'manual',
] as const;

export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

export interface LedgerMetadata {
  payableType?: 'assessment_line_item' | 'rent_obligation';
  payableId?: number;
  payableSourceType?: 'assessment' | 'rent';
  payableSourceId?: string;
  assessmentId?: number;
  assessmentLineItemId?: number;
  lineItemId?: number;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  violationId?: number;
  fineId?: number;
  refundReason?: string;
  originalEntryId?: number;
  notes?: string;
  convenienceFeeCents?: number;
  stripeFeeActualCents?: number;
  paymentMethod?: 'card' | 'us_bank_account';
  [key: string]: unknown;
}

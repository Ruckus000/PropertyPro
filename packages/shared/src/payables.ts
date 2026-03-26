export const PAYABLE_TYPES = [
  'assessment_line_item',
  'rent_obligation',
] as const;

export type PayableType = (typeof PAYABLE_TYPES)[number];

export const PAYABLE_SOURCE_TYPES = [
  'assessment',
  'rent',
] as const;

export type PayableSourceType = (typeof PAYABLE_SOURCE_TYPES)[number];

export interface PayableReference {
  payableType: PayableType;
  payableId: number;
  payableSourceType: PayableSourceType;
  payableSourceId: string;
  communityId: number;
  unitId: number;
}

export interface StripePayableMetadata {
  communityId: string;
  unitId: string;
  userId: string;
  baseAmountCents: string;
  convenienceFeeCents: string;
  payableType: PayableType;
  payableId: string;
  payableSourceType: PayableSourceType;
  payableSourceId: string;
  // Backward compatibility with existing assessment-only metadata consumers.
  lineItemId?: string;
  paymentMethod?: 'card' | 'us_bank_account';
}

import { z } from 'zod';

/**
 * Starter set of cancellation reasons. Subject to product approval
 * before being surfaced in cancel-flow UI.
 */
export const CANCELLATION_REASONS = [
  'price',
  'switched_provider',
  'shutting_down',
  'missing_features',
  'not_using',
  'other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const cancellationReasonSchema = z.enum(CANCELLATION_REASONS);

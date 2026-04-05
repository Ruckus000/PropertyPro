import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_REASONS,
  cancellationReasonSchema,
} from '../src/constants/cancellation-reasons';

describe('cancellation-reasons', () => {
  it('exports the expected starter set', () => {
    expect(CANCELLATION_REASONS).toEqual([
      'price',
      'switched_provider',
      'shutting_down',
      'missing_features',
      'not_using',
      'other',
    ]);
  });

  it('Zod schema accepts valid reasons', () => {
    for (const r of CANCELLATION_REASONS) {
      expect(cancellationReasonSchema.safeParse(r).success).toBe(true);
    }
  });

  it('Zod schema rejects unknown reasons', () => {
    expect(cancellationReasonSchema.safeParse('bogus').success).toBe(false);
    expect(cancellationReasonSchema.safeParse('').success).toBe(false);
  });
});

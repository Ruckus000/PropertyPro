import { describe, expect, it } from 'vitest';
import { cancellationReasonSchema } from '@propertypro/shared';

describe('cancellation reason validation', () => {
  it('rejects unknown reason', () => {
    expect(cancellationReasonSchema.safeParse('bogus').success).toBe(false);
  });
  it('accepts known reasons', () => {
    expect(cancellationReasonSchema.safeParse('price').success).toBe(true);
  });
});

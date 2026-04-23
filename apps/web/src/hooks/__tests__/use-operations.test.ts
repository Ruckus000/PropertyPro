import { describe, expect, it } from 'vitest';
import { parseWorkOrderStatus, WORK_ORDER_STATUSES } from '../use-operations';

describe('parseWorkOrderStatus', () => {
  it.each(WORK_ORDER_STATUSES)('accepts canonical value %s', (status) => {
    expect(parseWorkOrderStatus(status)).toBe(status);
  });

  it('returns undefined for undefined input', () => {
    expect(parseWorkOrderStatus(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseWorkOrderStatus('')).toBeUndefined();
  });

  it('returns undefined for maintenance-request statuses that are NOT work-order statuses', () => {
    // These are valid for maintenance requests but would be rejected by the
    // work-orders API. The parser must drop them rather than pass through.
    expect(parseWorkOrderStatus('submitted')).toBeUndefined();
    expect(parseWorkOrderStatus('new')).toBeUndefined();
    expect(parseWorkOrderStatus('triaged')).toBeUndefined();
  });

  it('returns undefined for wholly unknown strings', () => {
    expect(parseWorkOrderStatus('not-a-status')).toBeUndefined();
    expect(parseWorkOrderStatus('CREATED')).toBeUndefined(); // case-sensitive
  });
});

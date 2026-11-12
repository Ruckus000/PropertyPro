import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api/request-json';
import { retryUnlessRefused } from '@/lib/api/retry-unless-refused';

describe('retryUnlessRefused', () => {
  it('never retries a 4xx refusal', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(retryUnlessRefused(0, new ApiRequestError('x', { status }))).toBe(false);
    }
  });

  it('retries server errors and network failures up to three times', () => {
    const serverError = new ApiRequestError('x', { status: 500 });
    expect(retryUnlessRefused(0, serverError)).toBe(true);
    expect(retryUnlessRefused(2, serverError)).toBe(true);
    expect(retryUnlessRefused(3, serverError)).toBe(false);
    expect(retryUnlessRefused(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});

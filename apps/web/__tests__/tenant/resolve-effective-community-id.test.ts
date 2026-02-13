import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '../../src/lib/api/errors';
import { resolveEffectiveCommunityId } from '../../src/lib/api/tenant-context';

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/documents', {
    headers,
  });
}

describe('resolveEffectiveCommunityId', () => {
  it('uses explicit communityId when header is absent', () => {
    expect(resolveEffectiveCommunityId(request(), 42)).toBe(42);
  });

  it('uses tenant header communityId when explicit value is absent', () => {
    expect(
      resolveEffectiveCommunityId(
        request({
          'x-community-id': '77',
        }),
        null,
      ),
    ).toBe(77);
  });

  it('accepts matching header and explicit communityId', () => {
    expect(
      resolveEffectiveCommunityId(
        request({
          'x-community-id': '33',
        }),
        33,
      ),
    ).toBe(33);
  });

  it('throws NotFoundError on tenant header and payload mismatch', () => {
    expect(() =>
      resolveEffectiveCommunityId(
        request({
          'x-community-id': '55',
        }),
        12,
      ),
    ).toThrow(NotFoundError);
  });

  it('throws ValidationError when no community context is provided', () => {
    expect(() => resolveEffectiveCommunityId(request(), undefined)).toThrow(
      ValidationError,
    );
  });
});

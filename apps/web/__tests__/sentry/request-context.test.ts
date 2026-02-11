import { describe, expect, it } from 'vitest';
import { extractSentryRequestContext } from '../../src/lib/sentry/request-context';

describe('extractSentryRequestContext', () => {
  it('extracts request ID when present', () => {
    const headers = new Headers({ 'x-request-id': 'req-123' });

    const context = extractSentryRequestContext(headers);

    expect(context.requestId).toBe('req-123');
    expect(context.communityId).toBeUndefined();
    expect(context.userId).toBeUndefined();
  });

  it('returns empty request ID when missing', () => {
    const context = extractSentryRequestContext(new Headers());

    expect(context.requestId).toBe('');
  });

  it('extracts community ID from x-community-id', () => {
    const headers = new Headers({
      'x-request-id': 'req-123',
      'x-community-id': 'community_42',
    });

    const context = extractSentryRequestContext(headers);

    expect(context.communityId).toBe('community_42');
  });

  it('falls back to x-tenant-id for community ID', () => {
    const headers = new Headers({
      'x-request-id': 'req-123',
      'x-tenant-id': 'tenant_99',
    });

    const context = extractSentryRequestContext(headers);

    expect(context.communityId).toBe('tenant_99');
  });

  it('extracts user ID from x-user-id', () => {
    const headers = new Headers({
      'x-request-id': 'req-123',
      'x-user-id': 'user_abc',
    });

    const context = extractSentryRequestContext(headers);

    expect(context.userId).toBe('user_abc');
  });

  it('trims whitespace and treats blank values as missing', () => {
    const headers = new Headers({
      'x-request-id': '  req-123  ',
      'x-community-id': '   ',
      'x-user-id': ' user_1 ',
    });

    const context = extractSentryRequestContext(headers);

    expect(context.requestId).toBe('req-123');
    expect(context.communityId).toBeUndefined();
    expect(context.userId).toBe('user_1');
  });
});

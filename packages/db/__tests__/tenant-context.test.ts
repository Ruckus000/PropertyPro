import { describe, it, expect } from 'vitest';
import { TenantContextMissing } from '../src/errors/TenantContextMissing';

describe('TenantContextMissing', () => {
  it('has the correct error name', () => {
    const error = new TenantContextMissing();
    expect(error.name).toBe('TenantContextMissing');
  });

  it('has the correct message', () => {
    const error = new TenantContextMissing();
    expect(error.message).toBe(
      'Tenant context is required but was not provided. All queries must include a community_id.',
    );
  });

  it('is an instance of Error', () => {
    const error = new TenantContextMissing();
    expect(error).toBeInstanceOf(Error);
  });

  it('produces a proper stack trace', () => {
    const error = new TenantContextMissing();
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TenantContextMissing');
  });
});

import { describe, it, expect } from 'vitest';
import { checkRbac } from './rbac-check';

const base = { method: 'GET' as const, path: '/x', request: {}, response: { safeParse() {} } };

describe('checkRbac', () => {
  it('passes a real matrix pair', () => {
    expect(checkRbac({ ...base, permission: { resource: 'documents', action: 'read' } } as any))
      .toEqual({ status: 'ok' });
  });

  it('passes an allowlisted out-of-matrix pair', () => {
    expect(checkRbac({ ...base, permission: { resource: 'move_checklists', action: 'update' } } as any))
      .toEqual({ status: 'allowlisted' });
  });

  it('records inapplicable when no permission is declared', () => {
    expect(checkRbac(base as any)).toEqual({ status: 'inapplicable' });
  });

  it('FAILS a bogus resource not in the matrix or allowlist', () => {
    const r = checkRbac({ ...base, permission: { resource: 'definitely_not_real', action: 'read' } } as any);
    expect(r.status).toBe('fail');
    if (r.status === 'fail') {
      expect(r.message).toContain('definitely_not_real');
      expect(r.message).toContain('read');
    }
  });

  it('FAILS a matrix resource paired with an unknown action', () => {
    const r = checkRbac({ ...base, permission: { resource: 'documents', action: 'frobnicate' } } as any);
    expect(r.status).toBe('fail');
  });

  it('FAILS an allowlist resource paired with an unrecognized action', () => {
    const r = checkRbac({ ...base, permission: { resource: 'communities', action: 'frobnicate' } } as any);
    expect(r.status).toBe('fail');
  });
});

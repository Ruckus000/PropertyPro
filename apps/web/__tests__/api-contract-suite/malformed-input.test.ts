import { describe, it, expect } from 'vitest';
import { z } from '@propertypro/api-contract';
import { synthesizeRejected } from './malformed-input';

describe('synthesizeRejected', () => {
  it('rejects a malformed body object (null breaks an object schema)', () => {
    const schema = z.object({ communityId: z.number().int().positive() });
    const r = synthesizeRejected(schema, 'body');
    expect(r.ok).toBe(true);
    if (r.ok) expect(schema.safeParse(r.value).success).toBe(false);
  });

  it('rejects a malformed query via a NON-NUMERIC STRING (coercion fails)', () => {
    const schema = z.object({ communityId: z.coerce.number().int().positive() });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // value must be an object whose field is a STRING (reachable via the runner)
      const v = r.value as Record<string, unknown>;
      const onlyVal = Object.values(v)[0];
      if (onlyVal !== undefined) expect(typeof onlyVal).toBe('string');
      expect(schema.safeParse(r.value).success).toBe(false);
    }
  });

  it('covers a required string field via missing-required {} (empty `?q=` is collapsed to undefined, so OMITTING q is the reachable malformation)', () => {
    const schema = z.object({ q: z.string().min(1) });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it('models missing-required via {} when no field value can be broken', () => {
    // communityId is a free string (permissive) but REQUIRED — {} rejects it.
    const schema = z.object({ communityId: z.string() });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it('classifies z.unknown() as permissive', () => {
    const r = synthesizeRejected(z.unknown(), 'body');
    expect(r).toEqual({ ok: false, reason: 'permissive' });
  });

  it('classifies an all-optional object as permissive (nothing required, nothing breakable by string)', () => {
    const schema = z.object({ cursor: z.string().optional(), note: z.string().optional() });
    const r = synthesizeRejected(schema, 'query');
    expect(r).toEqual({ ok: false, reason: 'permissive' });
  });
});

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formatZodErrors } from '../../src/lib/api/zod/error-formatter';

describe('formatZodErrors', () => {
  it('formats simple field validation error', () => {
    const schema = z.object({
      email: z.string().email(),
    });

    const result = schema.safeParse({ email: 'not-an-email' });
    if (result.success) throw new Error('Expected validation to fail');

    const errors = formatZodErrors(result.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('email');
    expect(errors[0]!.message).toBeDefined();
    expect(typeof errors[0]!.message).toBe('string');
  });

  it('formats nested object validation errors with dot notation', () => {
    const schema = z.object({
      address: z.object({
        zipCode: z.string().min(5),
      }),
    });

    const result = schema.safeParse({ address: { zipCode: '12' } });
    if (result.success) throw new Error('Expected validation to fail');

    const errors = formatZodErrors(result.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('address.zipCode');
  });

  it('formats array field validation errors', () => {
    const schema = z.object({
      items: z.array(
        z.object({
          name: z.string().min(1),
        }),
      ),
    });

    const result = schema.safeParse({ items: [{ name: '' }] });
    if (result.success) throw new Error('Expected validation to fail');

    const errors = formatZodErrors(result.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('items.0.name');
  });

  it('handles multiple errors', () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });

    const result = schema.safeParse({ name: '', email: 'bad' });
    if (result.success) throw new Error('Expected validation to fail');

    const errors = formatZodErrors(result.error);
    expect(errors.length).toBeGreaterThanOrEqual(2);

    const fields = errors.map((e) => e.field);
    expect(fields).toContain('name');
    expect(fields).toContain('email');
  });

  it('uses _root for root-level errors', () => {
    const schema = z.string().min(5);

    const result = schema.safeParse('ab');
    if (result.success) throw new Error('Expected validation to fail');

    const errors = formatZodErrors(result.error);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('_root');
  });
});

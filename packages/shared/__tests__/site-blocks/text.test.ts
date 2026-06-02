import { describe, it, expect } from 'vitest';
import { textBlockSchema, type TextBlockContent } from '../../src/site-blocks/text';

describe('textBlockSchema', () => {
  const valid: TextBlockContent = {
    heading: 'About Our Community',
    body: 'We are a 412-residence association on the gulf coast.',
  };

  it('accepts a valid text block', () => {
    expect(textBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a text block without heading', () => {
    const result = textBlockSchema.safeParse({ body: 'Just the body.' });
    expect(result.success).toBe(true);
  });

  it('rejects when body is missing', () => {
    const result = textBlockSchema.safeParse({ heading: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects when body is empty', () => {
    const result = textBlockSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when body exceeds 2000 chars', () => {
    const result = textBlockSchema.safeParse({ body: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects when heading exceeds 120 chars', () => {
    const result = textBlockSchema.safeParse({ ...valid, heading: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = textBlockSchema.safeParse({ ...valid, htmlBody: '<script>alert(1)</script>' });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { documentsBlockSchema, type DocumentsBlockContent } from '../../src/site-blocks/documents';

describe('documentsBlockSchema', () => {
  it('accepts an empty config (defaults apply)', () => {
    const result = documentsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });

  it('accepts a limit of 1', () => {
    expect(documentsBlockSchema.safeParse({ limit: 1 }).success).toBe(true);
  });

  it('accepts a limit of 20', () => {
    expect(documentsBlockSchema.safeParse({ limit: 20 }).success).toBe(true);
  });

  it('rejects a limit of 0', () => {
    expect(documentsBlockSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects a limit of 21', () => {
    expect(documentsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(documentsBlockSchema.safeParse({ limit: 5.5 }).success).toBe(false);
  });

  it('accepts an empty includeCategories array', () => {
    expect(documentsBlockSchema.safeParse({ includeCategories: [] }).success).toBe(true);
  });

  it('accepts known category names', () => {
    const config: DocumentsBlockContent = {
      limit: 5,
      includeCategories: ['budget', 'minutes', 'financial', 'rules', 'other'],
    };
    expect(documentsBlockSchema.safeParse(config).success).toBe(true);
  });

  it('rejects unknown category names', () => {
    const result = documentsBlockSchema.safeParse({ includeCategories: ['budgett'] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = documentsBlockSchema.safeParse({ communityId: 1 });
    expect(result.success).toBe(false);
  });
});

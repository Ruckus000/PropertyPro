import { describe, it, expect } from 'vitest';
import { contactBlockSchema } from '../../src/site-blocks/contact';

describe('contactBlockSchema', () => {
  it('defaults to showBoard:true and showManagement:true', () => {
    const result = contactBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showBoard).toBe(true);
      expect(result.data.showManagement).toBe(true);
    }
  });

  it('accepts both flags false (renders nothing, but valid config)', () => {
    expect(contactBlockSchema.safeParse({ showBoard: false, showManagement: false }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(contactBlockSchema.safeParse({ showBoard: true, includeOwners: true }).success).toBe(false);
  });
});

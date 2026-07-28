import { describe, it, expect } from 'vitest';
import { meetingsBlockSchema } from '../../src/site-blocks/meetings';

describe('meetingsBlockSchema', () => {
  it('defaults limit to 10 and timeWindowDays to 30', () => {
    const result = meetingsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.timeWindowDays).toBe(30);
    }
  });

  it('accepts limit 1-20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ limit: 20 }).success).toBe(true);
  });

  it('rejects limit > 20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('accepts timeWindowDays 1-365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 365 }).success).toBe(true);
  });

  it('rejects timeWindowDays > 365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 366 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(meetingsBlockSchema.safeParse({ includeCancelled: true }).success).toBe(false);
  });
});

describe('meetings block — empty text override', () => {
  it('accepts a custom empty-state message', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: 'Nothing here right now.' }).success).toBe(true);
  });

  it('accepts content with none — the renderer keeps its built-in copy', () => {
    expect(meetingsBlockSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty string rather than rendering a blank empty state', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: '' }).success).toBe(false);
  });

  it('rejects an over-long message', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: 'a'.repeat(201) }).success).toBe(false);
  });
});

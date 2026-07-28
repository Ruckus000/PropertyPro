import { describe, it, expect } from 'vitest';
import { announcementsBlockSchema } from '../../src/site-blocks/announcements';

describe('announcementsBlockSchema', () => {
  it('defaults to limit 5, timeWindowDays 30', () => {
    const result = announcementsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
      expect(result.data.timeWindowDays).toBe(30);
    }
  });

  it('rejects limit 0', () => {
    expect(announcementsBlockSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit 21', () => {
    expect(announcementsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('rejects timeWindowDays 0', () => {
    expect(announcementsBlockSchema.safeParse({ timeWindowDays: 0 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(announcementsBlockSchema.safeParse({ pinnedOnly: true }).success).toBe(false);
  });
});

describe('announcements block — empty text override', () => {
  it('accepts a custom empty-state message', () => {
    expect(announcementsBlockSchema.safeParse({ emptyText: 'Nothing here right now.' }).success).toBe(true);
  });

  it('accepts content with none — the renderer keeps its built-in copy', () => {
    expect(announcementsBlockSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty string rather than rendering a blank empty state', () => {
    expect(announcementsBlockSchema.safeParse({ emptyText: '' }).success).toBe(false);
  });

  it('rejects an over-long message', () => {
    expect(announcementsBlockSchema.safeParse({ emptyText: 'a'.repeat(201) }).success).toBe(false);
  });
});

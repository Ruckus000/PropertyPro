import { describe, it, expect } from 'vitest';
import { amenitiesBlockSchema, type AmenitiesBlockContent } from '../../src/site-blocks/amenities';

describe('amenitiesBlockSchema', () => {
  const valid: AmenitiesBlockContent = {
    heading: 'Community Amenities',
    items: [
      { name: 'Heated Pool', description: 'Open 6am–10pm, year-round.' },
      { name: 'Fitness Center' },
    ],
  };

  it('accepts a minimally valid amenities block (one item, name only)', () => {
    const minimal = { items: [{ name: 'Pool' }] };
    expect(amenitiesBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a fully-populated amenities block', () => {
    expect(amenitiesBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when items is missing', () => {
    const { items: _items, ...withoutItems } = valid;
    expect(amenitiesBlockSchema.safeParse(withoutItems).success).toBe(false);
  });

  it('rejects an empty items array', () => {
    expect(amenitiesBlockSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });

  it('rejects more than 30 items', () => {
    const items = Array.from({ length: 31 }, (_, i) => ({ name: `Amenity ${i}` }));
    expect(amenitiesBlockSchema.safeParse({ items }).success).toBe(false);
  });

  it('accepts exactly 30 items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ name: `Amenity ${i}` }));
    expect(amenitiesBlockSchema.safeParse({ items }).success).toBe(true);
  });

  it('rejects an item with an empty name', () => {
    expect(amenitiesBlockSchema.safeParse({ items: [{ name: '' }] }).success).toBe(false);
  });

  it('rejects a name longer than 80 chars', () => {
    expect(amenitiesBlockSchema.safeParse({ items: [{ name: 'a'.repeat(81) }] }).success).toBe(false);
  });

  it('rejects a description longer than 280 chars', () => {
    expect(
      amenitiesBlockSchema.safeParse({ items: [{ name: 'Pool', description: 'a'.repeat(281) }] })
        .success,
    ).toBe(false);
  });

  it('rejects an empty description (use omit instead)', () => {
    expect(
      amenitiesBlockSchema.safeParse({ items: [{ name: 'Pool', description: '' }] }).success,
    ).toBe(false);
  });

  it('rejects a heading longer than 120 chars', () => {
    expect(amenitiesBlockSchema.safeParse({ ...valid, heading: 'a'.repeat(121) }).success).toBe(
      false,
    );
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(amenitiesBlockSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects unknown keys inside an item (strict)', () => {
    expect(
      amenitiesBlockSchema.safeParse({ items: [{ name: 'Pool', icon: 'x' }] }).success,
    ).toBe(false);
  });
});
